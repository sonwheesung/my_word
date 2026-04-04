import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { MaterialIcons } from '@expo/vector-icons';
import * as Speech from 'expo-speech';
import { wordService } from '../services/wordService';
import { quizService } from '../services/quizService';
import { useInterstitialAd } from '../hooks/useInterstitialAd';
import type { Word } from '../types/word';
import { useTheme } from '../contexts/ThemeContext';

export type QuizMode = 'random' | 'recent' | 'weak' | 'mixed';
type QuizAnswerType = 'subjective' | 'multiple_choice';

type QuizType = 'word_to_meaning' | 'meaning_to_word' | 'example_to_meaning' | 'translation_to_example';

interface QuizQuestion {
  word: Word;
  quizType: QuizType;
  question: string;
  correctAnswer: string;
  choices?: string[]; // 객관식 보기 (4개)
}

interface QuizResult {
  wordId: number;
  isCorrect: boolean;
  quizType: string;
  answerType?: string;
  word?: string;
  correctAnswer?: string;
  userAnswer?: string;
}

type QuizDirection = 'word_to_meaning' | 'meaning_to_word';

interface QuizScreenProps {
  categoryId: number;
  mode: QuizMode;
  wordCount: number;
  direction: QuizDirection;
  answerType: QuizAnswerType;
  retryWordIds?: number[];
  onComplete: (results: QuizResult[]) => void;
  onExit: () => void;
}

