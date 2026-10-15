import { useTranslation } from 'react-i18next';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { MaterialIcons } from '@expo/vector-icons';

import BottomSheet from '../components/BottomSheet';
import ConfirmSheet from '../components/ConfirmSheet';
import ScreenHeader from '../components/ScreenHeader';
import Toast from '../components/Toast';
import { FONT, RADIUS, SPACING } from '../constants/design';
import {
  EXAM_EXPECTED_WAIT_SEC,
  EXAM_SIZE,
  QUESTIONS_PER_WORD,
  WORDS_FOR_FULL_EXAM,
} from '../constants/appConfig';
import { useTheme } from '../contexts/ThemeContext';
import { useToast } from '../hooks/useToast';
import { categoryService } from '../services/categoryService';
import { wordService } from '../services/wordService';
import {
  EXAM_LANGUAGES,
  type ExamProgress,
  countLanguages,
  countWordsInLanguage,
  detectCategoryLanguage,
  examService,
  type ExamLanguage,
} from '../services/examService';
import type { Category, Word } from '../types/word';

/**
 * AI 시험 시작 화면.
 *
 * 플래시카드·퀴즈 설정과 나란히 보이지만 **묻는 것이 하나 더 있다. 언어를 묻는다.**
 *
 * 🔴 **언어를 왜 묻나** — 한자만 저장된 단어는 일본어인지 중국어인지 **원리적으로 구분할 수 없다**
 *    (`学校`). 추정을 기본값으로 내놓고 사용자가 고치게 둔다(사장님 결정 ②).
 *    틀린 언어로 보내면 문제가 통째로 엉뚱해지는데, 그 원가는 이미 나간 뒤다.
 *
 * 🔴 **오프라인을 미리 막지 않는다.** NetInfo 를 쓰지 않고, 호출이 `offline` 로 떨어질 때
 *    안내한다. 이 앱의 규율이 *"서버가 죽어도 앱은 멀쩡히 보여야 한다"* 이고,
 *    미리 회색으로 만들면 **네트워크가 멀쩡한데 못 쓰는** 경우가 생긴다.
 */

interface ExamSetupScreenProps {
  onBack: () => void;
  onStart: (categoryId: number, language: ExamLanguage) => void;
  /**
   * 성적표로. 🔴 **진입점을 여기 둔 이유** — 시험을 치러 온 사람이 지난 성적을 보고 싶어 한다.
   * 홈에 또 하나를 두면 홈이 길어지고, 설정에 두면 아무도 못 찾는다.
   */
  onHistory: () => void;
  /** 풀다 만 시험을 이어서 (2026-10-14). 서버를 부르지 않는다 */
  onResume: () => void;
}

const LANGUAGE_LABEL: Record<ExamLanguage, string> = {
  ja: '일본어',
  en: '영어',
  ko: '한국어',
  zh: '중국어',
};

