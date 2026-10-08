import { useTranslation } from 'react-i18next';
import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Animated,
  Easing,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SPACING } from '../constants/design';
import { MaterialIcons } from '@expo/vector-icons';
import { wordService } from '../services/wordService';
import { orderByIds, quizService } from '../services/quizService';
import { srsService } from '../services/srsService';
import { useInterstitialAd } from '../hooks/useInterstitialAd';
import type { Word } from '../types/word';
import { useTheme } from '../contexts/ThemeContext';
import { speak } from '../utils/speech';
import { normalizeForCompare } from '../utils/text';
import Toast from '../components/Toast';
import { useToast } from '../hooks/useToast';

export type QuizMode = 'random' | 'recent' | 'weak' | 'mixed' | 'review';

/**
 * 맞혔을 때 다음 문제로 넘어가기까지 (2026-10-08 시안 #3).
 *
 * ⚠ 예전에는 **정답·오답 모두** 이 시간 뒤에 자동으로 넘어갔다. 이제 **정답만**이다.
 *   얇은 선이 이 시간 동안 차오르므로 *얼마나 남았는지*가 눈에 보인다 —
 *   보이지 않는 1.5초는 멈춘 것처럼 느껴진다.
 */
const ADVANCE_MS = 1500;

/** 오답일 때 흔들리는 폭. ⚠ 크면 장난스럽고 작으면 안 보인다 */
const SHAKE_PX = 7;
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
  /** 생략하면 전 카테고리에서 낸다(복습 큐가 그렇게 부른다) */
  categoryId?: number;
  mode: QuizMode;
  wordCount: number;
  direction: QuizDirection;
  answerType: QuizAnswerType;
  retryWordIds?: number[];
  onComplete: (results: QuizResult[]) => void;
  onExit: () => void;
}

