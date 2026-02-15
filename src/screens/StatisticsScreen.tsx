import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Platform,
  RefreshControl,
  Modal,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { quizService, QuizStatistics, WordQuizStats } from '../services/quizService';
import Toast from '../components/Toast';
import { useToast } from '../hooks/useToast';
import ScreenHeader from '../components/ScreenHeader';
import SkeletonLoader from '../components/SkeletonLoader';

type SortKey = 'word' | 'accuracy' | 'totalCount' | 'correctCount' | 'incorrectCount';
type SortOrder = 'asc' | 'desc';

interface StatisticsScreenProps {
  onBack: () => void;
}

export default function StatisticsScreen({ onBack }: StatisticsScreenProps) {
  const { toast, showToast, hideToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [statistics, setStatistics] = useState<QuizStatistics | null>(null);

  // 단어 정답률 모달
  const [showWordStats, setShowWordStats] = useState(false);
  const [wordStatsLoading, setWordStatsLoading] = useState(false);
  const [wordStats, setWordStats] = useState<WordQuizStats[]>([]);
  const [sortKey, setSortKey] = useState<SortKey>('word');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');

  useEffect(() => {
    loadStatistics();
  }, []);

  const loadStatistics = async () => {
    try {
      setLoading(true);
      const stats = await quizService.getStatistics();
      setStatistics(stats);
    } catch (error: any) {
      console.error('통계 조회 실패:', error);
      showToast('통계를 불러오는데 실패했습니다', 'error');
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await loadStatistics();
    } finally {
      setRefreshing(false);
    }
  };

  const openWordStats = async () => {
    setShowWordStats(true);
    setWordStatsLoading(true);
    try {
      const stats = await quizService.getWordQuizStats();
      setWordStats(stats);
    } catch (error: any) {
      console.error('단어별 통계 조회 실패:', error);
      showToast('단어별 통계를 불러오는데 실패했습니다', 'error');
    } finally {
      setWordStatsLoading(false);
    }
  };

  const handleSortPress = (key: SortKey) => {
    if (sortKey === key) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortOrder(key === 'word' ? 'asc' : 'desc');
    }
  };

  const sortedWordStats = useMemo(() => {
    const sorted = [...wordStats];
    sorted.sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'word') {
        cmp = a.word.localeCompare(b.word);
      } else {
        cmp = a[sortKey] - b[sortKey];
      }
      return sortOrder === 'asc' ? cmp : -cmp;
    });
    return sorted;
  }, [wordStats, sortKey, sortOrder]);

  const getSortLabel = (key: SortKey): string => {
    switch (key) {
      case 'word': return '단어';
      case 'accuracy': return '정답률';
      case 'totalCount': return '횟수';
      case 'correctCount': return '정답';
      case 'incorrectCount': return '오답';
    }
  };

  const getAccuracyColor = (accuracy: number): string => {
    if (accuracy >= 80) return '#10B981';
    if (accuracy >= 50) return '#F59E0B';
    return '#EF4444';
  };

  const getMotivationMessage = (): { emoji: string; title: string; desc: string } | null => {
    if (!statistics || statistics.totalQuizCount === 0) return null;

    const { accuracy, totalQuizCount, weakWordCount, correctCount } = statistics;

    if (accuracy >= 90) {
      return {
        emoji: '🏆',
        title: '놀라운 실력이에요!',
        desc: `정답률 ${accuracy.toFixed(0)}%! 완벽에 가까운 학습 성과입니다`,
      };
    }
    if (accuracy >= 70) {
      return {
        emoji: '🔥',
        title: '잘하고 있어요!',
        desc: `정답률 ${accuracy.toFixed(0)}%! 조금만 더 하면 마스터할 수 있어요`,
      };
    }
    if (accuracy >= 50) {
      return {
        emoji: '💪',
        title: '꾸준히 성장 중!',
        desc: weakWordCount > 0
          ? `취약 단어 ${weakWordCount}개를 집중 학습해보세요`
          : '반복 학습으로 정답률을 높여보세요',
      };
    }
    return {
      emoji: '📖',
      title: '포기하지 마세요!',
      desc: `${correctCount}개나 맞혔어요! 반복하면 반드시 늘어납니다`,
    };
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <StatusBar style="dark" />
        <ScreenHeader title="학습 통계" onBack={onBack} />
        <View style={{ padding: 16 }}>
          {/* 통계 카드 스켈레톤 */}
          <View style={styles.skeletonCard}>
            <SkeletonLoader width="40%" height={18} style={{ marginBottom: 16 }} />
            <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
              <View style={{ alignItems: 'center' }}>
                <SkeletonLoader width={60} height={32} style={{ marginBottom: 8 }} />
                <SkeletonLoader width={50} height={14} />
              </View>
              <View style={{ alignItems: 'center' }}>
                <SkeletonLoader width={60} height={32} style={{ marginBottom: 8 }} />
                <SkeletonLoader width={50} height={14} />
              </View>
            </View>
          </View>
          <View style={styles.skeletonCard}>
            <SkeletonLoader width="35%" height={18} style={{ marginBottom: 16 }} />
            <SkeletonLoader width="100%" height={80} borderRadius={8} style={{ marginBottom: 16 }} />
            <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
              <View style={{ alignItems: 'center' }}>
                <SkeletonLoader width={50} height={28} style={{ marginBottom: 8 }} />
                <SkeletonLoader width={40} height={14} />
              </View>
              <View style={{ alignItems: 'center' }}>
                <SkeletonLoader width={50} height={28} style={{ marginBottom: 8 }} />
                <SkeletonLoader width={40} height={14} />
              </View>
              <View style={{ alignItems: 'center' }}>
                <SkeletonLoader width={50} height={28} style={{ marginBottom: 8 }} />
                <SkeletonLoader width={40} height={14} />
              </View>
            </View>
          </View>
        </View>
      </View>
    );
  }

  if (!statistics) {
    return (
      <View style={styles.emptyContainer}>
        <StatusBar style="dark" />
        <Text style={styles.emptyIcon}>📊</Text>
        <Text style={styles.emptyTitle}>통계 데이터가 없습니다</Text>
        <Text style={styles.emptySubtitle}>퀴즈를 풀어보세요!</Text>
        <TouchableOpacity style={styles.backButton} onPress={onBack}>
          <Text style={styles.backButtonText}>돌아가기</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      <ScreenHeader title="학습 통계" onBack={onBack} />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={['#C4B5FD']}
            tintColor="#C4B5FD"
          />
        }
      >
        {/* 전체 통계 카드 */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>📈 전체 학습 현황</Text>
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{statistics.totalWordCount}</Text>
              <Text style={styles.statLabel}>등록 단어</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{statistics.totalCategoryCount}</Text>
              <Text style={styles.statLabel}>카테고리</Text>
            </View>
          </View>
        </View>

        {/* 퀴즈 통계 카드 */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>✏️ 퀴즈 성적</Text>
          {statistics.totalQuizCount > 0 ? (
            <>
              <View style={styles.accuracyContainer}>
                <Text style={styles.accuracyValue}>
                  {statistics.accuracy.toFixed(1)}%
                </Text>
                <Text style={styles.accuracyLabel}>정답률</Text>
              </View>
              <View style={styles.statsRow}>
                <View style={styles.statItem}>
                  <Text style={[styles.statValue, styles.correctValue]}>
                    {statistics.correctCount}
                  </Text>
                  <Text style={styles.statLabel}>정답</Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.statItem}>
                  <Text style={[styles.statValue, styles.incorrectValue]}>
                    {statistics.incorrectCount}
                  </Text>
                  <Text style={styles.statLabel}>오답</Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.statItem}>
                  <Text style={styles.statValue}>{statistics.totalQuizCount}</Text>
                  <Text style={styles.statLabel}>총 문제</Text>
                </View>
              </View>
            </>
          ) : (
            <View style={styles.noDataContainer}>
              <Text style={styles.noDataText}>아직 풀이한 퀴즈가 없습니다</Text>
            </View>
          )}
        </View>

        {/* 모티베이션 힌트 */}
        {(() => {
          const motivation = getMotivationMessage();
          if (!motivation) return null;
          return (
            <View style={styles.motivationCard}>
              <Text style={styles.motivationEmoji}>{motivation.emoji}</Text>
              <View style={styles.motivationContent}>
                <Text style={styles.motivationTitle}>{motivation.title}</Text>
                <Text style={styles.motivationDesc}>{motivation.desc}</Text>
              </View>
            </View>
          );
        })()}

        {/* 단어 정답률 버튼 */}
        {statistics.totalQuizCount > 0 && (
          <TouchableOpacity style={styles.wordStatsButton} onPress={openWordStats}>
            <Text style={styles.wordStatsButtonIcon}>📋</Text>
            <View style={styles.wordStatsButtonContent}>
              <Text style={styles.wordStatsButtonTitle}>단어 정답률</Text>
              <Text style={styles.wordStatsButtonDesc}>단어별 퀴즈 성적을 확인하세요</Text>
            </View>
            <Text style={styles.wordStatsButtonArrow}>→</Text>
          </TouchableOpacity>
        )}

        {/* 취약 단어 카드 */}
        {statistics.weakWordCount > 0 && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>⚠️ 취약한 단어</Text>
            <View style={styles.weakWordInfo}>
              <Text style={styles.weakWordCount}>
                {statistics.weakWordCount}개의 단어
              </Text>
              <Text style={styles.weakWordDesc}>
                정답률이 50% 미만인 단어들입니다
              </Text>
            </View>
          </View>
        )}

        {/* 학습 권장 */}
        {statistics.totalQuizCount === 0 && statistics.totalWordCount > 0 && (
          <View style={[styles.card, styles.recommendCard]}>
            <Text style={styles.recommendIcon}>💡</Text>
            <Text style={styles.recommendTitle}>학습을 시작해보세요!</Text>
            <Text style={styles.recommendDesc}>
              {statistics.totalWordCount}개의 단어가 학습을 기다리고 있습니다
            </Text>
          </View>
        )}
      </ScrollView>

      {/* 단어 정답률 모달 */}
      <Modal
        visible={showWordStats}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowWordStats(false)}
      >
        <View style={styles.modalContainer}>
          {/* 모달 헤더 */}
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>단어 정답률</Text>
            <TouchableOpacity onPress={() => setShowWordStats(false)}>
              <Text style={styles.modalCloseText}>닫기</Text>
            </TouchableOpacity>
          </View>

          {/* 정렬 버튼들 */}
          <View style={styles.sortContainer}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.sortScroll}>
              {(['word', 'accuracy', 'totalCount', 'correctCount', 'incorrectCount'] as SortKey[]).map((key) => (
                <TouchableOpacity
                  key={key}
                  style={[styles.sortChip, sortKey === key && styles.sortChipActive]}
                  onPress={() => handleSortPress(key)}
                >
                  <Text style={[styles.sortChipText, sortKey === key && styles.sortChipTextActive]}>
                    {getSortLabel(key)}
                    {sortKey === key && (sortOrder === 'asc' ? ' ↑' : ' ↓')}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          {/* 단어 리스트 */}
          {wordStatsLoading ? (
            <View style={styles.modalLoadingContainer}>
              <ActivityIndicator size="large" color="#C4B5FD" />
            </View>
          ) : sortedWordStats.length === 0 ? (
            <View style={styles.modalEmptyContainer}>
              <Text style={styles.modalEmptyText}>퀴즈 기록이 없습니다</Text>
            </View>
          ) : (
            <ScrollView style={styles.modalContent}>
              {sortedWordStats.map((item, index) => (
                <View key={item.wordId} style={styles.wordItem}>
                  <View style={styles.wordItemLeft}>
                    <Text style={styles.wordItemRank}>{index + 1}</Text>
                    <View style={styles.wordItemInfo}>
                      <Text style={styles.wordItemWord}>{item.word}</Text>
                      <View style={styles.wordItemStats}>
                        <Text style={styles.wordItemStatText}>
                          퀴즈 <Text style={styles.wordItemStatBold}>{item.totalCount}</Text>
                        </Text>
                        <Text style={styles.wordItemStatDot}>·</Text>
                        <Text style={[styles.wordItemStatText, { color: '#10B981' }]}>
                          정답 <Text style={styles.wordItemStatBold}>{item.correctCount}</Text>
                        </Text>
                        <Text style={styles.wordItemStatDot}>·</Text>
                        <Text style={[styles.wordItemStatText, { color: '#EF4444' }]}>
                          오답 <Text style={styles.wordItemStatBold}>{item.incorrectCount}</Text>
                        </Text>
                      </View>
                    </View>
                  </View>
                  <View style={[styles.wordItemAccuracy, { backgroundColor: getAccuracyColor(item.accuracy) + '18' }]}>
                    <Text style={[styles.wordItemAccuracyText, { color: getAccuracyColor(item.accuracy) }]}>
                      {item.accuracy.toFixed(0)}%
                    </Text>
                  </View>
                </View>
              ))}
            </ScrollView>
          )}
        </View>
      </Modal>

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
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
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
  backButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: '#C4B5FD',
    borderRadius: 8,
  },
  backButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  // Skeleton
  skeletonCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
  },
  // Cards
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
    ...Platform.select({
      web: { boxShadow: '0 2px 8px rgba(0, 0, 0, 0.05)' },
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
        elevation: 2,
      },
    }),
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1A1A1A',
    marginBottom: 16,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statDivider: {
    width: 1,
    height: 40,
    backgroundColor: '#E5E7EB',
    marginHorizontal: 8,
  },
  statValue: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#C4B5FD',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 13,
    color: '#6B7280',
  },
  accuracyContainer: {
    alignItems: 'center',
    marginBottom: 20,
    paddingVertical: 16,
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
  },
  accuracyValue: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#C4B5FD',
    marginBottom: 4,
  },
  accuracyLabel: {
    fontSize: 14,
    color: '#6B7280',
  },
  correctValue: {
    color: '#10B981',
  },
  incorrectValue: {
    color: '#EF4444',
  },
  noDataContainer: {
    padding: 20,
    alignItems: 'center',
  },
  noDataText: {
    fontSize: 14,
    color: '#9CA3AF',
  },
  // 모티베이션 카드
  motivationCard: {
    backgroundColor: '#FFFBEB',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  motivationEmoji: {
    fontSize: 32,
    marginRight: 12,
  },
  motivationContent: {
    flex: 1,
  },
  motivationTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#92400E',
    marginBottom: 2,
  },
  motivationDesc: {
    fontSize: 13,
    color: '#A16207',
    lineHeight: 18,
  },
  // 단어 정답률 버튼
  wordStatsButton: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#DDD6FE',
    ...Platform.select({
      web: { boxShadow: '0 2px 8px rgba(0, 0, 0, 0.05)' },
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
        elevation: 2,
      },
    }),
  },
  wordStatsButtonIcon: {
    fontSize: 28,
    marginRight: 12,
  },
  wordStatsButtonContent: {
    flex: 1,
  },
  wordStatsButtonTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1A1A1A',
    marginBottom: 2,
  },
  wordStatsButtonDesc: {
    fontSize: 13,
    color: '#6B7280',
  },
  wordStatsButtonArrow: {
    fontSize: 18,
    color: '#C4B5FD',
    fontWeight: 'bold',
  },
  // 취약 단어
  weakWordInfo: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  weakWordCount: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#EF4444',
    marginBottom: 4,
  },
  weakWordDesc: {
    fontSize: 13,
    color: '#6B7280',
  },
  recommendCard: {
    backgroundColor: '#EEF2FF',
    borderWidth: 1,
    borderColor: '#C7D2FE',
    alignItems: 'center',
  },
  recommendIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  recommendTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#4338CA',
    marginBottom: 8,
  },
  recommendDesc: {
    fontSize: 14,
    color: '#C4B5FD',
    textAlign: 'center',
  },
  // 모달 스타일
  modalContainer: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    paddingTop: 52,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1A1A1A',
  },
  modalCloseText: {
    fontSize: 16,
    color: '#C4B5FD',
    fontWeight: '600',
  },
  // 정렬 버튼
  sortContainer: {
    backgroundColor: '#FFFFFF',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  sortScroll: {
    paddingHorizontal: 16,
    gap: 8,
  },
  sortChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 16,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  sortChipActive: {
    backgroundColor: '#EDE9FE',
    borderColor: '#C4B5FD',
  },
  sortChipText: {
    fontSize: 13,
    color: '#6B7280',
    fontWeight: '500',
  },
  sortChipTextActive: {
    color: '#7C3AED',
    fontWeight: '700',
  },
  modalLoadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalEmptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalEmptyText: {
    fontSize: 15,
    color: '#9CA3AF',
  },
  modalContent: {
    flex: 1,
    padding: 16,
  },
  // 단어 리스트 아이템
  wordItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  wordItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  wordItemRank: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#9CA3AF',
    minWidth: 24,
    textAlign: 'center',
    marginRight: 12,
  },
  wordItemInfo: {
    flex: 1,
  },
  wordItemWord: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1A1A1A',
    marginBottom: 4,
  },
  wordItemStats: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  wordItemStatText: {
    fontSize: 12,
    color: '#6B7280',
  },
  wordItemStatBold: {
    fontWeight: '700',
  },
  wordItemStatDot: {
    fontSize: 12,
    color: '#D1D5DB',
    marginHorizontal: 6,
  },
  wordItemAccuracy: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    marginLeft: 12,
  },
  wordItemAccuracyText: {
    fontSize: 15,
    fontWeight: 'bold',
  },
});