export default function QuizScreen({ categoryId, mode, wordCount, direction, answerType, retryWordIds, onComplete, onExit }: QuizScreenProps) {
  const { colors } = useTheme();
  const [loading, setLoading] = useState(true);
  const [allWords, setAllWords] = useState<Word[]>([]); // 보기 생성용 전체 단어
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [userAnswer, setUserAnswer] = useState('');
  const [selectedChoice, setSelectedChoice] = useState<string | null>(null); // 객관식 선택
  const [results, setResults] = useState<QuizResult[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [feedback, setFeedback] = useState<{ isCorrect: boolean; correctAnswer: string } | null>(null);
  const isMultipleChoice = answerType === 'multiple_choice';
  const { showAd } = useInterstitialAd();

  // 퀴즈 시작 전 전면 광고 표시
  useEffect(() => {
    const timer = setTimeout(() => {
      showAd();
    }, 300);
    return () => clearTimeout(timer);
  }, [showAd]);

  useEffect(() => {
    loadQuestions();
  }, []);

  const loadQuestions = async () => {
    try {
      setLoading(true);
      const words = await wordService.getWords(categoryId);
      setAllWords(words);

      if (words.length === 0) {
        Alert.alert('알림', '등록된 단어가 없습니다');
        onExit();
        return;
      }

      let selectedWords: Word[] = [];

      // retryWordIds가 있으면 해당 단어만 선택
      if (retryWordIds && retryWordIds.length > 0) {
        selectedWords = words.filter(w => retryWordIds.includes(w.wordId));
        if (selectedWords.length === 0) {
          Alert.alert('알림', '해당 단어를 찾을 수 없습니다');
          onExit();
          return;
        }
      } else if (mode === 'random') {
        selectedWords = shuffleArray([...words]).slice(0, Math.min(wordCount, words.length));
      } else if (mode === 'recent') {
        selectedWords = [...words]
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
          .slice(0, Math.min(wordCount, words.length));
      } else if (mode === 'weak') {
        const weakWordIds = await quizService.getWeakWordIds(wordCount);
        if (weakWordIds.length === 0) {
          selectedWords = shuffleArray([...words]).slice(0, Math.min(wordCount, words.length));
        } else {
          selectedWords = words.filter(w => weakWordIds.includes(w.wordId)).slice(0, wordCount);
          if (selectedWords.length < wordCount) {
            const remaining = words.filter(w => !weakWordIds.includes(w.wordId));
            const needed = wordCount - selectedWords.length;
            selectedWords = [...selectedWords, ...shuffleArray(remaining).slice(0, needed)];
          }
        }
      } else if (mode === 'mixed') {
        selectedWords = shuffleArray([...words]).slice(0, Math.min(wordCount, words.length));
      }

      // 빈 뜻을 가진 단어 필터링
      selectedWords = selectedWords.filter(w =>
        w.meanings.length > 0 && w.meanings.some(m => m.trim() !== '')
      );

      if (selectedWords.length === 0) {
        Alert.alert('알림', '유효한 단어가 없습니다.\n뜻이 입력된 단어를 추가해주세요.');
        onExit();
        return;
      }

      // 퀴즈 질문 생성
      const quizQuestions = selectedWords.map(word => {
        let quizType: QuizType;

        if (mode === 'mixed') {
          if (isMultipleChoice) {
            // 객관식 + mixed: word_to_meaning / meaning_to_word만
            quizType = Math.random() < 0.5 ? 'word_to_meaning' : 'meaning_to_word';
          } else {
            const rand = Math.random();
            if (rand < 0.3) {
              quizType = 'word_to_meaning';
            } else if (rand < 0.6) {
              quizType = 'meaning_to_word';
            } else if (rand < 0.8 && word.examples && word.examples.length > 0) {
              quizType = 'example_to_meaning';
            } else if (rand < 1.0 && word.examples && word.examples.length > 0 && word.examples.some(e => e.translation)) {
              quizType = 'translation_to_example';
            } else {
              quizType = 'word_to_meaning';
            }
          }
        } else {
          quizType = direction;
        }

        const question = generateQuestion(word, quizType);

        // 객관식: 보기 생성
        if (isMultipleChoice) {
          question.choices = generateChoices(question, words);
        }

        return question;
      });

      setQuestions(quizQuestions);
    } catch (error: any) {
      console.warn('퀴즈 로딩 실패:', error);
      Alert.alert('오류', error.message || '퀴즈를 불러오는데 실패했습니다');
      onExit();
    } finally {
      setLoading(false);
    }
  };

  const generateQuestion = (word: Word, quizType: QuizType): QuizQuestion => {
    let question = '';
    let correctAnswer = '';

    const firstMeaning = word.meanings.find(m => m.trim() !== '') ?? '';

    switch (quizType) {
      case 'word_to_meaning':
        question = word.word;
        correctAnswer = firstMeaning;
        break;
      case 'meaning_to_word':
        question = firstMeaning;
        correctAnswer = word.word;
        break;
      case 'example_to_meaning':
        if (word.examples && word.examples.length > 0) {
          const randomExample = word.examples[Math.floor(Math.random() * word.examples.length)];
          question = randomExample.example;
          correctAnswer = firstMeaning;
        } else {
          question = word.word;
          correctAnswer = firstMeaning;
          quizType = 'word_to_meaning';
        }
        break;
      case 'translation_to_example':
        if (word.examples && word.examples.length > 0) {
          const examplesWithTranslation = word.examples.filter(e => e.translation && e.translation.trim() !== '');
          if (examplesWithTranslation.length > 0) {
            const randomExample = examplesWithTranslation[Math.floor(Math.random() * examplesWithTranslation.length)];
            question = randomExample.translation || '';
            correctAnswer = randomExample.example;
          } else {
            question = word.word;
            correctAnswer = firstMeaning;
            quizType = 'word_to_meaning';
          }
        } else {
          question = word.word;
          correctAnswer = firstMeaning;
          quizType = 'word_to_meaning';
        }
        break;
    }

    return { word, quizType, question, correctAnswer };
  };

  const generateChoices = (question: QuizQuestion, categoryWords: Word[]): string[] => {
    const correct = question.correctAnswer;
    const isAnswerMeaning = question.quizType === 'word_to_meaning' || question.quizType === 'example_to_meaning';

    // 오답 후보 수집
    const candidates: string[] = [];
    for (const w of categoryWords) {
      if (w.wordId === question.word.wordId) continue;
      if (isAnswerMeaning) {
        const meaning = w.meanings.find(m => m.trim() !== '');
        if (meaning && normalizeString(meaning) !== normalizeString(correct)) {
          candidates.push(meaning);
        }
      } else {
        if (normalizeString(w.word) !== normalizeString(correct)) {
          candidates.push(w.word);
        }
      }
    }

    // 중복 제거
    const uniqueCandidates = [...new Set(candidates.map(c => c.trim()))];
    const shuffled = shuffleArray(uniqueCandidates);
    const wrongAnswers = shuffled.slice(0, 3);

    // 보기가 3개 미만이면 더미 추가
    const DUMMY_MEANINGS = ['기억나지 않음', '해당 없음', '모르겠음'];
    const DUMMY_WORDS = ['unknown', 'none', 'skip'];
    while (wrongAnswers.length < 3) {
      const dummies = isAnswerMeaning ? DUMMY_MEANINGS : DUMMY_WORDS;
      const dummy = dummies[wrongAnswers.length];
      if (dummy && !wrongAnswers.includes(dummy)) {
        wrongAnswers.push(dummy);
      } else {
        break;
      }
    }

    // 정답 포함하여 셔플
    const choices = shuffleArray([correct, ...wrongAnswers]);
    return choices;
  };

  const shuffleArray = <T,>(array: T[]): T[] => {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  };

  const normalizeString = (str: string): string => {
    return str.trim().toLowerCase();
  };

  const checkAnswer = (): boolean => {
    const currentQuestion = questions[currentIndex];
    const normalizedAnswer = normalizeString(userAnswer);

    switch (currentQuestion.quizType) {
      case 'word_to_meaning':
      case 'example_to_meaning':
        return currentQuestion.word.meanings.some(meaning =>
          normalizeString(meaning) === normalizedAnswer
        );
      case 'meaning_to_word':
        return normalizeString(currentQuestion.correctAnswer) === normalizedAnswer;
      case 'translation_to_example': {
        const normalizedCorrect = normalizeString(currentQuestion.correctAnswer);
        // 정확히 일치하면 무조건 정답
        if (normalizedAnswer === normalizedCorrect) return true;
        // 부분 매칭은 최소 길이 요구: 정답 길이의 40% 이상
        const minLength = Math.max(3, Math.floor(normalizedCorrect.length * 0.4));
        if (normalizedAnswer.length < minLength) return false;
        return normalizedCorrect.includes(normalizedAnswer) ||
               normalizedAnswer.includes(normalizedCorrect);
      }
      default:
        return false;
    }
  };

  const handleSubmit = async () => {
    if (isSubmitting) return;

    if (!userAnswer.trim()) {
      Alert.alert('알림', '답을 입력해주세요');
      return;
    }

    submitAnswer(userAnswer.trim(), checkAnswer());
  };

  const handleChoiceSelect = (choice: string) => {
    if (isSubmitting) return;

    setSelectedChoice(choice);
    const currentQuestion = questions[currentIndex];
    const isCorrect = normalizeString(choice) === normalizeString(currentQuestion.correctAnswer);

    submitAnswer(choice, isCorrect);
  };

  const submitAnswer = (answer: string, isCorrect: boolean) => {
    setIsSubmitting(true);

    const currentQuestion = questions[currentIndex];

    const newResult: QuizResult = {
      wordId: currentQuestion.word.wordId,
      isCorrect,
      quizType: currentQuestion.quizType,
      answerType,
      word: currentQuestion.question,
      correctAnswer: currentQuestion.correctAnswer,
      userAnswer: answer,
    };

    const updatedResults = [...results, newResult];
    setResults(updatedResults);

    // 정답/오답 피드백 표시
    setFeedback({ isCorrect, correctAnswer: currentQuestion.correctAnswer });

    setTimeout(async () => {
      setFeedback(null);

      if (currentIndex + 1 < questions.length) {
        setCurrentIndex(currentIndex + 1);
        setUserAnswer('');
        setSelectedChoice(null);
        setShowHint(false);
        setIsSubmitting(false);
      } else {
        setIsSubmitting(false);
        try {
          await quizService.saveQuizResults(updatedResults);
        } catch (error) {
          console.warn('퀴즈 결과 저장 실패:', error);
        }
        onComplete(updatedResults);
      }
    }, 1500);
  };

  const speakWord = (text: string) => {
    Speech.speak(text, { language: 'en-US', rate: 0.85 });
  };

  const handleExit = () => {
    Alert.alert(
      '퀴즈 종료',
      '퀴즈를 종료하시겠습니까?\n진행 중인 결과는 저장되지 않습니다.',
      [
        { text: '취소', style: 'cancel' },
        { text: '종료', style: 'destructive', onPress: onExit },
      ]
    );
  };

  const getHint = (question: QuizQuestion): string => {
    const answer = question.correctAnswer;
    if (!answer) return '';
    const trimmed = answer.trim();
    // 3글자 이하 정답은 첫 글자 노출하면 정답이 드러나므로 글자 수만 표시
    if (trimmed.length <= 3) {
      return `힌트: ${trimmed.length}자`;
    }
    const words = trimmed.split(/\s+/);
    if (words.length > 2) {
      return `${trimmed.charAt(0)}... (${words.length}단어, ${trimmed.length}자)`;
    }
    return `${trimmed.charAt(0)}... (${trimmed.length}자)`;
  };

  // 질문이 영어(단어/예문)인 퀴즈 타입에서만 발음 버튼 표시
  const canSpeak = (quizType: QuizType): boolean => {
    return quizType === 'word_to_meaning' || quizType === 'example_to_meaning';
  };

  const getQuizTypeLabel = (quizType: QuizType): string => {
    switch (quizType) {
      case 'word_to_meaning':
        return '단어의 뜻을 입력하세요';
      case 'meaning_to_word':
        return '뜻에 해당하는 단어를 입력하세요';
      case 'example_to_meaning':
        return '예문의 뜻을 입력하세요';
      case 'translation_to_example':
        return '번역에 해당하는 예문을 입력하세요';
      default:
        return '답을 입력하세요';
    }
  };

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={[styles.loadingText, { color: colors.textSecondary }]}>퀴즈 준비 중...</Text>
      </View>
    );
  }

  if (questions.length === 0) {
    return (
      <View style={[styles.emptyContainer, { backgroundColor: colors.background }]}>
        <StatusBar style={colors.isDark ? 'light' : 'dark'} />
        <MaterialIcons name="edit-note" size={64} color={colors.textTertiary} />
        <Text style={[styles.emptyTitle, { color: colors.text }]}>퀴즈를 시작할 수 없습니다</Text>
        <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>등록된 단어가 없습니다</Text>
        <TouchableOpacity style={[styles.emptyBackButton, { backgroundColor: colors.border }]} onPress={onExit}>
          <Text style={[styles.emptyBackButtonText, { color: colors.textSecondary }]}>돌아가기</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const currentQuestion = questions[currentIndex];
  const progress = `${currentIndex + 1} / ${questions.length}`;

  // 답이 한국어(뜻)인 유형인지 판별
  const isKoreanAnswer = currentQuestion.quizType === 'word_to_meaning' || currentQuestion.quizType === 'example_to_meaning';

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style={colors.isDark ? 'light' : 'dark'} />

      {/* 진행 상태 */}
      <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={handleExit} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <MaterialIcons name="close" size={18} color={colors.textSecondary} />
              <Text style={[styles.exitText, { color: colors.textSecondary }]}>나가기</Text>
            </View>
          </TouchableOpacity>
          <Text style={[styles.progressText, { color: colors.accent }]}>{progress}</Text>
          <View style={{ width: 64 }} />
        </View>
        <View style={[styles.progressBar, { backgroundColor: colors.border }]}>
          <View
            style={[
              styles.progressFill,
              { width: `${((currentIndex + 1) / questions.length) * 100}%`, backgroundColor: colors.accent }
            ]}
          />
        </View>
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {/* 질문 */}
        <View style={[styles.questionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.questionLabel, { color: colors.textSecondary }]}>{getQuizTypeLabel(currentQuestion.quizType)}</Text>
          <View style={styles.questionRow}>
            <Text style={[styles.questionText, { color: colors.text }]}>{currentQuestion.question}</Text>
            {canSpeak(currentQuestion.quizType) && (
              <TouchableOpacity
                style={[styles.speakButton, { backgroundColor: colors.primaryLight }]}
                onPress={() => speakWord(currentQuestion.question)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <MaterialIcons name="volume-up" size={22} color={colors.primary} />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* 힌트 */}
        {!showHint ? (
          <TouchableOpacity style={styles.hintButton} onPress={() => setShowHint(true)}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <MaterialIcons name="lightbulb-outline" size={18} color="#8B5CF6" />
              <Text style={styles.hintButtonText}> 힌트 보기</Text>
            </View>
          </TouchableOpacity>
        ) : (
          <View style={styles.hintBox}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <MaterialIcons name="lightbulb-outline" size={18} color="#92400E" />
              <Text style={styles.hintText}> {getHint(currentQuestion)}</Text>
            </View>
          </View>
        )}

        {/* 답변 입력 */}
        {isMultipleChoice && currentQuestion.choices ? (
          <View style={styles.choicesSection}>
            {currentQuestion.choices.map((choice, idx) => {
              const isSelected = selectedChoice === choice;
              const isCorrectChoice = feedback && normalizeString(choice) === normalizeString(currentQuestion.correctAnswer);
              const isWrongSelected = feedback && isSelected && !feedback.isCorrect;

              return (
                <TouchableOpacity
                  key={idx}
                  style={[
                    styles.choiceButton,
                    { backgroundColor: colors.card, borderColor: colors.border },
                    isCorrectChoice && styles.choiceCorrect,
                    isWrongSelected && styles.choiceWrong,
                    isSelected && !feedback && { borderColor: colors.accent, backgroundColor: colors.primaryLight },
                  ]}
                  onPress={() => handleChoiceSelect(choice)}
                  disabled={isSubmitting}
                >
                  <Text style={[styles.choiceNumber, { backgroundColor: colors.borderLight, color: colors.textSecondary }]}>{String.fromCharCode(65 + idx)}</Text>
                  <Text style={[
                    styles.choiceText,
                    { color: colors.text },
                    isCorrectChoice && styles.choiceTextCorrect,
                    isWrongSelected && styles.choiceTextWrong,
                  ]}>
                    {choice}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        ) : (
          <View style={styles.answerSection}>
            <Text style={[styles.answerLabel, { color: colors.textSecondary }]}>답</Text>
            <TextInput
              style={[styles.answerInput, { backgroundColor: colors.card, borderColor: colors.border, color: colors.text }]}
              placeholder={isKoreanAnswer ? '뜻을 입력하세요' : '단어를 입력하세요'}
              value={userAnswer}
              onChangeText={setUserAnswer}
              autoFocus
              autoCorrect={isKoreanAnswer}
              autoCapitalize={isKoreanAnswer ? 'sentences' : 'none'}
              inputMode={isKoreanAnswer ? 'text' : 'text'}
              returnKeyType={currentQuestion.quizType === 'translation_to_example' ? 'default' : 'done'}
              onSubmitEditing={currentQuestion.quizType !== 'translation_to_example' ? handleSubmit : undefined}
              editable={!isSubmitting}
              multiline={currentQuestion.quizType === 'translation_to_example'}
              maxLength={300}
            />
          </View>
        )}

        {/* 정답/오답 피드백 */}
        {feedback && (
          <View style={[
            styles.feedbackBox,
            feedback.isCorrect ? styles.feedbackCorrect : styles.feedbackWrong,
          ]}>
            <Text style={[
              styles.feedbackText,
              feedback.isCorrect ? styles.feedbackTextCorrect : styles.feedbackTextWrong,
            ]}>
              {feedback.isCorrect ? '정답!' : '오답'}
            </Text>
            {!feedback.isCorrect && (
              <Text style={styles.feedbackCorrectAnswer}>
                정답: {feedback.correctAnswer}
              </Text>
            )}
          </View>
        )}

        {/* 제출 버튼 (주관식만) */}
        {!isMultipleChoice && (
          <TouchableOpacity
            style={[styles.submitButton, { backgroundColor: colors.accent }, isSubmitting && styles.submitButtonDisabled]}
            onPress={handleSubmit}
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.submitButtonText}>
                {currentIndex + 1 < questions.length ? '다음' : '완료'}
              </Text>
            )}
          </TouchableOpacity>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#F8F9FA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#6B7280',
  },
  emptyContainer: {
    flex: 1,
    backgroundColor: '#F8F9FA',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1A1A1A',
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 24,
  },
  emptyBackButton: {
    backgroundColor: '#E5E7EB',
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  emptyBackButtonText: {
    color: '#374151',
    fontSize: 16,
    fontWeight: '600',
  },
  header: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingTop: 48,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  exitText: {
    fontSize: 14,
    color: '#6B7280',
    fontWeight: '600',
  },
  progressText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#C4B5FD',
    textAlign: 'center',
  },
  progressBar: {
    height: 6,
    backgroundColor: '#E5E7EB',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#C4B5FD',
    borderRadius: 3,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  questionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 24,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  questionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
    marginBottom: 12,
  },
  questionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  questionText: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#1A1A1A',
    lineHeight: 32,
    flex: 1,
  },
  speakButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#EDE9FE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  speakButtonText: {
    fontSize: 20,
  },
  hintButton: {
    alignSelf: 'flex-start',
    paddingVertical: 8,
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  hintButtonText: {
    fontSize: 14,
    color: '#8B5CF6',
    fontWeight: '600',
  },
  hintBox: {
    backgroundColor: '#FEF3C7',
    borderRadius: 16,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  hintText: {
    fontSize: 15,
    color: '#92400E',
    fontWeight: '600',
  },
  answerSection: {
    marginBottom: 24,
  },
  answerLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  answerInput: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 16,
    padding: 14,
    fontSize: 16,
    color: '#1A1A1A',
    minHeight: 50,
  },
  submitButton: {
    backgroundColor: '#C4B5FD',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  feedbackBox: {
    borderRadius: 20,
    padding: 16,
    marginBottom: 16,
    alignItems: 'center',
  },
  feedbackCorrect: {
    backgroundColor: '#D1FAE5',
    borderWidth: 1,
    borderColor: '#6EE7B7',
  },
  feedbackWrong: {
    backgroundColor: '#FEE2E2',
    borderWidth: 1,
    borderColor: '#FCA5A5',
  },
  feedbackText: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  feedbackTextCorrect: {
    color: '#065F46',
  },
  feedbackTextWrong: {
    color: '#991B1B',
  },
  feedbackCorrectAnswer: {
    fontSize: 15,
    color: '#991B1B',
    marginTop: 8,
  },
  // 객관식 스타일
  choicesSection: {
    marginBottom: 24,
    gap: 10,
  },
  choiceButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#E5E7EB',
    borderRadius: 16,
    padding: 16,
  },
  choiceSelected: {
    borderColor: '#C4B5FD',
    backgroundColor: '#F5F3FF',
  },
  choiceCorrect: {
    borderColor: '#10B981',
    backgroundColor: '#D1FAE5',
  },
  choiceWrong: {
    borderColor: '#EF4444',
    backgroundColor: '#FEE2E2',
  },
  choiceNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#F3F4F6',
    textAlign: 'center',
    lineHeight: 28,
    fontSize: 14,
    fontWeight: 'bold',
    color: '#6B7280',
    marginRight: 12,
    overflow: 'hidden',
  },
  choiceText: {
    fontSize: 16,
    color: '#1A1A1A',
    flex: 1,
  },
  choiceTextCorrect: {
    color: '#065F46',
    fontWeight: '600',
  },
  choiceTextWrong: {
    color: '#991B1B',
    fontWeight: '600',
  },
});
