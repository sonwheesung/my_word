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
import { wordService } from '../services/wordService';
import { quizService } from '../services/quizService';
import type { Word } from '../types/word';

export type QuizMode = 'random' | 'recent' | 'weak' | 'mixed';

type QuizType = 'word_to_meaning' | 'meaning_to_word' | 'example_to_meaning' | 'translation_to_example';

interface QuizQuestion {
  word: Word;
  quizType: QuizType;
  question: string;
  correctAnswer: string;
}

interface QuizResult {
  wordId: number;
  isCorrect: boolean;
  quizType: string;
  word?: string;
  correctAnswer?: string;
  userAnswer?: string;
}

interface QuizScreenProps {
  categoryId: number;
  mode: QuizMode;
  wordCount: number;
  onComplete: (results: QuizResult[]) => void;
}

export default function QuizScreen({ categoryId, mode, wordCount, onComplete }: QuizScreenProps) {
  const [loading, setLoading] = useState(true);
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [userAnswer, setUserAnswer] = useState('');
  const [results, setResults] = useState<QuizResult[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    loadQuestions();
  }, []);

  const loadQuestions = async () => {
    try {
      setLoading(true);
      const words = await wordService.getWords(categoryId);

      if (words.length === 0) {
        Alert.alert('알림', '등록된 단어가 없습니다');
        onComplete([]);
        return;
      }

      let selectedWords: Word[] = [];

      // 모드에 따라 단어 선택
      if (mode === 'random') {
        selectedWords = shuffleArray([...words]).slice(0, Math.min(wordCount, words.length));
      } else if (mode === 'recent') {
        selectedWords = [...words]
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
          .slice(0, Math.min(wordCount, words.length));
      } else if (mode === 'weak') {
        const weakWordIds = await quizService.getWeakWordIds(wordCount);
        if (weakWordIds.length === 0) {
          // 취약 단어가 없으면 랜덤으로
          selectedWords = shuffleArray([...words]).slice(0, Math.min(wordCount, words.length));
        } else {
          selectedWords = words.filter(w => weakWordIds.includes(w.wordId)).slice(0, wordCount);
          // 부족하면 랜덤으로 채움
          if (selectedWords.length < wordCount) {
            const remaining = words.filter(w => !weakWordIds.includes(w.wordId));
            const needed = wordCount - selectedWords.length;
            selectedWords = [...selectedWords, ...shuffleArray(remaining).slice(0, needed)];
          }
        }
      } else if (mode === 'mixed') {
        selectedWords = shuffleArray([...words]).slice(0, Math.min(wordCount, words.length));
      }

      // 퀴즈 질문 생성
      const quizQuestions = selectedWords.map(word => {
        let quizType: QuizType;

        if (mode === 'mixed') {
          // 여러 형태 모드: 30% word→meaning, 30% meaning→word, 20% example, 20% translation
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
        } else {
          // 다른 모드는 기본적으로 단어 -> 뜻
          quizType = 'word_to_meaning';
        }

        return generateQuestion(word, quizType);
      });

      setQuestions(quizQuestions);
    } catch (error: any) {
      console.error('퀴즈 로딩 실패:', error);
      Alert.alert('오류', error.message || '퀴즈를 불러오는데 실패했습니다');
      onComplete([]);
    } finally {
      setLoading(false);
    }
  };

  const generateQuestion = (word: Word, quizType: QuizType): QuizQuestion => {
    let question = '';
    let correctAnswer = '';

    switch (quizType) {
      case 'word_to_meaning':
        question = word.word;
        correctAnswer = word.meanings[0]; // 첫 번째 뜻을 정답으로
        break;
      case 'meaning_to_word':
        question = word.meanings[0];
        correctAnswer = word.word;
        break;
      case 'example_to_meaning':
        if (word.examples && word.examples.length > 0) {
          const randomExample = word.examples[Math.floor(Math.random() * word.examples.length)];
          question = randomExample.example;
          correctAnswer = word.meanings[0];
        } else {
          // 예문이 없으면 word_to_meaning으로 변경
          question = word.word;
          correctAnswer = word.meanings[0];
          quizType = 'word_to_meaning';
        }
        break;
      case 'translation_to_example':
        if (word.examples && word.examples.length > 0) {
          const examplesWithTranslation = word.examples.filter(e => e.translation);
          if (examplesWithTranslation.length > 0) {
            const randomExample = examplesWithTranslation[Math.floor(Math.random() * examplesWithTranslation.length)];
            question = randomExample.translation || '';
            correctAnswer = randomExample.example;
          } else {
            // 번역이 없으면 word_to_meaning으로 변경
            question = word.word;
            correctAnswer = word.meanings[0];
            quizType = 'word_to_meaning';
          }
        } else {
          // 예문이 없으면 word_to_meaning으로 변경
          question = word.word;
          correctAnswer = word.meanings[0];
          quizType = 'word_to_meaning';
        }
        break;
    }

    return { word, quizType, question, correctAnswer };
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
        // 의미 체크: 모든 meanings 중 하나라도 일치하면 정답
        return currentQuestion.word.meanings.some(meaning =>
          normalizeString(meaning) === normalizedAnswer
        );
      case 'meaning_to_word':
        // 단어 체크: 정확히 일치해야 함
        return normalizeString(currentQuestion.correctAnswer) === normalizedAnswer;
      case 'translation_to_example':
        // 예문 체크: 포함 여부 확인
        return normalizeString(currentQuestion.correctAnswer).includes(normalizedAnswer) ||
               normalizedAnswer.includes(normalizeString(currentQuestion.correctAnswer));
      default:
        return false;
    }
  };

  const handleSubmit = async () => {
    if (!userAnswer.trim()) {
      Alert.alert('알림', '답을 입력해주세요');
      return;
    }

    setIsSubmitting(true);

    const currentQuestion = questions[currentIndex];
    const isCorrect = checkAnswer();

    // 결과 저장
    const newResult: QuizResult = {
      wordId: currentQuestion.word.wordId,
      isCorrect,
      quizType: currentQuestion.quizType,
      word: currentQuestion.question,
      correctAnswer: currentQuestion.correctAnswer,
      userAnswer: userAnswer.trim(),
    };

    const updatedResults = [...results, newResult];
    setResults(updatedResults);

    // 다음 질문으로 이동
    if (currentIndex + 1 < questions.length) {
      setCurrentIndex(currentIndex + 1);
      setUserAnswer('');
      setIsSubmitting(false);
    } else {
      // 모든 질문 완료 - 백엔드에 결과 저장
      try {
        await quizService.saveQuizResults(updatedResults);
        console.log('퀴즈 결과 저장 성공');
      } catch (error) {
        console.error('퀴즈 결과 저장 실패:', error);
        // 저장 실패해도 결과 화면은 표시
      }
      onComplete(updatedResults);
    }
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
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#C4B5FD" />
        <Text style={styles.loadingText}>퀴즈 준비 중...</Text>
      </View>
    );
  }

  if (questions.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <StatusBar style="dark" />
        <Text style={styles.emptyIcon}>📝</Text>
        <Text style={styles.emptyTitle}>퀴즈를 시작할 수 없습니다</Text>
        <Text style={styles.emptySubtitle}>등록된 단어가 없습니다</Text>
      </View>
    );
  }

  const currentQuestion = questions[currentIndex];
  const progress = `${currentIndex + 1} / ${questions.length}`;

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />

      {/* 진행 상태 */}
      <View style={styles.header}>
        <Text style={styles.progressText}>{progress}</Text>
        <View style={styles.progressBar}>
          <View
            style={[
              styles.progressFill,
              { width: `${((currentIndex + 1) / questions.length) * 100}%` }
            ]}
          />
        </View>
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {/* 질문 */}
        <View style={styles.questionCard}>
          <Text style={styles.questionLabel}>{getQuizTypeLabel(currentQuestion.quizType)}</Text>
          <Text style={styles.questionText}>{currentQuestion.question}</Text>
          {currentQuestion.word.pronunciation && currentQuestion.quizType === 'word_to_meaning' && (
            <Text style={styles.pronunciationText}>[{currentQuestion.word.pronunciation}]</Text>
          )}
        </View>

        {/* 답변 입력 */}
        <View style={styles.answerSection}>
          <Text style={styles.answerLabel}>답</Text>
          <TextInput
            style={styles.answerInput}
            placeholder="답을 입력하세요"
            value={userAnswer}
            onChangeText={setUserAnswer}
            autoFocus
            editable={!isSubmitting}
            multiline={currentQuestion.quizType === 'translation_to_example'}
          />
        </View>

        {/* 제출 버튼 */}
        <TouchableOpacity
          style={[styles.submitButton, isSubmitting && styles.submitButtonDisabled]}
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
  },
  header: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingTop: 48,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  progressText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#C4B5FD',
    marginBottom: 8,
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
    borderRadius: 12,
    padding: 24,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  questionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
    marginBottom: 12,
  },
  questionText: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#1A1A1A',
    lineHeight: 32,
  },
  pronunciationText: {
    fontSize: 16,
    color: '#6B7280',
    marginTop: 8,
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
    borderRadius: 8,
    padding: 14,
    fontSize: 16,
    color: '#1A1A1A',
    minHeight: 50,
  },
  submitButton: {
    backgroundColor: '#C4B5FD',
    borderRadius: 8,
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
});
