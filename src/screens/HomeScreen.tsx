import { useTranslation } from 'react-i18next';
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  ScrollView,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialIcons } from '@expo/vector-icons';
import { quizService } from '../services/quizService';
import type { QuizStatistics, MyPageStats } from '../services/quizService';
import { srsService } from '../services/srsService';
import AdBanner from '../components/AdBanner';
import { useTheme } from '../contexts/ThemeContext';
import { useBootstrap } from '../contexts/BootstrapContext';
import { useNotification } from '../contexts/NotificationContext';
import NotificationPromptSheet from '../components/NotificationPromptSheet';
import TodayCard from '../components/TodayCard';
import { wordService } from '../services/wordService';
import type { Word } from '../types/word';
import OnboardingPanel, {
  shouldHideMenu,
  shouldShowOnboarding,
} from '../components/OnboardingPanel';
import { SPACING } from '../constants/design';

interface HomeScreenProps {
  onNavigateToManageWords: () => void;
  onAddWord: () => void;
  onStartQuiz: () => void;
  /** 플래시카드. 채점하지 않고 카드만 넘겨보는 모드라 퀴즈와 입구를 따로 둔다 */
  onFlashcards: () => void;
  /**
   * AI 시험. 🔴 **첫 줄 네 번째 칸으로 넣지 않는다.**
   *
   * 첫 줄은 2026-09-10 에 두 칸 → 세 칸이 되면서 카드 폭이 154 → **99**(360 기준)로 줄었고,
   * 그때 부제를 지우고 제목을 두 줄까지 받게 해서 겨우 맞췄다. 네 칸이면 71 이 되어
   * 「플래시카드」가 세 줄로 터진다 — 그 판단은 이미 안 A 로 끝난 자리다.
   * 그래서 **전용 띠**로 둔다(기획 C안). 새 기능이고 설명이 필요하므로 띠가 오히려 맞다.
   */
  onAiExam: () => void;
  /** 복습 배너. 만기인 단어 id 를 그대로 넘겨 카테고리를 가로질러 출제한다 */
  onStartReview: (wordIds: number[]) => void;
  onViewStatistics: () => void;
  onMyPage: () => void;
  onManageCategories: () => void;
  onSettings: () => void;
  onNotices: () => void;
  /**
   * CSV 가져오기. **첫 사용자 안내 카드에서만 쓴다**(2026-10-08 시안 #2).
   *
   * ⚠ 평소에는 단어장의 `받기` 로 들어간다. 홈에 상시로 두지 않는 이유는, 단어가 이미 있는
   *   사람에게 가져오기는 드문 일이라 자리값을 못 하기 때문이다. **아무것도 없을 때만** 길이 된다.
   */
  onImportWords: () => void;
}

interface HomeSummary {
  totalWords: number;
  totalCategories: number;
  accuracy: number;
  totalQuizCount: number;
  streakDays: number;
}

/** 복습 배너를 눌렀을 때 한 번에 내는 문제 수. 만기가 23개여도 10개씩 나눠 푼다 */
const REVIEW_SESSION_SIZE = 10;

/** 홈에 보여 줄 최근 단어 수 (2026-10-08 시안 #1). ⚠ 세 개를 넘으면 홈이 길어진다 */
const RECENT_COUNT = 3;

/**
 * 큰 카드 줄. **매일 하는 일 셋**이다. 익히고(플래시카드) · 재고(학습하기) · 넣고(단어 추가).
 *
 * 🔴 **부제가 없다.** 2026-09-10 에 두 칸에서 세 칸으로 늘렸는데, 카드 폭이 154 에서 99 로
 *    줄어(화면 360 기준) 12sp 부제가 영어·일본어에서 세 줄로 터진다. 셋 다 이름만 남겼다.
 *    사용자 결정(안 A). 부제를 지키려면 2×2 로 가야 했고 그건 홈이 한 줄 길어지는 값이었다.
 */
