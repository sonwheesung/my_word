import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  ScrollView,
  ActivityIndicator,
  Animated,
  Dimensions,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialIcons } from '@expo/vector-icons';
import { quizService } from '../services/quizService';
import type { QuizStatistics, MyPageStats } from '../services/quizService';
import AdBanner from '../components/AdBanner';
import { useTheme } from '../contexts/ThemeContext';

interface HomeScreenProps {
  onNavigateToManageWords: () => void;
  onAddWord: () => void;
  onStartQuiz: () => void;
  onViewStatistics: () => void;
  onMyPage: () => void;
  onManageCategories: () => void;
  onSettings: () => void;
}

interface HomeSummary {
  totalWords: number;
  totalCategories: number;
  accuracy: number;
  totalQuizCount: number;
  streakDays: number;
}

const PRIMARY_MENU = [
  { key: 'startQuiz', icon: 'school' as const, title: '학습하기', subtitle: '퀴즈로 단어 복습' },
  { key: 'addWord', icon: 'add' as const, title: '단어 추가', subtitle: '새로운 단어 등록' },
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
  onViewStatistics,
  onMyPage,
  onManageCategories,
  onSettings,
}: HomeScreenProps) {
  const { colors } = useTheme();
  const [summary, setSummary] = useState<HomeSummary | null>(null);
  const [loading, setLoading] = useState(true);

  // 진입 애니메이션
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 600,
        useNativeDriver: true,
      }),
    ]).start();
  }, [fadeAnim, slideAnim]);

  const loadSummary = useCallback(async () => {
    try {
      const [stats, myPage]: [QuizStatistics, MyPageStats] = await Promise.all([
        quizService.getStatistics(),
        quizService.getMyPageStats(),
      ]);
      setSummary({
        totalWords: stats.totalWordCount,
        totalCategories: stats.totalCategoryCount,
        accuracy: stats.accuracy,
        totalQuizCount: stats.totalQuizCount,
        streakDays: myPage.streakDays,
      });
    } catch {
      setSummary({ totalWords: 0, totalCategories: 0, accuracy: 0, totalQuizCount: 0, streakDays: 0 });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  const handlePress = useCallback((key: string) => {
    switch (key) {
      case 'addWord': return onAddWord();
      case 'manageWords': return onNavigateToManageWords();
      case 'manageCategories': return onManageCategories();
      case 'startQuiz': return onStartQuiz();
      case 'statistics': return onViewStatistics();
      case 'myPage': return onMyPage();
    }
  }, [onAddWord, onNavigateToManageWords, onManageCategories, onStartQuiz, onViewStatistics, onMyPage]);

  const getStreakMessage = (streak: number): string => {
    if (streak === 0) return '오늘 첫 학습을 시작해보세요!';
    if (streak < 3) return `${streak}일 연속 학습 중! 계속 가보자!`;
    if (streak < 7) return `${streak}일 연속! 좋은 습관이 만들어지고 있어요`;
    return `${streak}일 연속! 대단해요!`;
  };

  const renderStatItem = (value: string, label: string, color?: string) => (
    <View style={styles.statItem}>
      <Text style={[styles.statValue, color ? { color } : { color: '#FFFFFF' }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      showsVerticalScrollIndicator={false}
    >
      <StatusBar style="light" />

      {/* 히어로 섹션 - 그라데이션 */}
      <LinearGradient
        colors={[colors.gradientStart, colors.gradientEnd]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.hero}
      >
        {/* 장식 원형 */}
        <View style={[styles.decorCircle, styles.decorCircle1]} />
        <View style={[styles.decorCircle, styles.decorCircle2]} />

        {/* 헤더 */}
        <View style={styles.heroHeader}>
          <View>
            <Text style={styles.heroGreeting}>반갑습니다!</Text>
            <Text style={styles.heroTitle}>My Word</Text>
          </View>
          <TouchableOpacity
            onPress={onSettings}
            activeOpacity={0.7}
            style={styles.settingsBtn}
          >
            <MaterialIcons name="settings" size={22} color="rgba(255,255,255,0.9)" />
          </TouchableOpacity>
        </View>

        {/* 통계 카드 */}
        {loading ? (
          <View style={styles.statsLoading}>
            <ActivityIndicator size="small" color="rgba(255,255,255,0.8)" />
          </View>
        ) : summary && (summary.totalWords > 0 || summary.totalQuizCount > 0) ? (
          <Animated.View
            style={[
              styles.statsContainer,
              { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
            ]}
          >
            <View style={styles.statsRow}>
              {renderStatItem(`${summary.totalWords}`, '등록 단어')}
              <View style={styles.statDivider} />
              {renderStatItem(
                summary.totalQuizCount > 0 ? `${Math.round(summary.accuracy)}%` : '-',
                '정답률',
                summary.totalQuizCount > 0 ? '#A7F3D0' : '#FFFFFF',
              )}
              <View style={styles.statDivider} />
              {renderStatItem(
                summary.streakDays > 0 ? `${summary.streakDays}일` : '-',
                '연속 학습',
                summary.streakDays > 0 ? '#FDE68A' : '#FFFFFF',
              )}
            </View>
          </Animated.View>
        ) : (
          <View style={styles.heroEmpty}>
            <MaterialIcons name="edit-note" size={24} color="rgba(255,255,255,0.85)" style={{ marginRight: 12 }} />
            <Text style={styles.heroEmptyText}>단어를 추가하고 학습을 시작해보세요!</Text>
          </View>
        )}

        {/* 연속 학습 배너 */}
        {!loading && summary && (summary.totalWords > 0 || summary.totalQuizCount > 0) && (
          <View style={styles.streakBanner}>
            <MaterialIcons
              name={summary.streakDays > 0 ? 'local-fire-department' : 'lightbulb-outline'}
              size={18}
              color="rgba(255,255,255,0.9)"
              style={{ marginRight: 8 }}
            />
            <Text style={styles.streakText}>
              {getStreakMessage(summary.streakDays)}
            </Text>
          </View>
        )}
      </LinearGradient>

      {/* 메인 메뉴 - 강조 카드 2개 */}
      <Animated.View
        style={[
          styles.menuSection,
          { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
        ]}
      >
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
              <Text style={[styles.primaryTitle, { color: colors.text }]}>{item.title}</Text>
              <Text style={[styles.primarySubtitle, { color: colors.textTertiary }]}>
                {item.subtitle}
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
              <Text style={[styles.secondaryTitle, { color: colors.text }]}>{item.title}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </Animated.View>

      {/* 하단 광고 */}
      <AdBanner />
    </ScrollView>
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
const PRIMARY_CARD_WIDTH = (SCREEN_WIDTH - SECTION_PADDING * 2 - CARD_GAP) / 2;
const SECONDARY_CARD_WIDTH = (SCREEN_WIDTH - SECTION_PADDING * 2 - CARD_GAP * 3) / 4;

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },

  // ── 히어로 섹션 ──
  hero: {
    paddingTop: 56,
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
  settingsBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
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
  streakText: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.9)',
    fontWeight: '600',
    flex: 1,
  },

  // ── Empty State (히어로 내) ──
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
    paddingVertical: 22,
    paddingHorizontal: 16,
    borderRadius: 20,
    alignItems: 'center',
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  primaryTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  primarySubtitle: {
    fontSize: 12,
  },

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