export default function ExamSetupScreen({
  onBack,
  onStart,
  onHistory,
  onResume,
}: ExamSetupScreenProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { toast, showToast, hideToast } = useToast();

  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [language, setLanguage] = useState<ExamLanguage | null>(null);
  /** 사용자가 직접 고쳤나. 고쳤으면 카테고리를 바꿀 때까지 추정이 덮지 않는다 */
  const [languageTouched, setLanguageTouched] = useState(false);
  const [mixedCount, setMixedCount] = useState(0);
  /**
   * 그 카테고리의 단어들. 🔴 **들고 있어야 한다** — 몇 문제가 나올지는 **고른 언어**에
   * 달려 있고, 언어는 단어를 불러온 뒤에도 바뀐다. 불러올 때 한 번 세고 버리면
   * 언어를 바꿨을 때 화면의 숫자가 **옛 언어 기준으로 남는다.**
   */
  const [words, setWords] = useState<Word[]>([]);
  const [loading, setLoading] = useState(true);
  const [detecting, setDetecting] = useState(false);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  /**
   * 풀다 만 시험 (2026-10-14). 없으면 `null`.
   *
   * 🔴 **이 화면이 「이어서 풀기」의 유일한 입구다.** 홈에 또 띠를 만들면 홈이 길어지고,
   *    시험을 치러 온 사람은 어차피 여기로 온다(성적표 입구를 여기 둔 것과 같은 판단).
   */
  const [progress, setProgress] = useState<ExamProgress | null>(null);
  /** 풀던 시험이 있는데 새로 시작하려 할 때 (2026-10-14) */
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [data, prefs, saved] = await Promise.all([
          categoryService.getCategories(),
          examService.loadPrefs(),
          examService.loadProgress(),
        ]);
        if (!alive) return;
        setProgress(saved);
        setCategories(data);
        const remembered = data.find((c) => c.categoryId === prefs.lastCategoryId);
        setSelectedCategoryId(remembered?.categoryId ?? data[0]?.categoryId ?? null);
      } catch (error: any) {
        console.warn('카테고리 조회 실패:', error);
        if (alive) showToast(t('카테고리를 불러오는데 실패했습니다'), 'error');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [showToast, t]);

  /**
   * 카테고리가 바뀌면 언어를 다시 정한다.
   *
   * 순서가 중요하다: **저장된 선택 > 글자 추정**. 사용자가 전에 고른 것을 추정이 덮으면
   * 같은 카테고리에서 매번 다시 고르게 된다.
   */
  useEffect(() => {
    if (selectedCategoryId === null) return;
    let alive = true;
    setDetecting(true);
    setLanguageTouched(false);
    (async () => {
      try {
        const [words, prefs] = await Promise.all([
          wordService.getWords(selectedCategoryId),
          examService.loadPrefs(),
        ]);
        if (!alive) return;
        setWords(words);
        setMixedCount(countLanguages(words));
        const saved = prefs.languageByCategory[String(selectedCategoryId)];
        setLanguage(saved ?? detectCategoryLanguage(words));
      } catch (error: any) {
        console.warn('언어 추정 실패:', error);
        // 추정에 실패해도 화면은 쓸 수 있어야 한다 — 사용자가 직접 고르면 된다
        if (alive) setLanguage(null);
      } finally {
        if (alive) setDetecting(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [selectedCategoryId]);

  const selectedCategory = useMemo(
    () => categories.find((c) => c.categoryId === selectedCategoryId),
    [categories, selectedCategoryId],
  );
  const wordCount = selectedCategory?.wordCount ?? 0;

  /**
   * 이 판에 **실제로 나올 문제 수**.
   *
   * 🔴 2026-10-13 까지 이 화면은 *"문제 20개"* 를 **고정으로** 약속했다. 단어가 5개인
   *    카테고리에서는 15문제가 나오는데도 그랬다 — 들어가기 전에 거짓을 말하고 있었다.
   *    (사장님이 *"단어 5개 정도로 적게 저장한 카테고리의 시험"* 을 물어 드러났다)
   *
   * ⚠ 언어를 아직 못 골랐으면 **아무 약속도 하지 않는다**(`null`). 전체 단어 수로 계산하면
   *   언어가 섞인 카테고리에서 또 부풀어 오른다.
   */
  const expectedQuestions = useMemo(() => {
    if (language === null || words.length === 0) return null;
    const usable = countWordsInLanguage(words, language);
    return Math.min(EXAM_SIZE, usable * QUESTIONS_PER_WORD);
  }, [language, words]);

  /**
   * 🔴 **고른 언어로 만들 문제가 한 개도 없는 상태.** 버튼을 끄는 유일한 근거다.
   *    `wordCount`(카테고리 전체)로는 못 잡는다 — 단어는 18개인데 그 언어가 아닌 경우다.
   */
  const noQuestions = expectedQuestions === 0;

  /**
   * 고른 언어로 쓸 수 있는 단어 수. **안내가 「왜」를 말하려고 쓴다**(2026-10-15).
   *
   * ⚠ 화면 위의 `18개 단어` 와 다른 숫자다 — 저쪽은 카테고리 전체이고 이쪽은 고른 언어만이다.
   *   그 둘이 갈리는 것이 이 안내가 필요한 이유이기도 하다(영어 18개에 한국어를 고르면 0).
   */
  const usableWords = useMemo(() => {
    if (language === null || words.length === 0) return 0;
    return countWordsInLanguage(words, language);
  }, [language, words]);

  /** 20문제를 채우려면 단어가 몇 개 더 필요한가. 🚫 막지 않는다 — 알려만 준다(사장님 결정) */
  const wordsShort = useMemo(() => {
    if (language === null || words.length === 0) return 0;
    const usable = countWordsInLanguage(words, language);
    return Math.max(0, WORDS_FOR_FULL_EXAM - usable);
  }, [language, words]);

  const handlePickLanguage = useCallback(
    (next: ExamLanguage) => {
      setLanguage(next);
      setLanguageTouched(true);
      if (selectedCategoryId === null) return;
      // 고른 즉시 저장한다. 다음에 이 카테고리를 열면 그대로 뜬다
      void examService.loadPrefs().then((prefs) =>
        examService.savePrefs({
          ...prefs,
          languageByCategory: {
            ...prefs.languageByCategory,
            [String(selectedCategoryId)]: next,
          },
        }),
      );
    },
    [selectedCategoryId],
  );

  /**
   * 🔴 **새 시험을 시작하면 풀던 시험이 사라진다. 그래서 먼저 물어본다** (2026-10-14).
   *
   *    한 판만 들고 있는 설계라(접수증과 같다) 피할 수 없다. 조용히 덮어쓰면
   *    **돈이 든 시험이 말없이 없어지고**, 사용자는 왜 사라졌는지 알 길이 없다.
   */
  const startFresh = useCallback(() => {
    if (isStarting) return;
    if (selectedCategoryId === null) {
      showToast(t('카테고리를 선택해주세요'), 'error');
      return;
    }
    if (wordCount === 0) {
      showToast(t('선택한 카테고리에 단어가 없습니다'), 'error');
      return;
    }
    // 🔴 언어를 못 정했으면 보내지 않는다. 추측으로 보내면 문제가 통째로 엉뚱해지고 원가는 나간다
    if (language === null) {
      showToast(t('어떤 언어의 단어인지 선택해주세요'), 'error');
      return;
    }
    /*
     * 🔴 **고른 언어의 단어가 하나도 없으면 막는다**(2026-10-15 사장님 결정).
     *
     * 바로 위 `wordCount === 0`(카테고리가 빈 경우)과 **사용자가 겪는 일이 똑같다** —
     * 영어 단어 18개짜리 카테고리에 한국어를 고르면 쓸 단어가 0개다. 한쪽만 막고 있었다.
     *
     * ⚠ **「적게 나오는 경우」는 여전히 막지 않는다**(2026-10-13 결정). 15문제는 덜 좋은
     *   시험이지 시험이긴 하다. 0문제는 시험이 아니다 — 지켜서 얻는 것이 없다.
     *
     * ⚠ 서버도 0문제면 503 으로 돌려보내고 **무료 횟수를 소모하지 않는다**(`ai-exam.ts`).
     *   그래서 이 빗장이 막는 것은 판수가 아니라 **90초를 기다렸다 오류를 받는 길**이다.
     */
    if (expectedQuestions === 0) {
      showToast(t('고른 언어의 단어가 없어 문제를 만들 수 없습니다'), 'error');
      return;
    }
    setIsStarting(true);
    void examService
      .loadPrefs()
      .then((prefs) => examService.savePrefs({ ...prefs, lastCategoryId: selectedCategoryId }));
    // 🔴 버리기로 한 뒤에 비운다. 비우기 전에 화면이 바뀌면 다음 입장에서 또 물어본다
    void examService.clearProgress();
    onStart(selectedCategoryId, language);
  }, [expectedQuestions, isStarting, language, onStart, selectedCategoryId, showToast, t, wordCount]);

  const handleStart = useCallback(() => {
    if (progress !== null) {
      setConfirmDiscard(true);
      return;
    }
    startFresh();
  }, [progress, startFresh]);

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
        <StatusBar style={colors.isDark ? 'light' : 'dark'} />
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loadingText, { color: colors.textSecondary }]}>{t('로딩 중...')}</Text>
      </View>
    );
  }

  if (categories.length === 0) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <StatusBar style={colors.isDark ? 'light' : 'dark'} />
        <ScreenHeader title={t('AI 시험')} onBack={onBack} />
        <View style={styles.emptyBox}>
          <MaterialIcons name="quiz" size={64} color={colors.textTertiary} />
          <Text style={[styles.emptyTitle, { color: colors.text }]}>{t('카테고리가 없습니다')}</Text>
          <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
            {t('먼저 카테고리를 생성해주세요')}
          </Text>
          <TouchableOpacity
            style={[styles.startButton, styles.emptyButton, { backgroundColor: colors.primaryStrong }]}
            onPress={onBack}
          >
            <Text style={styles.startButtonText}>{t('돌아가기')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style={colors.isDark ? 'light' : 'dark'} />
      <ScreenHeader
        title={t('AI 시험')}
        onBack={onBack}
        rightButton={{ text: t('성적표'), onPress: onHistory }}
      />

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {/*
          * 풀던 시험 (2026-10-14).
          *
          * 🔴 **맨 위에 둔다.** 아래 설정을 다 고르고 「시험 시작」을 누른 뒤에야 *"풀던 게
          *    있는데요"* 라고 하면, 사용자는 방금 한 선택을 버리게 된다.
          * ⚠ 숫자는 **「어디까지 풀었나」**(index + 1)이지 「몇 개 맞혔나」가 아니다 —
          *   채점은 끝까지 풀어야 한다.
          */}
        {progress !== null && (
          <TouchableOpacity
            style={[
              styles.resumeBox,
              { backgroundColor: colors.primaryLight, borderColor: colors.primary },
            ]}
            onPress={onResume}
            accessibilityRole="button"
          >
            <MaterialIcons name="play-circle-outline" size={28} color={colors.primaryStrong} />
            <View style={styles.resumeTexts}>
              <Text style={[styles.resumeTitle, { color: colors.primaryStrong }]}>
                {t('풀던 시험이 있어요')}
              </Text>
              {/*
                * 🔴 **「풀었어요」가 아니라 「멈췄어요」다**(2026-10-14 에뮬레이터에서 잡았다).
                *    `index` 는 *보고 있던 문제*이지 *다 푼 문제 수*가 아니다. 4번을 풀고 넘기면
                *    `index` 는 4(5번째)가 되는데, 그때 *"5까지 풀었어요"* 라고 하면 **하나를 더
                *    풀었다고 말하는 것**이 된다. 이 화면이 어제 고친 것이 정확히 그 종류의 거짓이다.
                * ⚠ 숫자는 그대로 둔다 — 시험 화면이 마지막으로 보여 준 값(`5 / 15`)과 같아야
                *   사용자가 "아, 거기" 하고 알아본다.
                */}
              <Text style={[styles.resumeSub, { color: colors.primaryStrong }]}>
                {t('{{done}} / {{total}} 에서 멈췄어요', {
                  done: progress.index + 1,
                  total: progress.questions.length,
                })}
              </Text>
            </View>
            <Text style={[styles.resumeAction, { color: colors.primaryStrong }]}>
              {t('이어서 풀기')}
            </Text>
          </TouchableOpacity>
        )}

        <View style={styles.section}>
          <Text style={[styles.label, { color: colors.text }]}>{t('카테고리')}</Text>
          <TouchableOpacity
            style={[styles.selector, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => setShowCategoryPicker(true)}
            accessibilityRole="button"
            accessibilityLabel={t('카테고리 선택')}
          >
            <View style={styles.selectorLeft}>
              <Text style={[styles.selectorText, { color: colors.text }]}>
                {selectedCategory?.categoryName || t('카테고리 선택')}
              </Text>
              {selectedCategory && (
                <Text style={[styles.selectorWordCount, { color: colors.textSecondary }]}>
                  {t('{{count}}개 단어', { count: wordCount })}
                </Text>
              )}
            </View>
            <MaterialIcons name="keyboard-arrow-down" size={20} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={[styles.label, { color: colors.text }]}>{t('단어의 언어')}</Text>
          <Text style={[styles.hint, { color: colors.textSecondary }]}>
            {detecting
              ? t('단어를 보고 언어를 찾고 있어요')
              : language === null
                ? t('어떤 언어인지 알 수 없어요. 직접 골라 주세요')
                : languageTouched
                  ? t('직접 고른 언어예요')
                  : t('단어를 보고 추측한 언어예요. 다르면 바꿔 주세요')}
          </Text>

          <View style={styles.languageRow}>
            {EXAM_LANGUAGES.map((code) => {
              const on = language === code;
              return (
                <TouchableOpacity
                  key={code}
                  style={[
                    styles.languageChip,
                    { backgroundColor: colors.card, borderColor: colors.border },
                    on && { backgroundColor: colors.primaryLight, borderColor: colors.primary },
                  ]}
                  onPress={() => handlePickLanguage(code)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                >
                  <Text
                    style={[
                      styles.languageChipText,
                      { color: colors.text },
                      on && { color: colors.primaryStrong, fontWeight: '700' },
                    ]}
                  >
                    {t(LANGUAGE_LABEL[code])}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* 🔴 섞여 있다는 것을 숨기지 않는다. 사장님이 엣지 케이스로 짚은 바로 그 경우다 */}
          {mixedCount > 1 && (
            <View
              style={[
                styles.notice,
                { backgroundColor: colors.warningBg, borderColor: colors.warningBorder },
              ]}
            >
              <MaterialIcons name="info-outline" size={16} color={colors.warningText} />
              <Text style={[styles.noticeText, { color: colors.warningText }]}>
                {t('이 카테고리에 {{count}}가지 언어가 섞여 있어요. 고른 언어의 단어로만 시험을 만들어요', {
                  count: mixedCount,
                })}
              </Text>
            </View>
          )}

          {/*
            🔴 단어가 적어 20문제가 안 채워지는 경우. **막지 않고 알려만 준다**(2026-10-13 사장님 결정:
               단어 3개인 분에게 기능을 닫는 것은 과하다).

            ⚠ 두 줄이 다 필요하다. 문제 수만 말하고 **무료 1회가 그대로 줄어든다**는 것을 빼면,
              사장님이 물어서 드러난 그 문제가 그대로 남는다 — 단어 1개로 3문제를 치고도
              평생 10판 중 1판이 날아간다. 서버는 문제가 **0개일 때만** 차감하지 않는다.
          */}
          {expectedQuestions !== null && wordsShort > 0 && (
            <View
              style={[
                styles.notice,
                { backgroundColor: colors.warningBg, borderColor: colors.warningBorder },
              ]}
            >
              <MaterialIcons name="info-outline" size={16} color={colors.warningText} />
              <Text style={[styles.noticeText, { color: colors.warningText }]}>
                {/*
                  🔴 **0 일 때는 「무료 1회가 줄어든다」고 말하지 않는다**(2026-10-15).
                     서버가 0문제면 503 으로 돌려보내고 **차감 전에 멈춘다**(`ai-exam.ts`).
                     그 줄을 그대로 두면 이번엔 **반대 방향의 거짓**이 된다 —
                     안 나가는 것을 나간다고 겁주는 것도 같은 잘못이다.
                */}
                {/*
                  ⚠ **「왜 적게 나오는지」를 먼저 말한다**(시안 단어앱#22 안 A · 2026-10-15 반영).
                    전에는 *"15문제만 나와요"* 로 결과만 말했다. 사용자가 고칠 수 있는 것은
                    **단어 수**인데 그 연결이 문장에 없었다 — 숫자를 보여 주고도 할 일을 안 알려 준 셈이다.
                */}
                {noQuestions
                  ? t('고른 언어로 된 단어가 없어서 문제를 만들 수 없어요')
                  : t('단어가 {{words}}개라 문제가 {{count}}개만 나와요', {
                      words: usableWords,
                      count: expectedQuestions,
                    })}
                {'\n'}
                {noQuestions
                  ? t('언어를 바꾸시거나, 그 언어의 단어를 넣어 주세요')
                  : t('그래도 무료 1회는 그대로 줄어들어요. 단어를 {{count}}개 더 넣으시면 {{full}}문제가 돼요', {
                      count: wordsShort,
                      full: EXAM_SIZE,
                    })}
              </Text>
            </View>
          )}
        </View>

        <View style={[styles.infoBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.infoTitle, { color: colors.text }]}>{t('시험은 이렇게 나와요')}</Text>
          <Text style={[styles.infoLine, { color: colors.textSecondary }]}>
            {/* 🔴 고정값(EXAM_SIZE)을 쓰지 않는다. 그게 거짓을 말하던 자리다 */}
            {t('• 4개 보기 중에 고르는 문제 {{count}}개', { count: expectedQuestions ?? EXAM_SIZE })}
          </Text>
          <Text style={[styles.infoLine, { color: colors.textSecondary }]}>
            {t('• 복습할 때가 된 단어와 많이 틀린 단어를 먼저 내요')}
          </Text>
          {/* 🔴 90초다. 실측(단어 3개 34.5초)에서 나온 값이고 40초로 적으면 거짓이 된다 */}
          <Text style={[styles.infoLine, { color: colors.textSecondary }]}>
            {t('• 문제를 만드는 데 {{sec}}초쯤 걸려요', { sec: EXAM_EXPECTED_WAIT_SEC })}
          </Text>
          <Text style={[styles.infoLine, { color: colors.textSecondary }]}>
            {t('• 인터넷에 연결되어 있어야 해요')}
          </Text>
        </View>
      </ScrollView>

      <View style={[styles.footer, { backgroundColor: colors.background, borderTopColor: colors.border }]}>
        <TouchableOpacity
          style={[
            styles.startButton,
            { backgroundColor: colors.primaryStrong },
            (isStarting || wordCount === 0 || noQuestions) && styles.startButtonDisabled,
          ]}
          onPress={handleStart}
          disabled={isStarting || wordCount === 0 || noQuestions}
          accessibilityRole="button"
        >
          {isStarting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            /*
             * ⚠ 20문제가 안 되는 경우에만 숫자를 버튼에 넣는다. 늘 넣으면 정상인 판에서도
             *   숫자가 보여 「왜 20인지」를 설명해야 하고, 그건 이 화면이 할 일이 아니다.
             *
             * 🚫 **0 은 숫자로 넣지 않는다**(2026-10-15). 꺼진 버튼에 「0문제로 시작」이라고
             *    적으면 *"0문제로 시작할 수 있다"* 로 읽힌다. 왜 꺼졌는지는 위 안내가 말한다.
             */
            <Text style={styles.startButtonText}>
              {expectedQuestions !== null && expectedQuestions > 0 && wordsShort > 0
                ? t('{{count}}문제로 시작', { count: expectedQuestions })
                : t('시험 시작')}
            </Text>
          )}
        </TouchableOpacity>
      </View>

      <BottomSheet
        visible={showCategoryPicker}
        onClose={() => setShowCategoryPicker(false)}
        title={t('카테고리 선택')}
      >
        {categories.map((category) => {
          const on = category.categoryId === selectedCategoryId;
          return (
            <TouchableOpacity
              key={category.categoryId}
              style={[styles.sheetRow, { borderBottomColor: colors.border }]}
              onPress={() => {
                setSelectedCategoryId(category.categoryId);
                setShowCategoryPicker(false);
              }}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
            >
              <View style={styles.sheetRowLeft}>
                <Text style={[styles.sheetRowText, { color: colors.text }, on && { color: colors.primaryStrong }]}>
                  {category.categoryName}
                </Text>
                <Text style={[styles.sheetRowCount, { color: colors.textSecondary }]}>
                  {t('{{count}}개 단어', { count: category.wordCount ?? 0 })}
                </Text>
              </View>
              {on && <MaterialIcons name="check" size={20} color={colors.primary} />}
            </TouchableOpacity>
          );
        })}
      </BottomSheet>

      {/*
        * 🔴 **버리는 쪽이 `danger` 다.** 여기서는 진짜로 잃는다 — 돈이 든 문제들이 사라지고
        *    무료 1회도 돌아오지 않는다. 시험 화면의 「나가기」와 반대인 이유가 그것이다
        *    (거기서는 아무것도 안 잃으므로 겁주는 색을 쓰지 않는다).
        * ⚠ 물러서는 자리(`onCancel`)에는 아무 일도 안 일어나는 쪽을 둔다 — 시트를 실수로
        *   닫은 사람이 풀던 시험을 잃으면 안 된다.
        */}
      {/*
        🔴 **재시험과 새 시험은 잃는 것이 다르다. 그래서 말이 달라야 한다**(2026-10-15).

        새 시험을 풀다 버리면 **그 판에 쓴 무료 1회가 날아간다** — 문제를 만드는 데 돈이 들었고
        서버는 이미 차감했다. 그런데 **재시험은 무료 1회를 쓴 적이 없다**(성적표에 있는 문제를
        다시 꺼내 푸는 것이라 서버를 아예 안 부른다). 버려도 없어지는 돈이 없고, 같은 문제는
        성적표에서 언제든 다시 꺼낼 수 있다.

        ⚠ 한 문장으로 두 경우를 덮던 동안 **재시험 쪽에 거짓이 서 있었다** — 안 나가는 것을
          나간다고 겁주는 것도, 10-13 에 고친 「문제 20개」와 같은 종류의 거짓이다.
      */}
      <ConfirmSheet
        visible={confirmDiscard}
        title={progress?.isRetry === true ? t('풀던 재시험이 사라져요') : t('풀던 시험이 사라져요')}
        // ⚠ 숫자를 넣지 않는다 — 「몇 문제까지」는 셀 방법이 애매하다(넘긴 문제도 안 푼 것으로
        //   저장된다). 여기서 필요한 것은 개수가 아니라 **사라진다는 사실**이다
        message={
          progress?.isRetry === true
            ? t('지금까지 푸신 게 없어져요. 같은 문제는 성적표에서 다시 풀 수 있어요')
            : t('새로 시작하면 지금까지 푸신 게 없어지고, 무료 1회도 돌아오지 않아요')
        }
        confirmLabel={t('새로 시작')}
        cancelLabel={t('그만두기')}
        tone="danger"
        onConfirm={() => {
          setConfirmDiscard(false);
          setProgress(null);
          startFresh();
        }}
        onCancel={() => setConfirmDiscard(false)}
      />

      <Toast message={toast.message} type={toast.type} visible={toast.visible} onHide={hideToast} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: SPACING.md, fontSize: FONT.body },
  scrollView: { flex: 1 },
  scrollContent: { padding: SPACING.lg, paddingBottom: SPACING.xl },
  section: { marginBottom: SPACING.xl },
  label: { fontSize: FONT.label, fontWeight: '700', marginBottom: SPACING.sm },
  hint: { fontSize: FONT.caption, marginBottom: SPACING.sm, lineHeight: 18 },
  selector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
  },
  selectorLeft: { flex: 1 },
  selectorText: { fontSize: FONT.body, fontWeight: '600' },
  selectorWordCount: { fontSize: FONT.caption, marginTop: 2 },
  languageRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  languageChip: {
    borderWidth: 1,
    borderRadius: RADIUS.pill,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
  },
  languageChipText: { fontSize: FONT.body },
  notice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.sm,
    marginTop: SPACING.md,
    padding: SPACING.md,
    borderRadius: RADIUS.md,
    // 배경에 짝이 되는 글자색을 쓴다(`themes.ts` 의 대비 규약). card + textSecondary 로 두면
    // 안내가 눈에 안 띄고, warning 배경에 textSecondary 를 올리면 대비가 깨진다
    borderWidth: StyleSheet.hairlineWidth,
  },
  noticeText: { flex: 1, fontSize: FONT.caption, lineHeight: 18 },
  // 풀던 시험 띠 (2026-10-14). 맨 위에 서므로 아래 섹션과 같은 간격을 둔다
  resumeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    padding: SPACING.md,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    marginBottom: SPACING.lg,
  },
  resumeTexts: { flex: 1 },
  resumeTitle: { fontSize: FONT.body, fontWeight: '700' },
  resumeSub: { fontSize: FONT.caption, marginTop: 2 },
  resumeAction: { fontSize: FONT.caption, fontWeight: '700' },
  infoBox: { borderWidth: 1, borderRadius: RADIUS.md, padding: SPACING.md },
  infoTitle: { fontSize: FONT.label, fontWeight: '700', marginBottom: SPACING.sm },
  infoLine: { fontSize: FONT.caption, lineHeight: 20 },
  footer: { padding: SPACING.lg, borderTopWidth: StyleSheet.hairlineWidth },
  startButton: {
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.md,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  startButtonDisabled: { opacity: 0.5 },
  startButtonText: { color: '#fff', fontSize: FONT.body, fontWeight: '700' },
  emptyBox: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: SPACING.xl },
  emptyTitle: { fontSize: FONT.title, fontWeight: '700', marginTop: SPACING.lg },
  emptySubtitle: { fontSize: FONT.body, marginTop: SPACING.sm, textAlign: 'center' },
  emptyButton: { marginTop: SPACING.xl, paddingHorizontal: SPACING.xl },
  sheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACING.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sheetRowLeft: { flex: 1 },
  sheetRowText: { fontSize: FONT.body, fontWeight: '600' },
  sheetRowCount: { fontSize: FONT.caption, marginTop: 2 },
});
