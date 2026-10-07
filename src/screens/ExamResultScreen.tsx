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
import Toast from '../components/Toast';
import { FONT, RADIUS, SPACING } from '../constants/design';
import { useTheme } from '../contexts/ThemeContext';
import { useToast } from '../hooks/useToast';
import { commonServer } from '../services/commonServer/client';
import { examService, type ExamRecord } from '../services/examService';

/**
 * AI 시험 결과.
 *
 * 🔴 **이 화면은 통계에 아무것도 쓰지 않는다**(`examService` 머리 주석).
 *    점수는 `@my_word_exams` 에만 남고 정답률·스트릭·복습 만기는 움직이지 않는다.
 *    재시험을 구분하는 코드가 생기면 그때 연결한다 — 순서를 지키는 것이 요점이다.
 *
 * ⚠ **단어 담기는 아직 없다.** 기획의 핵심 가치(오답 보기가 곧 추천 단어)는 다음 단계다.
 *   여기서는 맞은 것·틀린 것과 해설만 보여준다.
 *
 * 🔴 **신고 버튼이 여기 있는 이유** — 창고를 모든 사용자가 나눠 쓰므로 틀린 문제는 한 명에게만
 *    가지 않는다. 문제를 본 직후가 신고할 수 있는 유일한 자리다.
 */

interface ExamResultScreenProps {
  examId: string;
  onBack: () => void;
  onHome: () => void;
}