export default function QuizScreen({ categoryId, mode, wordCount, direction, answerType, retryWordIds, onComplete, onExit }: QuizScreenProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  // 자체 헤더를 그리므로 상태바 여백을 직접 준다
  const insets = useSafeAreaInsets();
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

  /*
   * 판정 연출 (2026-10-08 시안 #3·#4·#5).
   *
   * 🔴 **정답과 오답을 다르게 다룬다.** 예전에는 둘 다 1.5초 뒤 자동으로 넘어갔다.
   * ```
   * 정답   띠도 [계속]도 없다. 얇은 선이 1.5초 차오르고 저절로 넘어간다
   * 오답   흔들리고 빨개진 뒤 판정 띠가 올라온다. [계속]을 눌러야 넘어간다
   * ```
   *    **틀린 순간이 배우는 순간**이라 거기서만 붙잡는다. 맞혔을 때 흐름을 끊으면
   *    열 문제를 푸는 동안 열 번 끊긴다.
   */
  const [awaitingContinue, setAwaitingContinue] = useState(false);

  /**
   * 정답일 때 차오르는 선. 🔴 **`useNativeDriver: false`** — 너비(%)는 네이티브가 못 받는다.
   * ⚠ 이 값은 문제마다 `setValue(0)` 으로 되돌린다. 그래서 **절대 네이티브로 넘기지 않는다** —
   *   1.7.0 사고가 정확히 *네이티브로 넘긴 값을 `setValue` 로 되돌린 것*이었다.
   */
  const fill = useRef(new Animated.Value(0)).current;
  /**
   * 오답일 때 흔들림. 🔴 **`useNativeDriver: true`** — `translateX` 뿐이고
   * **`setValue` 로 되돌리지 않는다**(끝에서 0 으로 되돌아오는 순수 시퀀스다).
   * `FlipCard` 가 네이티브 드라이버를 쓰는 것과 같은 조건이다. 위 `fill` 과는 **다른 값·다른 요소**다.
   */
  const shake = useRef(new Animated.Value(0)).current;
  /** 돌고 있는 애니메이션. 화면을 떠날 때 끊는다 */
  const running = useRef<Animated.CompositeAnimation | null>(null);
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    running.current?.stop();
    if (advanceTimer.current !== null) clearTimeout(advanceTimer.current);
  }, []);
  const isMultipleChoice = answerType === 'multiple_choice';
  const { showAd } = useInterstitialAd();
  const { toast, showToast, hideToast } = useToast();

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
        Alert.alert(t('알림'), t('등록된 단어가 없습니다'));
        onExit();
        return;
      }

      let selectedWords: Word[] = [];

      /*
       * 목록을 들고 들어온 길들(홈 복습 배너 · 플래시카드 · 오답 재도전).
       *
       * 🔴 **넘겨받은 순서를 지킨다**(`orderByIds`). 예전에는 `words.filter(...)` 였고
       *    그러면 고르기는 맞는데 **저장소 순서**가 나왔다 — 만기순도 카드 순서도 조용히 버려졌다.
       *    아래 `review` 분기는 처음부터 이 방식이었다. 이 분기만 빠져 있었다.
       */
      if (retryWordIds && retryWordIds.length > 0) {
        selectedWords = orderByIds(words, retryWordIds);
        if (selectedWords.length === 0) {
          Alert.alert(t('알림'), t('해당 단어를 찾을 수 없습니다'));
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
      } else if (mode === 'review') {
        // 간격 반복이 정한 순서. 고른 카테고리 안에서만 본다 —
        // 홈 배너의 횡단 큐와 다른 점이 이것이다.
        const dueIds = await srsService.getDueWordIds(wordCount, categoryId);
        selectedWords = orderByIds(words, dueIds);
        if (selectedWords.length === 0) {
          // 만기가 하나도 없으면 빈 화면 대신 평소처럼 낸다. "오늘 볼 것 없음"으로
          // 퀴즈를 막으면 사용자가 스스로 더 공부하려는 것을 앱이 거절하는 꼴이다.
          selectedWords = shuffleArray([...words]).slice(0, Math.min(wordCount, words.length));
        }
      } else if (mode === 'mixed') {
        selectedWords = shuffleArray([...words]).slice(0, Math.min(wordCount, words.length));
      }

      // 빈 뜻을 가진 단어 필터링
      selectedWords = selectedWords.filter(w =>
        w.meanings.length > 0 && w.meanings.some(m => m.trim() !== '')
      );

      if (selectedWords.length === 0) {
        Alert.alert(t('알림'), t('유효한 단어가 없습니다.\n뜻이 입력된 단어를 추가해주세요.'));
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
      Alert.alert(t('오류'), error.message || t('퀴즈를 불러오는데 실패했습니다'));
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
    const DUMMY_MEANINGS = [t('기억나지 않음'), t('해당 없음'), t('모르겠음')];
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

  // 채점은 normalizeForCompare 하나로 통일한다.
  // 정규화를 빼면 눈에 똑같이 보이는 답이 조합형/완성형 차이로 오답 처리된다
  const normalizeString = normalizeForCompare;

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
      Alert.alert(t('알림'), t('답을 입력해주세요'));
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

    /*
     * 🔴 **여기서 길이 갈린다**(시안 #3·#4·#5).
     *   맞혔으면 선이 차오르는 동안 기다렸다 저절로 넘어가고,
     *   틀렸으면 흔들고 멈춰 서서 **[계속]** 을 기다린다.
     */
    if (isCorrect) {
      fill.setValue(0);
      const anim = Animated.timing(fill, {
        toValue: 1,
        duration: ADVANCE_MS,
        easing: Easing.linear,
        useNativeDriver: false,
      });
      running.current = anim;
      anim.start();
      advanceTimer.current = setTimeout(() => void advance(updatedResults), ADVANCE_MS);
    } else {
      setAwaitingContinue(true);
      const anim = Animated.sequence([
        Animated.timing(shake, { toValue: 1, duration: 55, useNativeDriver: true }),
        Animated.timing(shake, { toValue: -1, duration: 55, useNativeDriver: true }),
        Animated.timing(shake, { toValue: 0.6, duration: 55, useNativeDriver: true }),
        Animated.timing(shake, { toValue: 0, duration: 55, useNativeDriver: true }),
      ]);
      running.current = anim;
      anim.start();
    }
  };

  /** 다음 문제로. 🔴 **정답은 타이머가, 오답은 [계속]이** 부른다 */
  const advance = async (updatedResults: QuizResult[]) => {
    {
      setFeedback(null);
      setAwaitingContinue(false);
      fill.setValue(0);

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
          // 결과를 저장한 뒤에 반영한다. srsService 가 **순서에 기대지 않게** 되어 있으므로
          // 뒤집혀도 틀리지는 않는다(저장본을 버리고 다음 조회가 재생한다).
          // ⚠ 처음엔 여기 주석이 사실과 반대였고, 그 때문에 답이 두 번 세어졌다(2026-09-08).
          await srsService.recordAnswers(
            updatedResults.map((r) => ({ wordId: r.wordId, isCorrect: r.isCorrect })),
          );
        } catch (error) {
          console.warn('퀴즈 결과 저장 실패:', error);
        }
        onComplete(updatedResults);
      }
    }
  };

  // 예문을 힌트로 넘겨 한자만 있는 단어의 일본어/중국어 판별을 돕는다
  const speakWord = async (text: string, word?: Word) => {
    const result = await speak(text, (word?.examples ?? []).map((e) => e.example));
    if (result.outcome === 'unsupported') {
      showToast(t('{{language}} 음성이 기기에 설치되어 있지 않습니다', { language: t(result.label) }), 'info');
    } else if (result.outcome === 'error') {
      showToast(t('음성 재생에 실패했습니다'), 'error');
    }
  };

  const handleExit = () => {
    Alert.alert(
      t('퀴즈 종료'),
      t('퀴즈를 종료하시겠습니까?\n진행 중인 결과는 저장되지 않습니다.'),
      [
        { text: t('취소'), style: 'cancel' },
        { text: t('종료'), style: 'destructive', onPress: onExit },
      ]
    );
  };

  const getHint = (question: QuizQuestion): string => {
    const answer = question.correctAnswer;
    if (!answer) return '';
    const trimmed = answer.trim();
    // 3글자 이하 정답은 첫 글자 노출하면 정답이 드러나므로 글자 수만 표시
    if (trimmed.length <= 3) {
      return t('힌트: {{count}}자', { count: trimmed.length });
    }
    const words = trimmed.split(/\s+/);
    if (words.length > 2) {
      return t('{{first}}... ({{words}}단어, {{chars}}자)', { first: trimmed.charAt(0), words: words.length, chars: trimmed.length });
    }
    return t('{{first}}... ({{chars}}자)', { first: trimmed.charAt(0), chars: trimmed.length });
  };

  // 질문이 영어(단어/예문)인 퀴즈 타입에서만 발음 버튼 표시
  const canSpeak = (quizType: QuizType): boolean => {
    return quizType === 'word_to_meaning' || quizType === 'example_to_meaning';
  };

  const getQuizTypeLabel = (quizType: QuizType): string => {
    switch (quizType) {
      case 'word_to_meaning':
        return t('단어의 뜻을 입력하세요');
      case 'meaning_to_word':
        return t('뜻에 해당하는 단어를 입력하세요');
      case 'example_to_meaning':
        return t('예문의 뜻을 입력하세요');
      case 'translation_to_example':
        return t('번역에 해당하는 예문을 입력하세요');
      default:
        return t('답을 입력하세요');
    }
  };

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loadingText, { color: colors.textSecondary }]}>{t('퀴즈 준비 중...')}</Text>
      </View>
    );
  }

  if (questions.length === 0) {
    return (
      <View style={[styles.emptyContainer, { backgroundColor: colors.background }]}>
        <StatusBar style={colors.isDark ? 'light' : 'dark'} />
        <MaterialIcons name="edit-note" size={64} color={colors.textTertiary} />
        <Text style={[styles.emptyTitle, { color: colors.text }]}>{t('퀴즈를 시작할 수 없습니다')}</Text>
        <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>{t('등록된 단어가 없습니다')}</Text>
        <TouchableOpacity style={[styles.emptyBackButton, { backgroundColor: colors.border }]} onPress={onExit}>
          <Text style={[styles.emptyBackButtonText, { color: colors.textSecondary }]}>{t('돌아가기')}</Text>
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
      <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border, paddingTop: insets.top + SPACING.md }]}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={handleExit} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <MaterialIcons name="close" size={18} color={colors.textSecondary} />
              <Text style={[styles.exitText, { color: colors.textSecondary }]}>{t('나가기')}</Text>
            </View>
          </TouchableOpacity>
          <Text style={[styles.progressText, { color: colors.text }]}>{progress}</Text>
          <View style={{ width: 64 }} />
        </View>
        <View style={[styles.progressBar, { backgroundColor: colors.border }]}>
          <View
            style={[
              styles.progressFill,
              { width: `${((currentIndex + 1) / questions.length) * 100}%`, backgroundColor: colors.primaryStrong }
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
                onPress={() => speakWord(currentQuestion.question, currentQuestion.word)}
                accessibilityRole="button"
                accessibilityLabel={t('문제 발음 듣기')}
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
              <MaterialIcons name="lightbulb-outline" size={18} color={colors.primary} />
              <Text style={[styles.hintButtonText, { color: colors.primary }]}> {t('힌트 보기')}</Text>
            </View>
          </TouchableOpacity>
        ) : (
          <View style={[styles.hintBox, { backgroundColor: colors.warningBg, borderColor: colors.warningBorder }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <MaterialIcons name="lightbulb-outline" size={18} color={colors.warningText} />
              <Text style={[styles.hintText, { color: colors.warningText }]}> {getHint(currentQuestion)}</Text>
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

              /*
               * 🔴 **흔들림은 틀리게 고른 칸에만** 준다(시안 #4). 보기 전체를 흔들면
               *   무엇을 틀렸는지가 아니라 "화면이 흔들렸다"만 남는다.
               * ⚠ 맞힌 뒤에는 고르지 않은 칸을 흐리게 해 **정답 하나만 눈에 남게** 한다(시안 #3).
               */
              const dimmed = feedback !== null && feedback.isCorrect && !isCorrectChoice;
              return (
                <Animated.View
                  key={idx}
                  style={
                    isWrongSelected
                      ? {
                          transform: [
                            {
                              translateX: shake.interpolate({
                                inputRange: [-1, 1],
                                outputRange: [-SHAKE_PX, SHAKE_PX],
                              }),
                            },
                          ],
                        }
                      : undefined
                  }
                >
                <TouchableOpacity
                  style={[
                    styles.choiceButton,
                    dimmed && styles.choiceDimmed,
                    { backgroundColor: colors.card, borderColor: colors.border },
                    isCorrectChoice && {
                      backgroundColor: colors.successBg,
                      borderColor: colors.successBorder,
                    },
                    isWrongSelected && {
                      backgroundColor: colors.dangerBg,
                      borderColor: colors.dangerBorder,
                    },
                    isSelected && !feedback && { borderColor: colors.primaryStrong, backgroundColor: colors.primaryLight },
                  ]}
                  onPress={() => handleChoiceSelect(choice)}
                  disabled={isSubmitting}
                >
                  {/*
                    기호칸을 색으로만 구분하지 않는다. 정답·오답을 초록/빨강으로만
                    표시하면 색각 이상 사용자에게 같은 회색으로 보인다.
                  */}
                  <View
                    style={[
                      styles.choiceKey,
                      { backgroundColor: colors.borderLight },
                      isSelected && !feedback && { backgroundColor: colors.primary },
                      isCorrectChoice && styles.choiceKeyCorrect,
                      isWrongSelected && styles.choiceKeyWrong,
                    ]}
                  >
                    {isCorrectChoice ? (
                      <MaterialIcons name="check" size={16} color="#FFFFFF" />
                    ) : isWrongSelected ? (
                      <MaterialIcons name="close" size={16} color="#FFFFFF" />
                    ) : (
                      <Text
                        style={[
                          styles.choiceKeyText,
                          { color: colors.textSecondary },
                          isSelected && !feedback && { color: '#FFFFFF' },
                        ]}
                      >
                        {String.fromCharCode(65 + idx)}
                      </Text>
                    )}
                  </View>
                  <Text style={[
                    styles.choiceText,
                    { color: colors.text },
                    isSelected && !feedback && { color: colors.primaryStrong, fontWeight: '600' },
                    isCorrectChoice && { color: colors.successText, fontWeight: '600' },
                    isWrongSelected && { color: colors.dangerText, fontWeight: '600' },
                  ]}>
                    {choice}
                  </Text>
                  {isSelected && !feedback && (
                    <MaterialIcons name="check-circle" size={20} color={colors.primary} />
                  )}
                </TouchableOpacity>
                {/*
                  맞힌 칸 아래로 차오르는 얇은 선 (시안 #3). **남은 시간을 보이게 한다** —
                  보이지 않는 1.5초는 멈춘 것처럼 느껴진다.
                */}
                {isCorrectChoice && feedback?.isCorrect === true && (
                  <View style={[styles.advanceTrack, { backgroundColor: colors.successBorder }]}>
                    <Animated.View
                      style={[
                        styles.advanceFill,
                        {
                          backgroundColor: colors.success,
                          width: fill.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
                        },
                      ]}
                    />
                  </View>
                )}
                </Animated.View>
              );
            })}
          </View>
        ) : (
          <Animated.View
            style={[
              styles.answerSection,
              feedback !== null && !feedback.isCorrect
                ? {
                    transform: [
                      {
                        translateX: shake.interpolate({
                          inputRange: [-1, 1],
                          outputRange: [-SHAKE_PX, SHAKE_PX],
                        }),
                      },
                    ],
                  }
                : null,
            ]}
          >
            <Text style={[styles.answerLabel, { color: colors.textSecondary }]}>{t('답')}</Text>
            <TextInput
              style={[styles.answerInput, { backgroundColor: colors.card, borderColor: colors.border, color: colors.text }]}
              placeholder={isKoreanAnswer ? t('뜻을 입력하세요') : t('단어를 입력하세요')}
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
            {/* 🔴 내 답에 취소선 (시안 #5). 무엇을 썼는지 보여줘야 왜 틀렸는지 안다 */}
            {feedback !== null && !feedback.isCorrect && userAnswer.trim() !== '' && (
              <Text style={[styles.myWrongAnswer, { color: colors.dangerText }]} numberOfLines={2}>
                {userAnswer.trim()}
              </Text>
            )}
          </Animated.View>
        )}

        {/*
          판정 띠 — 🔴 **틀렸을 때만 뜬다**(시안 #4·#5).
          맞혔을 때는 보기 칸이 이미 초록 ✓ 라 띠가 같은 말을 한 번 더 하는 셈이고,
          그 한 번이 열 문제면 열 번이다.
        */}
        {feedback !== null && !feedback.isCorrect && (
          <View style={[styles.feedbackBox, { backgroundColor: colors.dangerBg, borderColor: colors.dangerBorder }]}>
            <Text style={[styles.feedbackText, { color: colors.dangerText }]}>{t('오답')}</Text>
            <Text style={[styles.feedbackCorrectAnswer, { color: colors.dangerText }]}>
              {t('정답: {{answer}}', { answer: feedback.correctAnswer })}
            </Text>
          </View>
        )}

        {/*
          [계속] — 🔴 **틀렸을 때만 뜬다**(시안 #4·#5). 맞히면 저절로 넘어간다.
          ⚠ `results` 를 그대로 넘긴다. 판정 시점에 `setResults` 로 이미 들어가 있다.
        */}
        {awaitingContinue && (
          <TouchableOpacity
            style={[styles.continueButton, { backgroundColor: colors.primaryStrong }]}
            onPress={() => void advance(results)}
            accessibilityRole="button"
          >
            <Text style={styles.continueButtonText}>
              {currentIndex + 1 < questions.length ? t('계속') : t('완료')}
            </Text>
          </TouchableOpacity>
        )}

        {/* 제출 버튼 (주관식만). ⚠ 판정 중에는 숨긴다 — 그 자리를 [계속]이 쓴다 */}
        {!isMultipleChoice && feedback === null && (
          <TouchableOpacity
            style={[styles.submitButton, { backgroundColor: colors.primaryStrong }, isSubmitting && styles.submitButtonDisabled]}
            onPress={handleSubmit}
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.submitButtonText}>
                {currentIndex + 1 < questions.length ? t('다음') : t('완료')}
              </Text>
            )}
          </TouchableOpacity>
        )}
      </ScrollView>

      <Toast
        message={toast.message}
        type={toast.type}
        visible={toast.visible}
        onHide={hideToast}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  // ── 판정 연출 (2026-10-08 시안 #3·#4·#5) ──
  /** 맞힌 뒤 고르지 않은 칸. 지우지 않고 **흐리게만** 한다 — 사라지면 목록이 들썩인다 */
  choiceDimmed: { opacity: 0.35 },
  advanceTrack: { height: 3, borderRadius: 2, marginTop: -6, marginBottom: 10, overflow: 'hidden' },
  advanceFill: { height: 3 },
  /** 내가 쓴 틀린 답. 취소선으로 **지워졌음**을 보인다 */
  myWrongAnswer: { marginTop: 8, fontSize: 14, fontWeight: '600', textDecorationLine: 'line-through' },
  continueButton: {
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    minHeight: 48,
  },
  continueButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },

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
    fontWeight: '600',
  },
  hintBox: {
    borderRadius: 16,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
  },
  hintText: {
    fontSize: 15,
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
    borderRadius: 8,
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
    borderWidth: 1,
  },
  feedbackWrong: {
    borderWidth: 1,
  },
  feedbackText: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  feedbackTextCorrect: {
  },
  feedbackTextWrong: {
  },
  feedbackCorrectAnswer: {
    fontSize: 15,
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
    gap: 8,
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
  choiceKey: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  choiceKeyCorrect: {
    backgroundColor: '#059669',
  },
  choiceKeyWrong: {
    backgroundColor: '#DC2626',
  },
  choiceKeyText: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  choiceText: {
    fontSize: 16,
    color: '#1A1A1A',
    flex: 1,
  },
});
