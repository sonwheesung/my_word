import { useTranslation } from 'react-i18next';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
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
import { EXAM_EXPECTED_WAIT_SEC, EXAM_SIZE } from '../constants/appConfig';
import { useTheme } from '../contexts/ThemeContext';
import { useToast } from '../hooks/useToast';
import { commonServer } from '../services/commonServer/client';
import { examService, scoreExam, toSeedPayload, type ExamAnswer, type ExamLanguage } from '../services/examService';
import type { ExamQuestion } from '../services/commonServer/types';
import type { AppLanguage } from '../i18n/language';

/**
 * AI 시험 화면 — 기다리기 → 풀기.
 *
 * 🔴 **기다리는 시간이 길다. 그것을 숨기지 않는다.**
 *    2026-10-07 프로덕션 실측이 단어 3개에 34.5초였고 20문제 콜드 시험은 90초 안팎으로 추정된다.
 *    진행 막대를 가짜로 채우지 않고 **경과 초를 그대로 센다** — 가짜 막대가 끝에서 멈추면
 *    사용자는 고장으로 읽는다. 지금 얼마나 지났는지를 보여주는 것이 정직하고 덜 불안하다.
 *
 * 🔴 **채점은 기기에서 한다.** 서버를 부르지 않는다(`examService.scoreExam`).
 *    그래서 구독을 끊어도 재시험을 칠 수 있고 오프라인에서 이어 풀 수 있다.
 *
 * ⚠ 이 화면은 **퀴즈 결과를 쓰지 않는다**(`examService` 머리 주석).
 *   재시험을 구분하는 코드가 생기기 전까지는 통계에 넣지 않는다.
 */

interface ExamScreenProps {
  categoryId: number;
  language: ExamLanguage;
  uiLang: AppLanguage;
  onBack: () => void;
  onFinish: (examId: string) => void;
}

type Phase = 'loading' | 'solving' | 'failed';

/** 실패를 사용자가 읽을 문장으로 옮긴다. 🔴 사유마다 **사용자가 할 일이 다르다** */
function failMessage(reason: string): { title: string; body: string; retryable: boolean } {
  switch (reason) {
    case 'offline':
      // 🔴 미리 막지 않고 여기서 안내한다. 이 앱의 다른 기능은 오프라인에서 다 되므로
      //    "인터넷이 필요한 기능"이라는 것을 이 자리에서 알려 주는 것이 맞다
      return {
        title: '인터넷에 연결해 주세요',
        body: 'AI 시험은 문제를 만들 때만 인터넷이 필요해요. 연결한 뒤 다시 시도해 주세요',
        retryable: true,
      };
    case 'quota-exhausted':
      // 기다려도 안 풀린다 — 재시도 버튼을 주지 않는다
      return {
        title: '무료 시험을 다 쓰셨어요',
        body: '구독하시면 계속 시험을 볼 수 있어요',
        retryable: false,
      };
    case 'unavailable':
      return {
        title: '지금은 문제를 만들 수 없어요',
        body: '잠시 뒤에 다시 시도해 주세요',
        retryable: true,
      };
    case 'not-configured':
    case 'not-signed-in':
      return {
        title: '지금은 시험을 볼 수 없어요',
        body: '앱을 다시 시작한 뒤에도 같으면 문의해 주세요',
        retryable: true,
      };
    default:
      return {
        title: '문제를 만들지 못했어요',
        body: '잠시 뒤에 다시 시도해 주세요',
        retryable: true,
      };
  }
}

