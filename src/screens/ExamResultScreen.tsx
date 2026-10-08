import { useTranslation } from 'react-i18next';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { MaterialIcons } from '@expo/vector-icons';

import FlyingPills, { type Flight } from '../components/FlyingPills';
import ScreenHeader from '../components/ScreenHeader';
import Toast from '../components/Toast';
import { FONT, RADIUS, SPACING } from '../constants/design';
import { useTheme } from '../contexts/ThemeContext';
import { useToast } from '../hooks/useToast';
import { commonServer } from '../services/commonServer/client';
import { collectNewWords, examService, type ExamRecord } from '../services/examService';
import { dictionaryService } from '../services/dictionaryService';
import { wordService } from '../services/wordService';

/**
 * AI 시험 결과.
 *
 * 🔴 **이 화면은 통계에 아무것도 쓰지 않는다**(`examService` 머리 주석).
 *    점수는 `@my_word_exams` 에만 남고 정답률·스트릭·복습 만기는 움직이지 않는다.
 *    재시험을 구분하는 코드가 생기면 그때 연결한다 — 순서를 지키는 것이 요점이다.
 *
 * 🔴 **단어 담기가 이 화면의 진짜 값이다**(2026-10-07 추가).
 *   기획: *"시험에 나온 없는 단어들 목록 보여주고 하나씩 선택해서 저장"*.
 *   시험을 볼수록 단어장이 자란다 — 그게 구독의 값이고, 문제를 내 주는 것이 아니다.
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

  /** 담을 수 있는 후보(오답 보기 중 내 단어장에 없는 것) */
  const [candidates, setCandidates] = useState<string[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  /** 이번에 담은 단어. 다시 담지 못하게 하고 결과를 보여준다 */
  const [saved, setSaved] = useState<Set<string>>(new Set());

  /*
   * 담기 연출 (2026-10-08 시안 #13). 알약이 날아가는 동안 칩은 **초록 ✓ 로 남아 있고**,
   * 다 날아간 뒤에 목록에서 빠진다. 바로 빼면 어디서 날아왔는지 안 보인다.
   *
   * ⚠ **토스트는 그대로 둔다.** 날아가는 것은 장식이고, 토스트가 *몇 개 담겼는지*를
   *   확실히 말한다 — 연출을 못 보거나 중간에 스크롤한 사람에게도 남는다.
   */
  const [flying, setFlying] = useState<Set<string>>(new Set());
  const [flights, setFlights] = useState<Flight[]>([]);
  const [target, setTarget] = useState<{ x: number; y: number } | null>(null);
  /** 과녁에 붙는 `+N`. 이 화면에 머무는 동안 쌓인다 */
  const [landed, setLanded] = useState(0);

  const chipRefs = useRef<Record<string, View | null>>({});
  const targetRef = useRef<View | null>(null);
  /** 과녁이 톡 튀는 크기. transform 뿐이라 네이티브 드라이버로 돈다 */
  const bounce = useRef(new Animated.Value(1)).current;

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

  /**
   * 후보를 고른다. **단어장 전체와 대조해야** 하므로 기록을 읽은 뒤에 한 번만 한다.
   * ⚠ 실패해도 화면은 멀쩡해야 한다 — 후보가 없는 것으로 둔다.
   */
  useEffect(() => {
    if (record === null) return;
    let alive = true;
    (async () => {
      try {
        const owned = await wordService.getWords();
        if (!alive) return;
        setCandidates(collectNewWords(record.questions, owned.map((w) => w.word)));
      } catch (error: any) {
        console.warn('단어 담기 후보 계산 실패:', error);
      }
    })();
    return () => {
      alive = false;
    };
  }, [record]);

  const toggle = useCallback((word: string) => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(word)) next.delete(word);
      else next.add(word);
      return next;
    });
  }, []);

  /**
   * 고른 단어를 단어장에 담는다.
   *
   * 🔴 **뜻은 저장할 때 찾는다.** 후보를 보여줄 때 전부 찾으면 네트워크를 수십 번 때린다 —
   *    사용자가 고른 것만 찾으면 보통 두세 번이다.
   * ⚠ 뜻을 못 찾아도 **단어는 담는다.** 뜻이 비어 있어도 사용자가 나중에 채울 수 있고,
   *   못 찾았다고 안 담으면 "눌렀는데 아무 일도 안 일어났다"가 된다.
   * 🟢 사전이 감지한 언어를 함께 저장한다 — 발음 재생과 다음 시험의 언어 판정이 정확해진다.
   */
  /**
   * 화면 좌표를 잰다. 🔴 **부모가 달라도 비교할 수 있는 유일한 좌표계다** —
   * 칩은 스크롤 안, 과녁은 헤더에 있다.
   * ⚠ 못 재면 `null` 을 준다. 연출 하나 때문에 담기가 실패하면 안 된다.
   */
  const measure = (node: View | null): Promise<{ x: number; y: number } | null> =>
    new Promise((resolve) => {
      if (node === null) {
        resolve(null);
        return;
      }
      node.measureInWindow((x, y, w, h) => {
        if (typeof x !== 'number' || Number.isNaN(x)) resolve(null);
        else resolve({ x, y, width: w, height: h } as { x: number; y: number });
      });
    });

  /** 날아갈 알을 세운다. 못 재면 조용히 건너뛰고 바로 목록에서 뺀다 */
  const startFlight = useCallback(async (words: string[]) => {
    const to = await measure(targetRef.current);
    const froms = await Promise.all(words.map((w) => measure(chipRefs.current[w] ?? null)));
    const built: Flight[] = [];
    words.forEach((w, i) => {
      const from = froms[i];
      if (from !== null && from !== undefined) built.push({ word: w, from });
    });
    if (to === null || built.length === 0) {
      setCandidates((prev) => prev.filter((w) => !words.includes(w)));
      setFlying(new Set());
      return;
    }
    setTarget(to);
    setFlights(built);
  }, []);

  /** 다 날아왔다 — 이제 목록에서 빼고 과녁을 튕긴다 */
  const handleFlightDone = useCallback(() => {
    setLanded((n) => n + flights.length);
    setCandidates((prev) => prev.filter((w) => !flying.has(w)));
    setFlying(new Set());
    setFlights([]);
    Animated.sequence([
      Animated.spring(bounce, { toValue: 1.35, useNativeDriver: true, speed: 50, bounciness: 14 }),
      Animated.spring(bounce, { toValue: 1, useNativeDriver: true, speed: 30, bounciness: 10 }),
    ]).start();
  }, [bounce, flights.length, flying]);

  const handleSave = useCallback(async () => {
    if (saving || picked.size === 0 || record === null) return;
    const categoryId = record.categoryId;
    if (categoryId === undefined) {
      showToast(t('이 시험은 어느 단어장에 담을지 알 수 없어요'), 'error');
      return;
    }
    setSaving(true);
    const done = new Set<string>();
    try {
      for (const word of picked) {
        let meanings: string[] = [];
        let examples: { example: string; translation?: string }[] = [];
        let language: string | undefined;
        try {
          const found = await dictionaryService.lookup(word);
          if (found.ok) {
            meanings = found.data.meanings;
            examples = found.data.examples;
            language = found.data.detectedLanguage;
          }
        } catch {
          // 뜻을 못 찾아도 단어는 담는다
        }
        await wordService.createWord({
          categoryId,
          word,
          meanings,
          examples,
          ...(language === undefined ? {} : { language }),
        });
        done.add(word);
      }
      setSaved((prev) => new Set([...prev, ...done]));
      setPicked(new Set());
      showToast(t('{{count}}개 단어를 단어장에 담았어요', { count: done.size }), 'success');
      // 🔴 여기서 목록을 **지우지 않는다.** 알이 다 날아간 뒤 `handleFlightDone` 이 지운다
      setFlying(new Set(done));
      void startFlight([...done]);
    } catch (error: any) {
      console.warn('단어 담기 실패:', error);
      // 🔴 몇 개는 들어갔을 수 있다. 들어간 것은 목록에서 빼 준다 — 두 번 담기지 않게
      if (done.size > 0) {
        setSaved((prev) => new Set([...prev, ...done]));
        setCandidates((prev) => prev.filter((w) => !done.has(w)));
      }
      showToast(t('단어를 담지 못했어요'), 'error');
    } finally {
      setSaving(false);
    }
  }, [picked, record, saving, showToast, startFlight, t]);

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

  // 🔴 최신 회차를 보여준다. 성적표(회차별)는 아래 "회차" 줄이 담당한다
  const latest = record.attempts[record.attempts.length - 1];
  const score = latest?.score ?? { correct: 0, wrong: 0, skipped: 0, total: 0, accuracy: 0 };
  const answers = latest?.answers ?? [];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style={colors.isDark ? 'light' : 'dark'} />
      {/*
        담은 단어가 날아와 꽂히는 **과녁**(시안 #13). 누르는 버튼이 아니라 **표시**다 —
        이 화면에서 단어장으로 가는 길을 새로 만들면 시험 결과를 덮어 버린다.
      */}
      <ScreenHeader
        title={t('시험 결과')}
        onBack={onBack}
        rightAccessory={
          <Animated.View
            ref={targetRef}
            collapsable={false}
            style={[styles.target, { transform: [{ scale: bounce }] }]}
          >
            <MaterialIcons name="library-books" size={22} color={colors.primary} />
            {landed > 0 && (
              <View style={[styles.targetBadge, { backgroundColor: colors.primary }]}>
                <Text style={styles.targetBadgeText}>+{landed}</Text>
              </View>
            )}
          </Animated.View>
        }
      />

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

        {/*
          🔴 단어 담기 — 이 화면의 진짜 값이다.
          점수보다 **위**에 두지 않는다(먼저 보고 싶은 것은 점수다). 바로 아래가 맞다.
        */}
        {candidates.length > 0 && (
          <View style={[styles.pickBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.pickTitle, { color: colors.text }]}>
              {t('시험에 나온 새 단어')}
            </Text>
            <Text style={[styles.pickHint, { color: colors.textSecondary }]}>
              {t('단어장에 없는 단어예요. 담으면 다음 학습에 나와요')}
            </Text>
            <View style={styles.chipWrap}>
              {candidates.map((word) => {
                const on = picked.has(word);
                const isFlying = flying.has(word);
                return (
                  <TouchableOpacity
                    key={word}
                    /*
                     * ⚠ `collapsable={false}` 를 주지 않는다 — `TouchableOpacity` 가 안 받는다.
                     *   대신 이 컴포넌트는 늘 opacity 를 들고 있어 안드로이드가 뷰를 합치지 않는다.
                     *   그래도 measure 가 안 되면 `startFlight` 가 조용히 건너뛰고 목록만 지운다.
                     */
                    ref={(node) => {
                      chipRefs.current[word] = node as unknown as View | null;
                    }}
                    style={[
                      styles.chip,
                      { backgroundColor: colors.background, borderColor: colors.border },
                      on && { backgroundColor: colors.primaryLight, borderColor: colors.primary },
                      // 담겨서 날아가는 중 — 초록 ✓ 로 바뀐다(시안 #13)
                      isFlying && { backgroundColor: colors.successBg, borderColor: colors.success },
                    ]}
                    onPress={() => toggle(word)}
                    disabled={saving || isFlying}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: on }}
                  >
                    <MaterialIcons
                      name={on || isFlying ? 'check-circle' : 'add-circle-outline'}
                      size={16}
                      color={isFlying ? colors.success : on ? colors.primary : colors.textTertiary}
                    />
                    <Text
                      style={[
                        styles.chipText,
                        { color: colors.text },
                        on && { color: colors.primaryStrong, fontWeight: '700' },
                        isFlying && { color: colors.successText, fontWeight: '700' },
                      ]}
                    >
                      {word}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <TouchableOpacity
              style={[
                styles.pickButton,
                { backgroundColor: colors.primaryStrong },
                (picked.size === 0 || saving) && styles.pickButtonDisabled,
              ]}
              onPress={() => void handleSave()}
              disabled={picked.size === 0 || saving}
              accessibilityRole="button"
            >
              {saving ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.pickButtonText}>
                  {picked.size === 0
                    ? t('담을 단어를 골라 주세요')
                    : t('{{count}}개 담기', { count: picked.size })}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        {saved.size > 0 && candidates.length === 0 && (
          <View style={[styles.pickBox, { backgroundColor: colors.successBg, borderColor: colors.successBorder }]}>
            <Text style={[styles.pickTitle, { color: colors.successText }]}>
              {t('{{count}}개 단어를 담았어요', { count: saved.size })}
            </Text>
          </View>
        )}

        <Text style={[styles.sectionLabel, { color: colors.text }]}>{t('문제 다시 보기')}</Text>

        {record.questions.map((question, index) => {
          const answer = answers[index];
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

      {/*
        날아가는 알약 (시안 #13). 🔴 **맨 위에, 그리고 Toast 보다 아래**에 둔다 —
        스크롤·푸터 위를 가로질러 헤더까지 가야 하고, 토스트는 늘 보여야 한다.
      */}
      {flights.length > 0 && target !== null && (
        <FlyingPills flights={flights} to={target} onDone={handleFlightDone} />
      )}

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
  // ── 담기 과녁(시안 #13) ──
  target: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  targetBadge: {
    position: 'absolute',
    top: 0,
    right: 0,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  targetBadgeText: { color: '#FFFFFF', fontSize: FONT.micro, fontWeight: '700' },

  // ── 단어 담기 ──
  pickBox: {
    borderWidth: 1,
    borderRadius: RADIUS.xl,
    padding: SPACING.md,
    marginBottom: SPACING.xl,
  },
  pickTitle: { fontSize: FONT.label, fontWeight: '700' },
  pickHint: { fontSize: FONT.caption, marginTop: 2, lineHeight: 18 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, marginTop: SPACING.md },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderRadius: RADIUS.pill,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    // 터치 영역 바닥
    minHeight: 40,
  },
  chipText: { fontSize: FONT.body },
  pickButton: {
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.md,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    marginTop: SPACING.md,
  },
  pickButtonDisabled: { opacity: 0.5 },
  pickButtonText: { color: '#fff', fontSize: FONT.body, fontWeight: '700' },
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
