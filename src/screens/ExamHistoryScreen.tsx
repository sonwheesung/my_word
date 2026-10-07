import { useTranslation } from 'react-i18next';
import React, { useCallback, useEffect, useState } from 'react';
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

import ScreenHeader from '../components/ScreenHeader';
import { FONT, RADIUS, SPACING } from '../constants/design';
import { useTheme } from '../contexts/ThemeContext';
import { examService, type ExamRecord } from '../services/examService';

/**
 * 성적표 — 친 시험과 **회차별 점수**.
 *
 * 🔴 **구독을 끊어도 열린다.** 기획: *"이건 구독 취소해도 볼 수는 있게 해야해"*.
 *    기록은 기기에 있고 채점도 기기가 하므로 서버가 전혀 필요 없다 — 그래서 지킬 수 있는 약속이다.
 *
 * 🔴 **재시험도 여기서 시작한다.** 같은 문제를 다시 푸는 것이고, 그 점수는 성적표에만 쌓이며
 *    **정답률·복습 만기를 건드리지 않는다**(`examService` 머리 주석).
 */

interface ExamHistoryScreenProps {
  onBack: () => void;
  /** 같은 문제로 다시 풀기 */
  onRetry: (examId: string) => void;
}

function formatDay(iso: string): string {
  // 기기 시간대로 보여준다. ISO 를 그대로 보여주면 사용자가 읽을 수 없다
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

export default function ExamHistoryScreen({ onBack, onRetry }: ExamHistoryScreenProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();

  const [records, setRecords] = useState<ExamRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const got = await examService.getRecords();
        if (alive) setRecords(got);
      } catch (error: any) {
        console.warn('성적표 조회 실패:', error);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const best = useCallback(
    (record: ExamRecord): number =>
      record.attempts.reduce((max, a) => Math.max(max, a.score.accuracy), 0),
    [],
  );

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
        <StatusBar style={colors.isDark ? 'light' : 'dark'} />
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style={colors.isDark ? 'light' : 'dark'} />
      <ScreenHeader title={t('시험 성적표')} onBack={onBack} />

      {records.length === 0 ? (
        <View style={styles.emptyBox}>
          <MaterialIcons name="history" size={56} color={colors.textTertiary} />
          <Text style={[styles.emptyTitle, { color: colors.text }]}>{t('아직 친 시험이 없어요')}</Text>
          <Text style={[styles.emptySub, { color: colors.textSecondary }]}>
            {t('AI 시험을 한 번 치면 여기에 쌓여요')}
          </Text>
        </View>
      ) : (
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
          {records.map((record) => (
            <View
              key={record.examId}
              style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
            >
              <View style={styles.cardHead}>
                <Text style={[styles.cardDate, { color: colors.textSecondary }]}>
                  {formatDay(record.takenAt)}
                </Text>
                <Text style={[styles.cardBest, { color: colors.primaryStrong }]}>
                  {t('최고 {{n}}%', { n: best(record) })}
                </Text>
              </View>
              <Text style={[styles.cardSub, { color: colors.textSecondary }]}>
                {t('{{count}}문제', { count: record.questions.length })}
              </Text>

              {/* 🔴 회차별로 한 줄씩. 1회차만 통계에 들어갔다는 것을 표시한다 */}
              {record.attempts.map((attempt, index) => (
                <View key={`${record.examId}-${index}`} style={styles.attemptRow}>
                  <Text style={[styles.attemptLabel, { color: colors.text }]}>
                    {t('{{n}}회차', { n: index + 1 })}
                  </Text>
                  <Text style={[styles.attemptDate, { color: colors.textTertiary }]}>
                    {formatDay(attempt.takenAt)}
                  </Text>
                  <Text style={[styles.attemptScore, { color: colors.text }]}>
                    {attempt.score.accuracy}%
                  </Text>
                  <Text style={[styles.attemptDetail, { color: colors.textTertiary }]}>
                    {attempt.score.correct}/{attempt.score.total}
                  </Text>
                </View>
              ))}

              {record.attempts.length > 1 && (
                <Text style={[styles.note, { color: colors.textTertiary }]}>
                  {t('2회차부터는 학습 통계에 반영되지 않아요')}
                </Text>
              )}

              <TouchableOpacity
                style={[styles.retryButton, { borderColor: colors.border }]}
                onPress={() => onRetry(record.examId)}
                accessibilityRole="button"
              >
                <MaterialIcons name="replay" size={16} color={colors.primary} />
                <Text style={[styles.retryText, { color: colors.primaryStrong }]}>
                  {t('같은 문제로 다시 풀기')}
                </Text>
              </TouchableOpacity>
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scrollView: { flex: 1 },
  scrollContent: { padding: SPACING.lg, paddingBottom: SPACING.xl },
  card: {
    borderWidth: 1,
    borderRadius: RADIUS.xl,
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardDate: { fontSize: FONT.caption },
  cardBest: { fontSize: FONT.body, fontWeight: '700' },
  cardSub: { fontSize: FONT.caption, marginTop: 2 },
  attemptRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginTop: SPACING.sm,
  },
  attemptLabel: { fontSize: FONT.body, fontWeight: '600', minWidth: 56 },
  attemptDate: { fontSize: FONT.caption, flex: 1 },
  attemptScore: { fontSize: FONT.body, fontWeight: '700' },
  attemptDetail: { fontSize: FONT.caption, minWidth: 44, textAlign: 'right' },
  note: { fontSize: FONT.caption, marginTop: SPACING.sm, lineHeight: 16 },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.sm,
    marginTop: SPACING.md,
    minHeight: 44,
  },
  retryText: { fontSize: FONT.body, fontWeight: '600' },
  emptyBox: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: SPACING.xl },
  emptyTitle: { fontSize: FONT.title, fontWeight: '700', marginTop: SPACING.lg },
  emptySub: { fontSize: FONT.body, marginTop: SPACING.sm, textAlign: 'center' },
});
