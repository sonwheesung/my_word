import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { quizService } from '../services/quizService';
import type { QuizStatistics, MyPageStats } from '../services/quizService';
import AdBanner from '../components/AdBanner';

interface HomeScreenProps {
  onNavigateToManageWords: () => void;
  onAddWord: () => void;
  onStartQuiz: () => void;
  onViewStatistics: () => void;
  onMyPage: () => void;
  onManageCategories: () => void;
}

interface HomeSummary {
  totalWords: number;
  totalCategories: number;
  accuracy: number;
  totalQuizCount: number;
  streakDays: number;
}

const MENU_ITEMS = [
  { key: 'addWord', icon: '➕', title: '단어 추가', subtitle: '새로운 단어 등록' },
  { key: 'manageWords', icon: '📚', title: '단어장', subtitle: '단어 관리 및 검색' },
  { key: 'manageCategories', icon: '📂', title: '카테고리 관리', subtitle: '카테고리 추가 및 정리' },
  { key: 'startQuiz', icon: '✏️', title: '학습하기', subtitle: '퀴즈 및 복습' },
  { key: 'statistics', icon: '📊', title: '통계', subtitle: '학습 기록 확인' },
  { key: 'myPage', icon: '👤', title: '마이페이지', subtitle: '출석 현황 및 프로필' },
] as const;

export default function HomeScreen({
  onNavigateToManageWords,
  onAddWord,
  onStartQuiz,
  onViewStatistics,
  onMyPage,
  onManageCategories,
}: HomeScreenProps) {
  const [summary, setSummary] = useState<HomeSummary | null>(null);
  const [loading, setLoading] = useState(true);

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
      // 데이터 로딩 실패 시 기본값
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

  return (
    <ScrollView style={styles.container}>
      <StatusBar style="dark" />

      {/* 헤더 */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>반갑습니다!</Text>
          <Text style={styles.username}>My Word 📖</Text>
        </View>
      </View>

      {/* 학습 현황 요약 */}
      <View style={styles.summarySection}>
        {loading ? (
          <View style={styles.summaryLoading}>
            <ActivityIndicator size="small" color="#C4B5FD" />
          </View>
        ) : summary && (summary.totalWords > 0 || summary.totalQuizCount > 0) ? (
          <>
            <View style={styles.summaryRow}>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryValue}>{summary.totalWords}</Text>
                <Text style={styles.summaryLabel}>등록 단어</Text>
              </View>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryItem}>
                <Text style={styles.summaryValue}>{summary.totalCategories}</Text>
                <Text style={styles.summaryLabel}>카테고리</Text>
              </View>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryItem}>
                <Text style={[styles.summaryValue, styles.summaryAccuracy]}>
                  {summary.totalQuizCount > 0 ? `${Math.round(summary.accuracy)}%` : '-'}
                </Text>
                <Text style={styles.summaryLabel}>정답률</Text>
              </View>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryItem}>
                <Text style={[styles.summaryValue, styles.summaryStreak]}>
                  {summary.streakDays > 0 ? `${summary.streakDays}일` : '-'}
                </Text>
                <Text style={styles.summaryLabel}>연속 학습</Text>
              </View>
            </View>
            <View style={styles.streakBanner}>
              <Text style={styles.streakIcon}>{summary.streakDays > 0 ? '🔥' : '💡'}</Text>
              <Text style={styles.streakText}>{getStreakMessage(summary.streakDays)}</Text>
            </View>
          </>
        ) : (
          <View style={styles.summaryEmpty}>
            <Text style={styles.summaryEmptyIcon}>📝</Text>
            <Text style={styles.summaryEmptyText}>단어를 추가하고 학습을 시작해보세요!</Text>
          </View>
        )}
      </View>

      {/* 기능 버튼들 - 2열 그리드 */}
      <View style={styles.features}>
        <View style={styles.grid}>
          {MENU_ITEMS.map((item) => (
            <TouchableOpacity
              key={item.key}
              style={styles.gridItem}
              onPress={() => handlePress(item.key)}
              activeOpacity={0.7}
            >
              <Text style={styles.featureIcon}>{item.icon}</Text>
              <Text style={styles.featureTitle}>{item.title}</Text>
              <Text style={styles.featureSubtitle}>{item.subtitle}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* 하단 배너 광고 */}
      <AdBanner />
    </ScrollView>
  );
}

const cardShadow = Platform.OS === 'web'
  ? { boxShadow: '0 2px 8px rgba(0, 0, 0, 0.05)' }
  : {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.05,
      shadowRadius: 8,
      elevation: 2,
    };

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  header: {
    backgroundColor: '#FFFFFF',
    padding: 20,
    paddingTop: 56,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  greeting: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 2,
  },
  username: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#1A1A1A',
  },

  // 학습 현황 요약
  summarySection: {
    marginHorizontal: 16,
    marginTop: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    overflow: 'hidden',
    ...cardShadow,
  },
  summaryLoading: {
    padding: 24,
    alignItems: 'center',
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 8,
  },
  summaryItem: {
    flex: 1,
    alignItems: 'center',
  },
  summaryDivider: {
    width: 1,
    height: 32,
    backgroundColor: '#E5E7EB',
  },
  summaryValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#6366F1',
    marginBottom: 2,
  },
  summaryAccuracy: {
    color: '#10B981',
  },
  summaryStreak: {
    color: '#F59E0B',
  },
  summaryLabel: {
    fontSize: 11,
    color: '#9CA3AF',
    fontWeight: '500',
  },
  streakBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFBEB',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderTopColor: '#FEF3C7',
  },
  streakIcon: {
    fontSize: 16,
    marginRight: 8,
  },
  streakText: {
    fontSize: 13,
    color: '#92400E',
    fontWeight: '600',
    flex: 1,
  },
  summaryEmpty: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  summaryEmptyIcon: {
    fontSize: 20,
    marginRight: 10,
  },
  summaryEmptyText: {
    fontSize: 14,
    color: '#6B7280',
    flex: 1,
  },

  // 기능 버튼 그리드
  features: {
    padding: 16,
    paddingBottom: 32,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  gridItem: {
    width: '48%',
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 14,
    marginBottom: 12,
    ...cardShadow,
  },
  featureIcon: {
    fontSize: 26,
    marginBottom: 8,
  },
  featureTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#1A1A1A',
    marginBottom: 2,
  },
  featureSubtitle: {
    fontSize: 12,
    color: '#9CA3AF',
  },
});