export default function ExamResultScreen({ examId, onBack, onHome }: ExamResultScreenProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { toast, showToast, hideToast } = useToast();

  const [record, setRecord] = useState<ExamRecord | null>(null);
  const [loading, setLoading] = useState(true);
  /** 이미 신고한 문제. 두 번 누르는 것을 화면에서도 막는다(서버도 막지만 반응이 있어야 한다) */
  const [reported, setReported] = useState<Set<string>>(new Set());
  const [reporting, setReporting] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const records = await examService.getRecords();
        if (!alive) return;
        setRecord(records.find((r) => r.examId === examId) ?? records[0] ?? null);
      } catch (error: any) {
        console.warn('시험 기록 조회 실패:', error);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [examId]);

  const handleReport = useCallback(
    async (questionId: string) => {
      if (reporting !== null || reported.has(questionId)) return;
      setReporting(questionId);
      try {
        const result = await commonServer.reportQuestion(questionId, 'wrong');
        // ⚠ `recorded: false`(중복)도 성공이다 — 사용자 입장에서는 이미 신고한 것이다
        if (result.ok) {
          setReported((prev) => new Set(prev).add(questionId));
          showToast(t('신고했어요. 확인한 뒤 문제를 고치거나 빼요'), 'success');
        } else if (result.reason === 'offline') {
          showToast(t('인터넷에 연결한 뒤 다시 시도해 주세요'), 'error');
        } else {
          showToast(t('신고하지 못했어요'), 'error');
        }
      } catch (error: any) {
        console.warn('문제 신고 실패:', error);
        showToast(t('신고하지 못했어요'), 'error');
      } finally {
        setReporting(null);
      }
    },
    [reported, reporting, showToast, t],
  );

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
        <StatusBar style={colors.isDark ? 'light' : 'dark'} />
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (record === null) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <StatusBar style={colors.isDark ? 'light' : 'dark'} />
        <ScreenHeader title={t('시험 결과')} onBack={onBack} />
        <View style={styles.emptyBox}>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>
            {t('성적을 찾지 못했어요')}
          </Text>
        </View>
      </View>
    );
  }

  const { score } = record;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style={colors.isDark ? 'light' : 'dark'} />
      <ScreenHeader title={t('시험 결과')} onBack={onBack} />

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        <View style={[styles.scoreCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.scoreValue, { color: colors.primaryStrong }]}>{score.accuracy}%</Text>
          <Text style={[styles.scoreLine, { color: colors.textSecondary }]}>
            {t('{{total}}문제 중 {{correct}}개 맞혔어요', {
              total: score.total,
              correct: score.correct,
            })}
          </Text>
          {score.skipped > 0 && (
            <Text style={[styles.scoreLine, { color: colors.textTertiary }]}>
              {t('넘긴 문제 {{count}}개', { count: score.skipped })}
            </Text>
          )}
        </View>

        <Text style={[styles.sectionLabel, { color: colors.text }]}>{t('문제 다시 보기')}</Text>

        {record.questions.map((question, index) => {
          const answer = record.answers[index];
          const correct = answer === question.answerIndex;
          const skipped = answer === null || answer === undefined;
          const isReported = reported.has(question.id);
          return (
            <View
              key={question.id}
              style={[styles.reviewCard, { backgroundColor: colors.card, borderColor: colors.border }]}
            >
              <View style={styles.reviewHead}>
                <MaterialIcons
                  name={correct ? 'check-circle' : skipped ? 'remove-circle-outline' : 'cancel'}
                  size={18}
                  color={correct ? colors.success : skipped ? colors.textTertiary : colors.dangerText}
                />
                <Text style={[styles.reviewWord, { color: colors.text }]}>{question.word}</Text>
              </View>

              <Text style={[styles.reviewPrompt, { color: colors.text }]}>{question.prompt}</Text>

              {question.choices.map((choice, choiceIndex) => {
                const isAnswer = choiceIndex === question.answerIndex;
                const isMine = choiceIndex === answer;
                return (
                  <View
                    key={`${question.id}-r-${choiceIndex}`}
                    style={[
                      styles.reviewChoice,
                      isAnswer && { backgroundColor: colors.successBg },
                      !isAnswer && isMine && { backgroundColor: colors.dangerBg },
                    ]}
                  >
                    <Text
                      style={[
                        styles.reviewChoiceText,
                        { color: colors.textSecondary },
                        isAnswer && { color: colors.successText, fontWeight: '700' },
                        !isAnswer && isMine && { color: colors.dangerText },
                      ]}
                    >
                      {choice}
                    </Text>
                    {isMine && (
                      <Text style={[styles.reviewTag, { color: colors.textTertiary }]}>
                        {t('내 답')}
                      </Text>
                    )}
                  </View>
                );
              })}

              {/* ⚠ 해설은 `null` 일 수 있다 — 그 언어로 아직 만들어지지 않은 문제다. 칸을 비워 둔다 */}
              {question.meaning !== null && (
                <Text style={[styles.reviewMeaning, { color: colors.text }]}>
                  {t('뜻')}: {question.meaning}
                </Text>
              )}
              {question.explanation !== null && (
                <Text style={[styles.reviewExplanation, { color: colors.textSecondary }]}>
                  {question.explanation}
                </Text>
              )}

              <TouchableOpacity
                style={styles.reportButton}
                onPress={() => void handleReport(question.id)}
                disabled={isReported || reporting !== null}
                accessibilityRole="button"
                accessibilityLabel={t('이 문제가 틀렸어요')}
              >
                {reporting === question.id ? (
                  <ActivityIndicator size="small" color={colors.textTertiary} />
                ) : (
                  <Text style={[styles.reportText, { color: isReported ? colors.success : colors.textTertiary }]}>
                    {isReported ? t('신고했어요') : t('이 문제가 틀렸어요')}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          );
        })}
      </ScrollView>

      <View style={[styles.footer, { backgroundColor: colors.background, borderTopColor: colors.border }]}>
        <TouchableOpacity
          style={[styles.homeButton, { backgroundColor: colors.primaryStrong }]}
          onPress={onHome}
          accessibilityRole="button"
        >
          <Text style={styles.homeButtonText}>{t('홈으로')}</Text>
        </TouchableOpacity>
      </View>

      <Toast message={toast.message} type={toast.type} visible={toast.visible} onHide={hideToast} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scrollView: { flex: 1 },
  scrollContent: { padding: SPACING.lg, paddingBottom: SPACING.xl },
  scoreCard: {
    borderWidth: 1,
    borderRadius: RADIUS.xl,
    padding: SPACING.lg,
    alignItems: 'center',
    marginBottom: SPACING.xl,
  },
  scoreValue: { fontSize: 44, fontWeight: '700' },
  scoreLine: { fontSize: FONT.body, marginTop: SPACING.xs },
  sectionLabel: { fontSize: FONT.label, fontWeight: '700', marginBottom: SPACING.md },
  reviewCard: {
    borderWidth: 1,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },
  reviewHead: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  reviewWord: { fontSize: FONT.body, fontWeight: '700' },
  reviewPrompt: { fontSize: FONT.body, lineHeight: 22, marginTop: SPACING.sm },
  reviewChoice: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: RADIUS.sm,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.sm,
    marginTop: SPACING.xs,
  },
  reviewChoiceText: { flex: 1, fontSize: FONT.body },
  reviewTag: { fontSize: FONT.caption, marginLeft: SPACING.sm },
  reviewMeaning: { fontSize: FONT.body, fontWeight: '600', marginTop: SPACING.md },
  reviewExplanation: { fontSize: FONT.caption, lineHeight: 20, marginTop: SPACING.xs },
  reportButton: { marginTop: SPACING.md, alignSelf: 'flex-start', minHeight: 32, justifyContent: 'center' },
  reportText: { fontSize: FONT.caption, textDecorationLine: 'underline' },
  footer: { padding: SPACING.lg, borderTopWidth: StyleSheet.hairlineWidth },
  homeButton: {
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.md,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  homeButtonText: { color: '#fff', fontSize: FONT.body, fontWeight: '700' },
  emptyBox: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: SPACING.xl },
  emptyTitle: { fontSize: FONT.title, fontWeight: '700' },
});