const PRIMARY_MENU = [
  { key: 'startQuiz', icon: 'school' as const, title: '학습하기' },
  { key: 'flashcards', icon: 'style' as const, title: '플래시카드' },
  { key: 'addWord', icon: 'add' as const, title: '단어 추가' },
];

const SECONDARY_MENU = [
  { key: 'manageWords', icon: 'menu-book' as const, title: '단어장' },
  { key: 'manageCategories', icon: 'folder-open' as const, title: '카테고리' },
  { key: 'statistics', icon: 'bar-chart' as const, title: '통계' },
  { key: 'myPage', icon: 'person-outline' as const, title: '마이' },
];

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function HomeScreen({
  onNavigateToManageWords,
  onAddWord,
  onStartQuiz,
  onFlashcards,
  onAiExam,
  onStartReview,
  onViewStatistics,
  onMyPage,
  onManageCategories,
  onSettings,
  onNotices,
  onImportWords,
}: HomeScreenProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  // 상태바 높이는 기기마다 다르다. 56 으로 박아 두면 노치·펀치홀 기기에서 어긋난다
  const insets = useSafeAreaInsets();
  const { unreadCount } = useBootstrap();
  const notify = useNotification();
  const [summary, setSummary] = useState<HomeSummary | null>(null);
  const [dueCount, setDueCount] = useState(0);
  /**
   * 마이 화면이 쓰는 그 통계. 🔴 **홈이 이미 받아 오고 있었다** — 스트릭만 꺼내 쓰고
   * `activities` 는 버리고 있었다. 오늘 카드(시안 #1)의 막대가 바로 그 값이다.
   */
  const [myPage, setMyPage] = useState<MyPageStats | null>(null);
  /** 최근 추가한 단어 3개 (시안 #1). ⚠ 못 읽어도 홈은 멀쩡해야 하므로 빈 배열로 둔다 */
  const [recent, setRecent] = useState<Word[]>([]);
  const [loading, setLoading] = useState(true);
  // 배너를 연타해도 퀴즈가 두 번 시작되지 않게 한다
  const [startingReview, setStartingReview] = useState(false);

  const loadSummary = useCallback(async () => {
    try {
      // 🔴 만기 계산은 여기서 처음 일어난다 — 부팅 경로가 아니다.
      //    저장본이 없거나 이력과 어긋나면 이 안에서 재생되므로, 앱 시작을 막지 않는다.
      const [stats, myPage, due]: [QuizStatistics, MyPageStats, Awaited<ReturnType<typeof srsService.getDueSummary>>] =
        await Promise.all([
          quizService.getStatistics(),
          quizService.getMyPageStats(),
          srsService.getDueSummary(),
        ]);
      /*
       * 최근 추가한 단어. ⚠ **따로 읽는다** — 위 셋은 통계라 단어 본문을 안 들고 온다.
       *   실패해도 삼킨다(오프라인에 오류를 띄우지 않는 규율).
       */
      try {
        const words = await wordService.getWords();
        setRecent(
          [...words]
            .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0))
            .slice(0, RECENT_COUNT),
        );
      } catch {
        setRecent([]);
      }
      setDueCount(due.total);
      setMyPage(myPage);
      setSummary({
        totalWords: stats.totalWordCount,
        totalCategories: stats.totalCategoryCount,
        accuracy: stats.accuracy,
        totalQuizCount: stats.totalQuizCount,
        streakDays: myPage.streakDays,
      });
    } catch {
      setDueCount(0);
      setMyPage(null);
      setSummary({ totalWords: 0, totalCategories: 0, accuracy: 0, totalQuizCount: 0, streakDays: 0 });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  /**
   * 알림 권유를 띄울 때.
   *
   * **퀴즈를 한 번이라도 끝낸 사람에게만** 보여 준다 — 아직 안 써 본 사람에게 "복습을 알려
   * 줄까요?"는 무슨 말인지 알 수 없다. 퀴즈 결과 화면에서 홈으로 돌아오면 이 화면이 다시
   * 마운트되며 summary 를 새로 읽으므로, 첫 퀴즈 직후에 자연스럽게 걸린다.
   * (결과 화면에 두지 않은 이유는 NotificationPromptSheet 주석 참조 — 전면 광고와 겹친다)
   */
  const showNotifyPrompt =
    !loading && summary !== null && summary.totalQuizCount > 0 && notify.shouldPrompt;

  const handlePress = useCallback((key: string) => {
    switch (key) {
      case 'addWord': return onAddWord();
      case 'manageWords': return onNavigateToManageWords();
      case 'manageCategories': return onManageCategories();
      case 'startQuiz': return onStartQuiz();
      case 'flashcards': return onFlashcards();
      case 'aiExam': return onAiExam();
      case 'statistics': return onViewStatistics();
      case 'myPage': return onMyPage();
    }
  }, [onAddWord, onNavigateToManageWords, onManageCategories, onStartQuiz, onFlashcards, onAiExam, onViewStatistics, onMyPage]);

  /**
   * 복습 배너를 눌렀을 때. 만기 단어를 여기서 뽑아 넘긴다.
   *
   * 배너의 숫자(23)를 다 내지 않고 **한 세션 분량만** 낸다 — 23문제를 강제하면 그게 숙제다.
   * 풀고 돌아오면 화면이 다시 마운트되며 배너 숫자가 줄어 있다.
   */
  const handleStartReview = useCallback(async () => {
    if (startingReview) return;
    setStartingReview(true);
    try {
      const ids = await srsService.getDueWordIds(REVIEW_SESSION_SIZE);
      if (ids.length === 0) {
        // 다른 기기에서 풀었거나 단어를 지운 사이에 비었을 수 있다. 조용히 숫자만 맞춘다
        setDueCount(0);
        return;
      }
      onStartReview(ids);
    } catch {
      // 만기를 못 뽑아도 홈은 그대로 둔다
    } finally {
      setStartingReview(false);
    }
  }, [startingReview, onStartReview]);

  const getStreakMessage = (streak: number): string => {
    if (streak === 0) return t('오늘 첫 학습을 시작해보세요!');
    if (streak < 3) return t('{{count}}일 연속 학습 중! 계속 가보자!', { count: streak });
    if (streak < 7) return t('{{count}}일 연속! 좋은 습관이 만들어지고 있어요', { count: streak });
    return t('{{count}}일 연속! 대단해요!', { count: streak });
  };

  const renderStatItem = (value: string, label: string, color?: string) => (
    <View style={styles.statItem}>
      <Text style={[styles.statValue, color ? { color } : { color: '#FFFFFF' }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );

  /*
   * 첫 사용자 안내(2026-10-08 시안 #2). **판정은 `OnboardingPanel` 이 내보낸 함수가 한다** —
   * 조건을 여기에 한 벌 더 적으면 둘이 갈라지고, 갈라진 쪽은 아무도 모른다.
   *
   * ⚠ 불러오기 전(`summary === null`)에는 **아무것도 숨기지 않는다.** 0 으로 가정하면
   *   단어가 많은 사람도 켤 때마다 메뉴가 한 번 사라졌다 돌아온다.
   */
  const onboarding = !loading && summary !== null
    ? {
        show: shouldShowOnboarding(summary.totalWords, summary.totalQuizCount),
        hideMenu: shouldHideMenu(summary.totalWords, summary.totalQuizCount),
      }
    : { show: false, hideMenu: false };

  return (
    /*
     * ⚠ 배너를 ScrollView **밖**에 둔다. 안에 두면 콘텐츠의 맨 끝에 붙어 같이 스크롤되고,
     *   화면 하단(네비게이션 바 위)에 보이지 않는다. `ManageWordsScreen` 과 같은 구조다.
     */
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
        <StatusBar style="light" />

      {/* 히어로 섹션 - 그라데이션 */}
      <LinearGradient
        colors={[colors.gradientStart, colors.gradientEnd]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.hero, { paddingTop: insets.top + SPACING.lg }]}
      >
        {/* 장식 원형 */}
        <View style={[styles.decorCircle, styles.decorCircle1]} />
        <View style={[styles.decorCircle, styles.decorCircle2]} />

        {/* 헤더 */}
        <View style={styles.heroHeader}>
          <View>
            <Text style={styles.heroGreeting}>{t('반갑습니다!')}</Text>
            <Text style={styles.heroTitle}>My Word</Text>
          </View>
          <View style={styles.heroActions}>
            <TouchableOpacity
              onPress={onNotices}
              activeOpacity={0.7}
              style={styles.settingsBtn}
              accessibilityLabel={
                unreadCount > 0 ? t('공지사항, 읽지 않음 {{count}}건', { count: unreadCount }) : t('공지사항')
              }
            >
              <MaterialIcons name="notifications-none" size={22} color="rgba(255,255,255,0.9)" />
              {unreadCount > 0 && <View style={styles.unreadDot} />}
            </TouchableOpacity>
            <TouchableOpacity
              onPress={onSettings}
              activeOpacity={0.7}
              style={styles.settingsBtn}
              accessibilityLabel={t('설정')}
            >
              <MaterialIcons name="settings" size={22} color="rgba(255,255,255,0.9)" />
            </TouchableOpacity>
          </View>
        </View>

        {/*
          🔴 **통계 3칸과 스트릭 문구를 걷어냈다**(2026-10-08 시안 #1).
             아래 흰 카드가 같은 것을 **더 많이** 말한다 — 오늘 얼마나 했나 · 며칠째인가 ·
             최근 일주일은 어땠나. 같은 것을 두 번 말하면 둘 다 약해진다.
          ⚠ 히어로는 인사말과 버튼만 남아 **짧아졌다.** 시안은 흰 바탕을 그렸지만
            여기서는 머리띠만 줄였다 — 색까지 바꾸는 것은 앱 전체의 인상을 바꾸는 일이라 따로 본다.
        */}

        {/*
          복습 배너 — 🔴 **이제 만기가 있을 때만 뜬다.**
          예전에는 만기가 없으면 스트릭 문구가 그 자리를 썼는데, 그 스트릭은 **바로 아래 카드**가
          더 크게 말한다. 빈자리가 생기는 것도 예전 걱정이었지만, 지금은 그 아래에 카드가 붙어 있다.
        */}
        {!loading && summary !== null && dueCount > 0 && summary.totalQuizCount > 0 && (
          <TouchableOpacity
            style={[styles.streakBanner, styles.reviewBanner]}
            onPress={handleStartReview}
            disabled={startingReview}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={t('오늘 복습할 단어 {{count}}개', { count: dueCount })}
          >
            <MaterialIcons
              name="menu-book"
              size={18}
              color="rgba(255,255,255,0.9)"
              style={{ marginRight: 8 }}
            />
            <Text style={styles.streakText}>
              {t('오늘 복습할 단어 {{count}}개', { count: dueCount })}
            </Text>
            <MaterialIcons name="chevron-right" size={18} color="rgba(255,255,255,0.75)" />
          </TouchableOpacity>
        )}
      </LinearGradient>

      {/*
        오늘 카드 (시안 #1). 🔴 퀴즈를 한 번이라도 푼 사람에게만 — 아무것도 안 한 사람에게
        「오늘 목표 10문제 중 0문제」와 빈 막대 일곱 칸은 **독촉**으로만 읽힌다.
        그 사람에게는 바로 아래 첫 사용자 안내가 더 맞다.
      */}
      {!loading && summary !== null && summary.totalQuizCount > 0 && myPage !== null && (
        <>
          <TodayCard streakDays={summary.streakDays} activities={myPage.activities} />
          <Text style={[styles.quickStat, { color: colors.textSecondary }]}>
            {t('단어 {{words}} · 정답률 {{acc}}%', {
              words: summary.totalWords,
              acc: Math.round(summary.accuracy),
            })}
          </Text>
        </>
      )}

      {/*
        첫 사용자 안내 — 아직 한 판도 안 풀었을 때만. 자세한 규칙은 `OnboardingPanel` 머리 주석에 있다.
      */}
      {onboarding.show && summary !== null && (
        <OnboardingPanel
          wordCount={summary.totalWords}
          quizCount={summary.totalQuizCount}
          onAddWord={onAddWord}
          onImportWords={onImportWords}
          onStartQuiz={onStartQuiz}
        />
      )}

      {/*
        메인 메뉴 — 강조 카드 3개 + 소형 4개 + AI 시험 띠.
        🔴 **단어가 0개일 때만 통째로 숨긴다.** 숨기는 조건을 "퀴즈를 풀 때까지"로 넓히면
           단어를 잔뜩 넣어 두고 아직 안 푼 사람이 단어장·통계에 못 들어간다.
      */}
      {!onboarding.hideMenu && (
      <View style={styles.menuSection}>
        <View style={styles.primaryGrid}>
          {PRIMARY_MENU.map((item) => (
            <TouchableOpacity
              key={item.key}
              style={[
                styles.primaryCard,
                { backgroundColor: colors.card },
                cardShadow,
              ]}
              onPress={() => handlePress(item.key)}
              activeOpacity={0.7}
            >
              <View style={[styles.iconCircle, { backgroundColor: colors.primaryLight }]}>
                <MaterialIcons name={item.icon} size={28} color={colors.primary} />
              </View>
              <Text
                style={[styles.primaryTitle, { color: colors.text }]}
                // 세 칸이 되어 폭이 좁다(360 기준 99). 「플래시카드」·Flashcards 는 두 줄까지 쓴다.
                // 🚫 `adjustsFontSizeToFit` 을 쓰지 않는다. RN 에서 iOS 전용이라 이 앱(안드로이드)
                //    에서는 아무 일도 안 하고, 있으면 "글자가 줄어드니 괜찮다"고 오해하게 만든다.
                //    세 줄로 터지는지는 `i18n-layout-audit` 로 눈으로 잰다.
                numberOfLines={2}
              >
                {t(item.title)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* 서브 메뉴 - 4열 소형 카드 */}
        <View style={styles.secondaryGrid}>
          {SECONDARY_MENU.map((item) => (
            <TouchableOpacity
              key={item.key}
              style={[
                styles.secondaryCard,
                { backgroundColor: colors.card },
                cardShadow,
              ]}
              onPress={() => handlePress(item.key)}
              activeOpacity={0.7}
            >
              <View style={[styles.iconCircleSmall, { backgroundColor: colors.primaryLight }]}>
                <MaterialIcons name={item.icon} size={22} color={colors.primary} />
              </View>
              <Text style={[styles.secondaryTitle, { color: colors.text }]}>{t(item.title)}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/*
          AI 시험 — 전용 띠(기획 C안). **메뉴 맨 아래**(2026-10-07 사장님 지시로 가운데에서 내렸다).
          🔴 첫 줄에 네 번째 칸으로 넣지 않은 이유는 props 주석에 있다(폭 99 → 71).
          ⚠ 인터넷이 필요한 **유일한 학습 기능**이라 그 사실을 띠 안에 적는다.
            미리 회색으로 만들지는 않는다 — 이 앱의 규율이 "서버가 죽어도 화면은 멀쩡히"다.
        */}
        <TouchableOpacity
          style={[styles.examBand, { backgroundColor: colors.card }, cardShadow]}
          onPress={() => handlePress('aiExam')}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={t('AI 시험')}
        >
          <View style={[styles.examIcon, { backgroundColor: colors.primaryLight }]}>
            <MaterialIcons name="auto-awesome" size={24} color={colors.primary} />
          </View>
          <View style={styles.examTexts}>
            <Text style={[styles.examTitle, { color: colors.text }]} numberOfLines={1}>
              {t('AI 시험')}
            </Text>
            <Text style={[styles.examSubtitle, { color: colors.textSecondary }]} numberOfLines={2}>
              {t('내 단어로 문제를 만들어요 · 인터넷 필요')}
            </Text>
          </View>
          <MaterialIcons name="chevron-right" size={20} color={colors.textTertiary} />
        </TouchableOpacity>
      </View>
      )}

      {/*
        최근 추가한 단어 (시안 #1). ⚠ **맨 아래**에 둔다 — 새로 넣은 것을 확인하는 자리이지
        매일 먼저 보는 것이 아니다. 누르면 그 단어를 고치는 화면으로 간다.
      */}
      {!loading && recent.length > 0 && (
        <View style={styles.recentSection}>
          <View style={styles.recentHead}>
            <Text style={[styles.recentTitle, { color: colors.text }]}>{t('최근 추가한 단어')}</Text>
            <TouchableOpacity onPress={onNavigateToManageWords} accessibilityRole="button">
              <Text style={[styles.recentAll, { color: colors.primaryStrong }]}>{t('전체')} ›</Text>
            </TouchableOpacity>
          </View>
          {recent.map((w) => (
            <TouchableOpacity
              key={w.wordId}
              style={[styles.recentRow, { backgroundColor: colors.card, borderColor: colors.border }]}
              // ⚠ 단어장으로 보낸다. 바로 수정으로 보내려면 prop 을 하나 더 늘려야 하는데,
              //   최근 단어를 누르는 것은 **다시 보려는 것**이지 고치려는 것이 아닌 경우가 더 많다
              onPress={onNavigateToManageWords}
              activeOpacity={0.7}
              accessibilityRole="button"
            >
              <Text style={[styles.recentWord, { color: colors.text }]} numberOfLines={1}>
                {w.word}
              </Text>
              <Text style={[styles.recentMeaning, { color: colors.textSecondary }]} numberOfLines={1}>
                {w.meanings[0] ?? ''}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      </ScrollView>

      {/* 하단 광고 — 스크롤과 무관하게 화면 아래에 고정된다 */}
      <AdBanner />

      <NotificationPromptSheet visible={showNotifyPrompt} />
    </View>
  );
}

const cardShadow = Platform.OS === 'web'
  ? { boxShadow: '0 4px 16px rgba(0, 0, 0, 0.08)' }
  : {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.08,
      shadowRadius: 16,
      elevation: 4,
    };

const CARD_GAP = 12;
const SECTION_PADDING = 20;
// 2026-09-10: 두 칸 → 세 칸(플래시카드 추가). 360 기준 154 → 99
const PRIMARY_CARD_WIDTH = (SCREEN_WIDTH - SECTION_PADDING * 2 - CARD_GAP * 2) / 3;
const SECONDARY_CARD_WIDTH = (SCREEN_WIDTH - SECTION_PADDING * 2 - CARD_GAP * 3) / 4;

const styles = StyleSheet.create({
  // ── 최근 추가한 단어 (시안 #1) ──
  recentSection: { paddingHorizontal: 16, paddingTop: 20 },
  recentHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  recentTitle: { fontSize: 15, fontWeight: '700' },
  recentAll: { fontSize: 13, fontWeight: '600' },
  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 8,
    minHeight: 48,
  },
  recentWord: { fontSize: 15, fontWeight: '700', maxWidth: '45%' },
  recentMeaning: { fontSize: 13, flex: 1 },

  /** 오늘 카드 아래 한 줄 요약 (시안 #1). 카드가 못 담는 둘만 적는다 */
  quickStat: {
    fontSize: 13,
    textAlign: 'center',
    marginTop: 10,
    marginHorizontal: 16,
  },

  container: {
    flex: 1,
  },

  // ── 히어로 섹션 ──
  hero: {
    paddingBottom: 28,
    paddingHorizontal: SECTION_PADDING,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    overflow: 'hidden',
    position: 'relative',
  },
  decorCircle: {
    position: 'absolute',
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  decorCircle1: {
    width: 200,
    height: 200,
    top: -60,
    right: -40,
  },
  decorCircle2: {
    width: 120,
    height: 120,
    bottom: -20,
    left: -30,
  },
  heroHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 24,
  },
  heroGreeting: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.8)',
    marginBottom: 4,
  },
  heroTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFFFFF',
    letterSpacing: -0.5,
  },
  heroActions: {
    flexDirection: 'row',
    gap: 8,
  },
  settingsBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  unreadDot: {
    position: 'absolute',
    top: 9,
    right: 9,
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: '#EF4444',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.9)',
  },

  // ── 통계 ──
  statsLoading: {
    padding: 20,
    alignItems: 'center',
  },
  statsContainer: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 20,
    paddingVertical: 18,
    paddingHorizontal: 12,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.7)',
    fontWeight: '500',
  },
  statDivider: {
    width: 1,
    height: 28,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },

  // ── 연속 학습 배너 ──
  streakBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginTop: 14,
  },
  // 누를 수 있다는 것만 배경 한 단계로 알린다. 나머지 치수는 streakBanner 를 그대로 쓴다
  reviewBanner: {
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  streakText: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.9)',
    fontWeight: '600',
    flex: 1,
  },

  // ── Empty State (히어로 내) ──
  // 통계 자리를 비울 때 쓰는 빈 칸. 높이를 0 으로 두면 히어로가 위로 붙어 인사말이 잘려 보인다
  heroEmptySpacer: { height: SPACING.sm },
  heroEmpty: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 16,
    padding: 16,
  },
  heroEmptyText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.85)',
    flex: 1,
    fontWeight: '500',
  },

  // ── 메뉴 섹션 ──
  menuSection: {
    padding: SECTION_PADDING,
    paddingTop: 24,
    paddingBottom: 12,
  },

  // ── 강조 카드 (2열) ──
  primaryGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  primaryCard: {
    width: PRIMARY_CARD_WIDTH,
    paddingVertical: 20,
    // 세 칸이 되며 16 → 8. 폭 99 에 아이콘 48 을 넣으려면 여백을 줄여야 한다
    paddingHorizontal: 8,
    borderRadius: 20,
    alignItems: 'center',
  },
  iconCircle: {
    // 56 → 48. 좁아진 카드에서 아이콘이 글자 자리를 먹지 않게 한다
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  primaryTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    textAlign: 'center',
  },

  // ── AI 시험 전용 띠 (2026-10-07) ──
  // 🔴 가로 전체를 쓰므로 글자가 길어져도 터지지 않는다. 첫 줄 네 번째 칸으로 넣지 않은
  //    이유가 그것이다(그 자리는 360 기준 71 이 된다).
  examBand: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 14,
    // 🔴 맨 아래로 내렸으므로 여백을 **위에** 준다(2026-10-07). 아래에 두면 서브 카드와 붙고
    //    띠 밑에 빈 공간이 뜬다
    marginTop: 12,
    // 터치 영역 바닥. 띠가 얇아지면 누르기 어려워진다
    minHeight: 64,
  },
  examIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  examTexts: { flex: 1 },
  examTitle: { fontSize: 15, fontWeight: 'bold' },
  // ⚠ 부제를 둘 수 있는 것이 띠의 이득이다. 첫 줄 카드는 폭이 좁아 부제를 지웠다
  examSubtitle: { fontSize: 12, marginTop: 2, lineHeight: 16 },

  // ── 서브 카드 (4열) ──
  secondaryGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  secondaryCard: {
    width: SECONDARY_CARD_WIDTH,
    paddingVertical: 16,
    paddingHorizontal: 8,
    borderRadius: 16,
    alignItems: 'center',
  },
  iconCircleSmall: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  secondaryTitle: {
    fontSize: 12,
    fontWeight: '600',
  },
});
