import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Platform,
  RefreshControl,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { quizService, MyPageStats, DailyActivity } from '../services/quizService';
import Toast from '../components/Toast';
import { useToast } from '../hooks/useToast';
import ScreenHeader from '../components/ScreenHeader';
import SkeletonLoader from '../components/SkeletonLoader';

interface MyPageScreenProps {
  onBack: () => void;
}

const WEEKS = 15;
const DAYS_TOTAL = WEEKS * 7;

const LEVEL_COLORS = ['#EBEDF0', '#C6E48B', '#7BC96F', '#239A3D', '#196127'];

function getLevel(count: number): number {
  if (count === 0) return 0;
  if (count <= 1) return 1;
  if (count <= 3) return 2;
  if (count <= 6) return 3;
  return 4;
}

const DAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

export default function MyPageScreen({ onBack }: MyPageScreenProps) {
  const { toast, showToast, hideToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState<MyPageStats | null>(null);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      setLoading(true);
      const data = await quizService.getMyPageStats();
      setStats(data);
    } catch (error: any) {
      console.error('마이페이지 통계 조회 실패:', error);
      showToast('통계를 불러오는데 실패했습니다', 'error');
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      const data = await quizService.getMyPageStats();
      setStats(data);
    } catch (error: any) {
      showToast('새로고침에 실패했습니다', 'error');
    } finally {
      setRefreshing(false);
    }
  };

  // 잔디 히트맵 데이터 생성
  const heatmapData = useMemo(() => {
    const activityMap = new Map<string, DailyActivity>();
    if (stats?.activities) {
      for (const a of stats.activities) {
        activityMap.set(a.date, a);
      }
    }

    const today = new Date();
    const todayDay = today.getDay(); // 0=일, 6=토
    // 이번 주 토요일까지 포함하기 위해 오프셋 계산
    const endOffset = 6 - todayDay;
    const cells: Array<{ date: string; level: number; count: number }> = [];

    for (let i = DAYS_TOTAL - 1; i >= -endOffset; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i + endOffset);
      const dateStr = d.toISOString().split('T')[0];
      const activity = activityMap.get(dateStr);
      const count = activity ? activity.wordCount + activity.quizCount : 0;
      const isFuture = d > today;
      cells.push({
        date: dateStr,
        level: isFuture ? -1 : getLevel(count),
        count,
      });
    }

    // 7행 x N열 그리드로 변환 (행=요일, 열=주)
    type Cell = { date: string; level: number; count: number };
    const grid: Cell[][] = Array.from({ length: 7 }, () => [] as Cell[]);
    for (let i = 0; i < cells.length; i++) {
      const row = i % 7;
      grid[row].push(cells[i]);
    }
    return grid;
  }, [stats]);

  if (loading) {
    return (
      <View style={styles.container}>
        <StatusBar style="dark" />
        <ScreenHeader title="마이페이지" onBack={onBack} />
        <View style={{ padding: 16 }}>
          {/* 프로필 스켈레톤 */}
          <View style={styles.skeletonCard}>
            <SkeletonLoader width={120} height={20} style={{ marginBottom: 8 }} />
            <SkeletonLoader width={80} height={14} />
          </View>
          {/* 통계 스켈레톤 */}
          <View style={styles.skeletonCard}>
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
          {/* 히트맵 스켈레톤 */}
          <View style={styles.skeletonCard}>
            <SkeletonLoader width="40%" height={18} style={{ marginBottom: 12 }} />
            <SkeletonLoader width="100%" height={100} borderRadius={8} />
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      <ScreenHeader title="마이페이지" onBack={onBack} />

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
        {/* 프로필 카드 */}
        <View style={styles.card}>
          <View style={styles.profileRow}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>M</Text>
            </View>
            <View style={styles.profileInfo}>
              <Text style={styles.profileName}>My Word</Text>
              {stats && (
                <Text style={styles.profileSub}>
                  총 {stats.totalActiveDays}일 활동
                </Text>
              )}
            </View>
          </View>
        </View>

        {/* 요약 통계 */}
        {stats && (
          <View style={styles.card}>
            <View style={styles.summaryRow}>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryValue}>{stats.totalWordCount}</Text>
                <Text style={styles.summaryLabel}>등록 단어</Text>
              </View>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryItem}>
                <Text style={styles.summaryValue}>{stats.totalQuizCount}</Text>
                <Text style={styles.summaryLabel}>퀴즈 횟수</Text>
              </View>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryItem}>
                <Text style={[styles.summaryValue, styles.streakValue]}>
                  {stats.streakDays}
                </Text>
                <Text style={styles.summaryLabel}>연속 학습</Text>
              </View>
            </View>
          </View>
        )}

        {/* 잔디 히트맵 */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>학습 활동</Text>

          {/* 월 라벨 */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View>
              {/* 그리드 */}
              <View style={styles.heatmapContainer}>
                {/* 요일 라벨 */}
                <View style={styles.dayLabels}>
                  {DAY_LABELS.map((label, i) => (
                    <Text key={i} style={styles.dayLabel}>
                      {i % 2 === 1 ? label : ''}
                    </Text>
                  ))}
                </View>
                {/* 잔디 */}
                <View style={styles.heatmapGrid}>
                  {heatmapData[0]?.map((_, colIdx) => (
                    <View key={colIdx} style={styles.heatmapColumn}>
                      {heatmapData.map((row, rowIdx) => {
                        const cell = row[colIdx];
                        if (!cell) return <View key={rowIdx} style={styles.heatmapCell} />;
                        return (
                          <View
                            key={rowIdx}
                            style={[
                              styles.heatmapCell,
                              {
                                backgroundColor:
                                  cell.level === -1 ? 'transparent' : LEVEL_COLORS[cell.level],
                              },
                            ]}
                          />
                        );
                      })}
                    </View>
                  ))}
                </View>
              </View>

              {/* 범례 */}
              <View style={styles.legendContainer}>
                <Text style={styles.legendText}>적음</Text>
                {LEVEL_COLORS.map((color, i) => (
                  <View
                    key={i}
                    style={[styles.legendCell, { backgroundColor: color }]}
                  />
                ))}
                <Text style={styles.legendText}>많음</Text>
              </View>
            </View>
          </ScrollView>
        </View>

        {/* 연속 학습 카드 */}
        {stats && stats.streakDays > 0 && (
          <View style={[styles.card, styles.streakCard]}>
            <Text style={styles.streakEmoji}>
              {stats.streakDays >= 7 ? '🏆' : stats.streakDays >= 3 ? '🔥' : '✨'}
            </Text>
            <View style={styles.streakContent}>
              <Text style={styles.streakTitle}>
                {stats.streakDays}일 연속 학습 중!
              </Text>
              <Text style={styles.streakDesc}>
                {stats.streakDays >= 7
                  ? '대단해요! 꾸준한 학습이 빛을 발하고 있어요'
                  : stats.streakDays >= 3
                    ? '좋은 흐름이에요! 계속 이어가세요'
                    : '좋은 시작이에요! 내일도 학습해보세요'}
              </Text>
            </View>
          </View>
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
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
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
  // Profile
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#C4B5FD',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  avatarText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  profileInfo: {
    flex: 1,
  },
  profileName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1A1A1A',
    marginBottom: 2,
  },
  profileSub: {
    fontSize: 13,
    color: '#6B7280',
  },
  // Summary stats
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  summaryItem: {
    flex: 1,
    alignItems: 'center',
  },
  summaryDivider: {
    width: 1,
    height: 40,
    backgroundColor: '#E5E7EB',
    marginHorizontal: 4,
  },
  summaryValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#C4B5FD',
    marginBottom: 4,
  },
  summaryLabel: {
    fontSize: 12,
    color: '#6B7280',
  },
  streakValue: {
    color: '#F59E0B',
  },
  // Heatmap
  heatmapContainer: {
    flexDirection: 'row',
  },
  dayLabels: {
    marginRight: 4,
    justifyContent: 'space-between',
  },
  dayLabel: {
    fontSize: 10,
    color: '#9CA3AF',
    height: 13,
    lineHeight: 13,
    textAlign: 'right',
    width: 14,
  },
  heatmapGrid: {
    flexDirection: 'row',
    gap: 2,
  },
  heatmapColumn: {
    gap: 2,
  },
  heatmapCell: {
    width: 11,
    height: 11,
    borderRadius: 2,
    backgroundColor: '#EBEDF0',
  },
  // Legend
  legendContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: 8,
    gap: 3,
  },
  legendCell: {
    width: 11,
    height: 11,
    borderRadius: 2,
  },
  legendText: {
    fontSize: 10,
    color: '#9CA3AF',
    marginHorizontal: 2,
  },
  // Streak card
  streakCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  streakEmoji: {
    fontSize: 32,
    marginRight: 12,
  },
  streakContent: {
    flex: 1,
  },
  streakTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#92400E',
    marginBottom: 2,
  },
  streakDesc: {
    fontSize: 13,
    color: '#A16207',
    lineHeight: 18,
  },
});