export default function ExamScreen({
  categoryId,
  language,
  uiLang,
  onBack,
  onFinish,
}: ExamScreenProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { toast, showToast, hideToast } = useToast();

  const [phase, setPhase] = useState<Phase>('loading');
  const [questions, setQuestions] = useState<ExamQuestion[]>([]);
  const [answers, setAnswers] = useState<ExamAnswer[]>([]);
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [examId, setExamId] = useState<string>('');
  const [failure, setFailure] = useState<string>('');
  const [elapsed, setElapsed] = useState(0);
  const [attempt, setAttempt] = useState(0);
  /** 🔴 연속 탭 방지. 다음 버튼을 빨리 두 번 누르면 문제가 하나 건너뛰어진다 */
  const advancing = useRef(false);

  // 경과 초. 🔴 가짜 진행 막대를 쓰지 않는 이유는 파일 머리 주석에 있다
  useEffect(() => {
    if (phase !== 'loading') return;
    setElapsed(0);
    const timer = setInterval(() => setElapsed((n) => n + 1), 1000);
    return () => clearInterval(timer);
  }, [phase, attempt]);

  // 문제 받아오기
  useEffect(() => {
    let alive = true;
    setPhase('loading');
    (async () => {
      try {
        const plan = await examService.buildSeeds(categoryId);
        const words = toSeedPayload(plan);
        if (!alive) return;
        if (words.length === 0) {
          setFailure('no-words');
          setPhase('failed');
          return;
        }
        const result = await commonServer.generateExam({
          language,
          uiLang,
          count: EXAM_SIZE,
          words,
        });
        if (!alive) return;
        if (!result.ok) {
          setFailure(result.reason);
          setPhase('failed');
          return;
        }
        setQuestions(result.exam.questions);
        setAnswers(result.exam.questions.map(() => null));
        setExamId(result.exam.examId ?? `local-${Date.now()}`);
        setIndex(0);
        setPicked(null);
        setPhase('solving');
        // ⚠ `degraded` 는 에러가 아니다. 시험은 정상이고 새 문제만 못 만든 것이다.
        //   사용자에게 사유를 설명하지 않는다 — 들어도 할 일이 없다.
        if (result.exam.degraded !== null && __DEV__) {
          console.log('[exam] degraded:', result.exam.degraded);
        }
      } catch (error: any) {
        console.warn('시험 생성 실패:', error);
        if (alive) {
          setFailure('error');
          setPhase('failed');
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [attempt, categoryId, language, uiLang]);

  /**
   * 🔴 풀던 중에 뒤로가기를 막는다.
   *
   * 문제를 만드는 데 돈이 들었고, 그냥 나가면 그 시험이 사라진다.
   * 안드로이드 하드웨어 뒤로가기도 같이 막아야 한다 — 헤더 버튼만 막으면 반쪽이다.
   */
  const confirmLeave = useCallback(() => {
    if (phase !== 'solving') {
      onBack();
      return true;
    }
    showToast(t('시험을 끝내면 성적이 남아요. 끝까지 풀어 주세요'), 'info');
    return true;
  }, [onBack, phase, showToast, t]);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', confirmLeave);
    return () => sub.remove();
  }, [confirmLeave]);

  const current = questions[index];

  const handleNext = useCallback(() => {
    if (advancing.current || current === undefined) return;
    advancing.current = true;
    // 다음 프레임에 풀어 준다 — 같은 탭이 두 번 들어오는 것만 막으면 된다
    setTimeout(() => {
      advancing.current = false;
    }, 300);

    const nextAnswers = [...answers];
    nextAnswers[index] = picked;
    setAnswers(nextAnswers);

    if (index + 1 < questions.length) {
      setIndex(index + 1);
      setPicked(null);
      return;
    }

    // 마지막 문제 — 기록을 남기고 결과로 넘어간다
    const score = scoreExam(questions, nextAnswers);
    void examService
      .saveRecord({
        examId,
        language,
        takenAt: new Date().toISOString(),
        questions,
        answers: nextAnswers,
        score,
      })
      .then(() => onFinish(examId))
      .catch((error: any) => {
        // 🔴 저장 실패를 삼키지 않는다 — 성적표가 비면 사용자가 알아야 한다
        console.warn('시험 기록 저장 실패:', error);
        showToast(t('성적을 저장하지 못했어요'), 'error');
        onFinish(examId);
      });
  }, [answers, current, examId, index, language, onFinish, picked, questions, showToast, t]);

  // ── 기다리는 화면 ────────────────────────────────────────────────────────
  if (phase === 'loading') {
    const over = elapsed > EXAM_EXPECTED_WAIT_SEC;
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <StatusBar style={colors.isDark ? 'light' : 'dark'} />
        <ScreenHeader title={t('AI 시험')} onBack={onBack} />
        <View style={styles.waitBox}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.waitTitle, { color: colors.text }]}>
            {t('내 단어로 문제를 만들고 있어요')}
          </Text>
          <Text style={[styles.waitElapsed, { color: colors.primaryStrong }]}>
            {t('{{sec}}초', { sec: elapsed })}
          </Text>
          <Text style={[styles.waitHint, { color: colors.textSecondary }]}>
            {over
              ? t('거의 다 됐어요. 조금만 더 기다려 주세요')
              : t('{{sec}}초쯤 걸려요. 앱을 닫지 말아 주세요', { sec: EXAM_EXPECTED_WAIT_SEC })}
          </Text>
        </View>
      </View>
    );
  }

  // ── 실패 화면 ────────────────────────────────────────────────────────────
  if (phase === 'failed') {
    const message =
      failure === 'no-words'
        ? {
            title: '시험을 만들 단어가 없어요',
            body: '이 카테고리에 단어를 먼저 추가해 주세요',
            retryable: false,
          }
        : failMessage(failure);
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <StatusBar style={colors.isDark ? 'light' : 'dark'} />
        <ScreenHeader title={t('AI 시험')} onBack={onBack} />
        <View style={styles.waitBox}>
          <MaterialIcons name="cloud-off" size={56} color={colors.textTertiary} />
          <Text style={[styles.waitTitle, { color: colors.text }]}>{t(message.title)}</Text>
          <Text style={[styles.waitHint, { color: colors.textSecondary }]}>{t(message.body)}</Text>
          <View style={styles.failButtons}>
            {message.retryable && (
              <TouchableOpacity
                style={[styles.retryButton, { backgroundColor: colors.primaryStrong }]}
                onPress={() => setAttempt((n) => n + 1)}
                accessibilityRole="button"
              >
                <Text style={styles.retryButtonText}>{t('다시 시도')}</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.retryButton, styles.secondaryButton, { borderColor: colors.border }]}
              onPress={onBack}
              accessibilityRole="button"
            >
              <Text style={[styles.retryButtonText, { color: colors.text }]}>{t('돌아가기')}</Text>
            </TouchableOpacity>
          </View>
        </View>
        <Toast message={toast.message} type={toast.type} visible={toast.visible} onHide={hideToast} />
      </View>
    );
  }

  // ── 푸는 화면 ────────────────────────────────────────────────────────────
  if (current === undefined) {
    // 방어: 문제가 비면 빈 화면을 그리지 않는다
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <StatusBar style={colors.isDark ? 'light' : 'dark'} />
        <ScreenHeader title={t('AI 시험')} onBack={onBack} />
        <View style={styles.waitBox}>
          <Text style={[styles.waitTitle, { color: colors.text }]}>{t('문제를 불러오지 못했어요')}</Text>
        </View>
      </View>
    );
  }

  const last = index + 1 === questions.length;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style={colors.isDark ? 'light' : 'dark'} />
      <ScreenHeader title={t('AI 시험')} onBack={confirmLeave} />

      <View style={[styles.progressRow, { borderBottomColor: colors.border }]}>
        <Text style={[styles.progressText, { color: colors.textSecondary }]}>
          {index + 1} / {questions.length}
        </Text>
        <View style={[styles.progressTrack, { backgroundColor: colors.borderLight }]}>
          <View
            style={[
              styles.progressFill,
              { backgroundColor: colors.primary, width: `${((index + 1) / questions.length) * 100}%` },
            ]}
          />
        </View>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={[styles.prompt, { color: colors.text }]}>{current.prompt}</Text>

        {current.choices.map((choice, choiceIndex) => {
          const on = picked === choiceIndex;
          return (
            <TouchableOpacity
              key={`${current.id}-${choiceIndex}`}
              style={[
                styles.choice,
                { backgroundColor: colors.card, borderColor: colors.border },
                on && { backgroundColor: colors.primaryLight, borderColor: colors.primary },
              ]}
              onPress={() => setPicked(choiceIndex)}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
            >
              <View
                style={[
                  styles.choiceRadio,
                  { borderColor: colors.border },
                  on && { borderColor: colors.primary },
                ]}
              >
                {on && <View style={[styles.choiceDot, { backgroundColor: colors.primary }]} />}
              </View>
              <Text
                style={[
                  styles.choiceText,
                  { color: colors.text },
                  on && { color: colors.primaryStrong, fontWeight: '600' },
                ]}
              >
                {choice}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <View style={[styles.footer, { backgroundColor: colors.background, borderTopColor: colors.border }]}>
        <TouchableOpacity
          style={[styles.nextButton, { backgroundColor: colors.primaryStrong }]}
          onPress={handleNext}
          accessibilityRole="button"
        >
          <Text style={styles.nextButtonText}>
            {/* 🔴 안 고르고도 넘어갈 수 있다. 억지로 고르게 하면 모르는 문제에서 아무거나 찍는다 */}
            {last ? t('끝내기') : picked === null ? t('모르겠어요') : t('다음')}
          </Text>
        </TouchableOpacity>
      </View>

      <Toast message={toast.message} type={toast.type} visible={toast.visible} onHide={hideToast} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  waitBox: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: SPACING.xl },
  waitTitle: {
    fontSize: FONT.title,
    fontWeight: '700',
    marginTop: SPACING.lg,
    textAlign: 'center',
  },
  waitElapsed: { fontSize: 32, fontWeight: '700', marginTop: SPACING.md },
  waitHint: {
    fontSize: FONT.body,
    marginTop: SPACING.sm,
    textAlign: 'center',
    lineHeight: 22,
  },
  failButtons: { marginTop: SPACING.xl, width: '100%', gap: SPACING.sm },
  retryButton: {
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.md,
    alignItems: 'center',
    minHeight: 48,
    justifyContent: 'center',
  },
  secondaryButton: { backgroundColor: 'transparent', borderWidth: 1 },
  retryButtonText: { color: '#fff', fontSize: FONT.body, fontWeight: '700' },
  progressRow: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  progressText: { fontSize: FONT.caption, marginBottom: SPACING.xs },
  progressTrack: { height: 4, borderRadius: RADIUS.pill, overflow: 'hidden' },
  progressFill: { height: 4, borderRadius: RADIUS.pill },
  scrollView: { flex: 1 },
  scrollContent: { padding: SPACING.lg, paddingBottom: SPACING.xl },
  prompt: {
    fontSize: FONT.title,
    fontWeight: '600',
    lineHeight: 30,
    marginBottom: SPACING.lg,
  },
  choice: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    minHeight: 48,
  },
  choiceRadio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    marginRight: SPACING.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  choiceDot: { width: 10, height: 10, borderRadius: 5 },
  choiceText: { flex: 1, fontSize: FONT.body, lineHeight: 22 },
  footer: { padding: SPACING.lg, borderTopWidth: StyleSheet.hairlineWidth },
  nextButton: {
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.md,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  nextButtonText: { color: '#fff', fontSize: FONT.body, fontWeight: '700' },
});
