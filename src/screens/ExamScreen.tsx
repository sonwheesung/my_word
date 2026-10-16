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

import ConfirmSheet from '../components/ConfirmSheet';
import ScreenHeader from '../components/ScreenHeader';
import Toast from '../components/Toast';
import { FONT, RADIUS, SPACING } from '../constants/design';
import { EXAM_EXPECTED_WAIT_SEC, EXAM_FREE_QUOTA, EXAM_SIZE } from '../constants/appConfig';
import { useTheme } from '../contexts/ThemeContext';
import { useToast } from '../hooks/useToast';
import { commonServer, ensureDeviceSession } from '../services/commonServer/client';
import { examService, scoreExam, toSeedPayload, type ExamAnswer, type ExamLanguage } from '../services/examService';
import { examQuotaService } from '../services/examQuotaService';
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

/**
 * 🔴 이 화면은 **두 모드**다.
 *
 * ```
 * 새 시험   categoryId · language 를 받아 서버에서 문제를 만든다 (느리다 · 돈이 든다)
 * 재시험    retryExamId 를 받아 **저장된 문제를 그대로 다시 낸다** (빠르다 · 공짜 · 오프라인에서도 된다)
 * ```
 *
 * 🔴 재시험이 서버를 안 부르는 것이 기획의 약속을 지키는 방법이다 —
 *    *"구독 해지 뒤에도 객관식 재시험까지 된다"*.
 */
interface ExamScreenProps {
  categoryId?: number;
  language?: ExamLanguage;
  uiLang: AppLanguage;
  /** 있으면 재시험이다. 저장된 문제를 다시 낸다 */
  retryExamId?: string;
  /**
   * 풀다 만 시험을 이어서 푼다 (2026-10-14).
   *
   * 🔴 **서버를 부르지 않는다.** 문제가 이미 기기에 있다 — 다시 부르면 **원가가 또 나간다.**
   *    `retryExamId` 와 같은 자리에 선다: 둘 다 "만들지 않고 푼다" 는 길이다.
   */
  resume?: boolean;
  onBack: () => void;
  onFinish: (examId: string) => void;
}

type Phase = 'loading' | 'solving' | 'failed';


/**
 * 기다리는 동안 서버가 하는 일 (2026-10-08 시안 #12).
 *
 * 🔴 **✓ 를 차례로 켜지 않는다.** 서버가 단계별 진행을 알려주지 않으므로 시간으로 켜면
 *    **모양만 다른 가짜 진행 막대**가 된다. 이 화면이 애초에 가짜 막대를 거부한 이유가 그것이다.
 *    목록은 *기다림이 무엇을 사는지*를 알려 줄 뿐, *얼마나 왔는지*는 아는 척하지 않는다.
 */
/**
 * 접수증을 얼마나 자주 물어보나.
 *
 * ⚠ 짧게 하면 90초 동안 **스무 번 넘게** 서버를 때린다. 길게 하면 다 됐는데 기다린다.
 *   물음 자체는 DB 한 줄 읽기라 싸지만, 공짜는 아니다.
 */
const POLL_MS = 3000;

/** ⚠ 화면이 사라진 뒤 깨어나도 `alive` 검사가 막는다 */
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const WAIT_STEPS: Array<{ title: string; sub: string }> = [
  { title: '씨앗 단어 고르기', sub: '복습할 때 · 자주 틀림 · 무작위' },
  { title: '헷갈리는 단어 찾기', sub: '비슷한 뜻으로 보기를 만들어요' },
  { title: '문제 만들기', sub: '객관식 20문제' },
  { title: '해설 붙이기', sub: '왜 정답인지 한 줄씩' },
];

/**
 * 실패를 사용자가 읽을 문장으로 옮긴다. 🔴 사유마다 **사용자가 할 일이 다르다**
 *
 * 🔴 **`degraded` 는 503 안을 다시 가른다**(2026-10-15 · 서버가 사유를 올려 주기 시작했다).
 *
 * ```
 * unavailable + daily      오늘 몫을 다 만들었다  → 기다려도 오늘은 안 된다. 내일이다
 * unavailable + cooldown   방금 실패해 식히는 중  → 10분쯤 뒤에 된다
 * unavailable + word-cap   이 단어들로는 더 못 만든다 → 단어를 더 넣어야 한다
 * unavailable + 그 외       알 수 없다            → 지금까지처럼 "잠시 뒤에"
 * ```
 *
 * ⚠ **예산(`budget`)은 따로 가르지 않는다.** 언제 풀리는지 우리가 약속할 수 없어서다 —
 *   *"내일 다시"* 라고 적으면 달이 바뀔 때까지 매일 거짓말이 된다. 기본 문구가 맞다.
 */
function failMessage(
  reason: string,
  degraded?: string | null,
): { title: string; body: string; retryable: boolean } {
  switch (reason) {
    case 'offline':
      // 🔴 미리 막지 않고 여기서 안내한다. 이 앱의 다른 기능은 오프라인에서 다 되므로
      //    "인터넷이 필요한 기능"이라는 것을 이 자리에서 알려 주는 것이 맞다
      return {
        title: '인터넷에 연결해 주세요',
        body: 'AI 시험은 문제를 만들 때만 인터넷이 필요해요. 연결한 뒤 다시 시도해 주세요',
        retryable: true,
      };
    case 'no-progress':
      /*
       * 🔴 「이어서 풀기」를 눌렀는데 저장본이 없다 (2026-10-14).
       *    저장이 실패했거나, 다른 경로로 지워졌거나, 저장본이 깨진 경우다.
       * ⚠ **재시도 버튼을 주지 않는다** — 다시 눌러도 같은 자리다. 돌아가서 새로 시작해야 한다.
       */
      return {
        /*
         * ⚠ **「찾지」가 아니라 「불러오지」다**(2026-10-16 사장님 결정 · 시안 #27).
         *   「찾지 못했어요」는 *어딘가 있는데 우리가 못 찾았다*로 읽혀서, 사용자가 찾아 나서게 된다.
         *   실제로는 이 기기의 저장본이 **없어진** 것이라 찾을 데가 없다.
         */
        title: '풀던 시험을 불러오지 못했어요',
        /*
         * 🔴 **먼저 성적표를 보게 한다**(2026-10-15). 같은 날부터 문제가 도착하는 순간
         *    성적표에도 한 줄이 생기므로, 「풀던 시험」을 잃어도 그 판이 거기 남아 있다.
         *    새로 만들면 무료 1번을 쓰지만, 성적표에서 푸는 것은 공짜다.
         * ⚠ *"있어요"* 가 아니라 *"있으면"* 이다 — 저장이 양쪽 다 실패한 경우가 있다.
         */
        body: '성적표에 그 시험이 남아 있으면 무료 횟수를 쓰지 않고 그대로 풀 수 있어요',
        retryable: false,
      };
    case 'quota-exhausted':
      // 기다려도 안 풀린다 — 재시도 버튼을 주지 않는다
      /*
       * 🔴 **진입 카드(`FreeExamCard`)와 글자까지 같은 말을 쓴다**(2026-10-16 사장님 결정).
       *    2026-10-15 에 카드가 들어가면서 **같은 사실을 두 화면이 다르게 말하고 있었다** —
       *    카드는 「10번을 다 썼어요 / 판수 제한 없이」, 이쪽은 「다 쓰셨어요 / 계속 볼 수 있어요」.
       * 🚫 「계속 시험을 볼 수 있어요」는 「무제한」에 가깝게 읽힌다. 구독이 여는 것은 **판수**뿐이고
       *    하루 호출 한도 · 10분 쿨다운 · 월 예산은 구독자에게도 남는다(`FreeExamCard` 머리 주석).
       */
      return {
        title: '무료 시험 {{total}}번을 다 썼어요',
        body: '구독하면 시험 판수 제한 없이 볼 수 있어요',
        retryable: false,
      };
    case 'unavailable':
      // 🔴 **무료 횟수는 줄지 않았다**(서버가 문제를 한 개도 못 낸 경우다). 그 말을 적지 않는 것은
      //    안 줄었다는 것이 당연해서다 — 줄었다고 의심할 이유를 화면이 먼저 만들지 않는다.
      if (degraded === 'daily') {
        return {
          title: '오늘은 새 문제를 다 만들었어요',
          body: '내일 다시 만들 수 있어요',
          retryable: false,
        };
      }
      if (degraded === 'cooldown') {
        return {
          title: '잠깐 쉬고 있어요',
          body: '10분쯤 뒤에 다시 시도해 주세요',
          retryable: true,
        };
      }
      if (degraded === 'word-cap') {
        return {
          title: '이 단어들로는 더 만들 수 없어요',
          body: '단어를 더 넣으시면 새 문제를 만들 수 있어요',
          retryable: false,
        };
      }
      return {
        title: '지금은 문제를 만들 수 없어요',
        body: '잠시 뒤에 다시 시도해 주세요',
        retryable: true,
      };
    case 'not-configured':
    case 'not-signed-in':
    case 'unauthorized':
      /*
       * 🔴 **세션이 끊긴 경우다. 이 화면에서 스스로 복구한다**(2026-10-07 에뮬레이터에서 잡았다).
       *
       *    SDK 는 401 을 받으면 토큰을 버린다. 그런데 기기 재등록은 부팅 때만 하므로,
       *    그냥 두면 **「다시 시도」가 영원히 실패한다** — 사용자는 앱을 껐다 켜야 하는데
       *    화면이 그 말을 안 해 준다. 그래서 재시도 전에 세션을 다시 만든다(아래 effect).
       */
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
  retryExamId,
  resume = false,
  onBack,
  onFinish,
}: ExamScreenProps) {
  const isRetry = retryExamId !== undefined && retryExamId !== '';
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
  /**
   * 503 안의 **자세한 까닭**(`daily` · `cooldown` · `word-cap` …). 없으면 `null` (2026-10-15).
   * ⚠ 옛 서버·옛 접수증에서는 안 온다. 그때는 지금까지와 같은 문구가 나간다.
   */
  const [degraded, setDegraded] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  /*
   * 🔴 **기다리는 동안 보여 주던 「내 단어장에서」 카드를 뺐다**(2026-10-12 사장님 제보).
   *    시안 #12 가 넣었지만, **시험을 보러 온 사람에게 그 카테고리 단어를 미리 보여 주는 것**은
   *    시험과 맞지 않는다 — 곧 그 단어로 문제를 낼 참이다. 공부 카드가 아니라 **커닝 페이퍼**가 된다.
   *    대기 화면에 남는 것: 경과 시간 · 무엇을 만들고 있는지(4단계).
   */
  const [attempt, setAttempt] = useState(0);
  /** 🔴 연속 탭 방지. 다음 버튼을 빨리 두 번 누르면 문제가 하나 건너뛰어진다 */
  const advancing = useRef(false);
  /** 나가기 확인 시트 (2026-10-14) */
  const [leaving, setLeaving] = useState(false);

  /**
   * 저장할 때 쓰는 값들.
   *
   * 🔴 **이어서 풀기면 저장본이 정본이다.** props 로 들어온 카테고리·언어는 *지금 설정 화면에
   *    떠 있던 값*이지 *그 시험을 만든 값*이 아니다. 그대로 쓰면 성적표의 「단어 담기」가
   *    **엉뚱한 단어장**을 가리킨다.
   */
  const [meta, setMeta] = useState<{ isRetry: boolean; categoryId?: number; language?: string }>({
    isRetry,
    ...(categoryId === undefined ? {} : { categoryId }),
    ...(language === undefined ? {} : { language }),
  });

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
    // 🔴 지난 실패의 사유를 들고 가지 않는다 — 다음 실패가 **다른 이유**일 수 있다
    setDegraded(null);
    (async () => {
      try {
        /*
         * ── 이어서 풀기 ── 기기에 있는 것을 그대로 펼친다. 서버를 부르지 않는다 (2026-10-14).
         *
         * 🔴 **저장본이 없으면 빈손으로 두지 않는다.** 「이어서 풀기」를 눌렀는데 아무 일도 안
         *    일어나면 사용자는 고장으로 읽는다. 사유를 말하고 돌아갈 길을 준다.
         */
        if (resume) {
          const saved = await examService.loadProgress();
          if (!alive) return;
          if (saved === null) {
            setFailure('no-progress');
            setPhase('failed');
            return;
          }
          setQuestions(saved.questions);
          setAnswers(saved.answers);
          setExamId(saved.examId);
          setIndex(saved.index);
          // 🔴 그 문제를 이미 골랐었다면 고른 채로 보여 준다. 아니면 비운다
          setPicked(saved.answers[saved.index] ?? null);
          setMeta({
            isRetry: saved.isRetry,
            ...(saved.categoryId === undefined ? {} : { categoryId: saved.categoryId }),
            ...(saved.language === undefined ? {} : { language: saved.language }),
          });
          setPhase('solving');
          return;
        }

        // ── 재시험 ── 저장된 문제를 그대로 낸다. 서버를 부르지 않는다
        if (isRetry) {
          const records = await examService.getRecords();
          const found = records.find((r) => r.examId === retryExamId);
          if (!alive) return;
          if (found === undefined || found.questions.length === 0) {
            setFailure('no-words');
            setPhase('failed');
            return;
          }
          /*
           * 🔴 **같은 판의 「풀던 시험」이 남아 있으면 비운다** (2026-10-15).
           *    성적표에서 처음으로 되돌아가 푸는 길이라, 그 판의 중간 저장은 이미 지난 것이다.
           *    안 비우면 설정 화면이 *"풀던 시험이 있어요"* 라며 **같은 판의 옛 자리**를 가리킨다.
           * ⚠ **다른 판의 저장본은 건드리지 않는다** — examId 가 같을 때만이다.
           */
          const inProgress = await examService.loadProgress();
          if (inProgress !== null && inProgress.examId === found.examId) {
            await examService.clearProgress();
          }
          if (!alive) return;
          setQuestions(found.questions);
          setAnswers(found.questions.map(() => null));
          setExamId(found.examId);
          setIndex(0);
          setPicked(null);
          setPhase('solving');
          return;
        }

        if (categoryId === undefined || language === undefined) {
          setFailure('error');
          setPhase('failed');
          return;
        }
        /*
         * 🔴 **들고 있는 접수증이 있으면 그것을 이어받는다**(2026-10-12).
         *    다시 시작하면 서버가 접수증을 또 발급하고 **원가가 두 번 나간다.**
         *    앱을 껐다 켜고 다시 들어온 사람이 밟는 길이 정확히 이 자리다.
         */
        const saved = await examService.loadJob();
        if (!alive) return;
        let jobId = saved?.jobId ?? '';
        if (saved !== null) {
          // 경과 초를 **이어서** 센다. 0 으로 되돌리면 방금 시작한 것처럼 보인다
          const elapsedMs = Date.now() - new Date(saved.startedAt).getTime();
          if (Number.isFinite(elapsedMs) && elapsedMs > 0) {
            setElapsed(Math.floor(elapsedMs / 1000));
          }
        } else {
          const plan = await examService.buildSeeds(categoryId);
          const words = toSeedPayload(plan);
          if (!alive) return;
          if (words.length === 0) {
            setFailure('no-words');
            setPhase('failed');
            return;
          }
          let started = await commonServer.startExam({ language, uiLang, count: EXAM_SIZE, words });
          /*
           * 🔴 **세션이 끊겼으면 한 번 되살리고 다시 해 본다.**
           *    기기 세션은 부팅 때만 만들어지는데, 그 사이 서버에서 주체가 사라질 수 있다
           *    (탈퇴 · 운영 정리). 그대로 두면 「다시 시도」가 영원히 실패한다.
           * ⚠ **한 번만** 한다. 루프가 되면 재등록 레이트리밋(IP당 10회/600초)에 걸린다.
           */
          if (!started.ok && (started.reason === 'unauthorized' || started.reason === 'not-signed-in')) {
            const revived = await ensureDeviceSession();
            if (!alive) return;
            if (revived) {
              started = await commonServer.startExam({ language, uiLang, count: EXAM_SIZE, words });
            }
          }
          if (!alive) return;
          if (!started.ok) {
            /*
             * 🔴 **다 썼다는 것을 기기에도 적는다**(2026-10-15 시안 #19).
             *    적지 않으면 다음에 들어온 사람에게 카드가 **옛 숫자**를 보여 주고,
             *    그 숫자를 믿고 또 눌러 90초를 기다리게 된다.
             */
            if (started.reason === 'quota-exhausted') await examQuotaService.saveFreeLeft(0);
            setFailure(started.reason);
            setDegraded(started.degraded ?? null);
            setPhase('failed');
            return;
          }
          jobId = started.jobId;
          /*
           * 🔴 **접수증을 먼저 적고 기다린다.** 적기 전에 앱이 죽으면 만들어진 시험을
           *    영영 못 찾는다 — 원가는 이미 나간 뒤다. 못 적으면 아예 시작하지 않는다.
           */
          try {
            await examService.saveJob({
              jobId,
              categoryId,
              language,
              uiLang,
              startedAt: new Date().toISOString(),
            });
          } catch (error: any) {
            console.warn('접수증 저장 실패:', error);
            if (!alive) return;
            setFailure('error');
            setPhase('failed');
            return;
          }
        }

        /*
         * 접수증을 물어본다. ⚠ **앱이 따로 시간을 재지 않는다** — 서버가 6분 넘은 접수증을
         *   `failed` 로 바꿔 읽는다(`AI_EXAM_SYSTEM.md` §4.5). 두 곳에서 재면 어긋난다.
         */
        while (alive) {
          const asked = await commonServer.examJob(jobId);
          if (!alive) return;
          if (!asked.ok) {
            // 🔴 `not-found` 는 남의 접수증이거나 사라진 것이다. 버리고 처음부터 할 수 있게 한다
            if (asked.reason === 'not-found') await examService.clearJob();
            // ⚠ 잠깐 끊긴 것일 수 있다. 오프라인이면 다음 물음에서 다시 붙는다
            if (asked.reason === 'offline') {
              await sleep(POLL_MS);
              continue;
            }
            setFailure(asked.reason);
            setDegraded(asked.degraded ?? null);
            setPhase('failed');
            return;
          }
          if (asked.job.status === 'pending') {
            await sleep(POLL_MS);
            continue;
          }
          await examService.clearJob();
          if (!alive) return;
          if (asked.job.status === 'failed') {
            setFailure(asked.job.reason);
            setDegraded(asked.job.degraded);
            setPhase('failed');
            return;
          }
          const exam = asked.job.exam;
          /*
           * 🔴 **남은 판수는 여기서만 들을 수 있다.** 서버는 `remaining` 을 시험을 받은
           *    응답에만 싣는다(들어오기 전에 물어보는 길이 없다).
           * 🔴 **구독자는 `null` 이다 — 0 으로 읽으면 구독자에게 "다 썼어요"가 뜬다.**
           *    그래서 숫자일 때만 적는다.
           * ⚠ 한 판을 만들었으니 「해지 후」 안내는 거둔다 — 한 번 알렸으면 됐다.
           */
          if (exam.remaining !== null) await examQuotaService.saveFreeLeft(exam.remaining);
          await examQuotaService.dismissEndedNotice();
          if (!alive) return;
          setQuestions(exam.questions);
          setAnswers(exam.questions.map(() => null));
          setExamId(exam.examId ?? `local-${Date.now()}`);
          setIndex(0);
          setPicked(null);
          setPhase('solving');
          // ⚠ `degraded` 는 에러가 아니다. 시험은 정상이고 새 문제만 못 만든 것이다.
          //   사용자에게 사유를 설명하지 않는다 — 들어도 할 일이 없다.
          if (exam.degraded !== null && __DEV__) {
            console.log('[exam] degraded:', exam.degraded);
          }
          return;
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
  }, [attempt, categoryId, isRetry, language, resume, retryExamId, uiLang]);

  /**
   * 🔴 **문제가 손에 들어오는 순간 적는다** (2026-10-14).
   *
   *    한 문제도 안 풀고 나가도 그 판은 살아 있어야 한다 — 돈은 이미 나갔다.
   *    「고를 때마다 적기」(`handleNext`)만으로는 **첫 문제 전**이 비는데, 90초를 기다린
   *    직후가 사람이 가장 많이 나가는 자리다(전화·알림·화면 꺼짐).
   *
   * ⚠ 이어서 풀기로 들어온 경우에는 **다시 적지 않는다.** 방금 읽은 것을 그대로 덮어쓰는
   *   일이고, 실패하면 멀쩡한 저장본을 깨뜨릴 수 있다.
   */
  useEffect(() => {
    if (phase !== 'solving' || resume || questions.length === 0) return;
    void examService.saveProgress({
      examId,
      questions,
      answers,
      index,
      isRetry: meta.isRetry,
      ...(meta.categoryId === undefined ? {} : { categoryId: meta.categoryId }),
      ...(meta.language === undefined ? {} : { language: meta.language }),
      savedAt: new Date().toISOString(),
    });
    /*
     * 🔴 **성적표에도 같이 적는다 — 「풀던 시험」 하나에만 맡기지 않는다** (2026-10-15).
     *
     *    「풀던 시험」은 **한 판만** 담는 자리다. 새 시험을 시작하면 덮이고, 저장이 실패하면
     *    통째로 없다. 그 하나를 잃으면 **돈이 나간 판이 흔적도 없이 사라졌다** —
     *    다시 하려면 무료 1번을 또 써야 했다.
     *    성적표는 20판을 들고 있으므로, 여기에 한 줄 있으면 공짜로 다시 풀 수 있다.
     *
     * 🚫 **재시험에는 하지 않는다.** 그 기록에는 이미 회차가 쌓여 있어서, 빈 회차로 덮으면
     *    지난 성적을 지운다. 되돌릴 수 없는 종류의 사고다.
     */
    if (!meta.isRetry) {
      void examService.saveUnplayed({
        examId,
        language: meta.language ?? '',
        ...(meta.categoryId === undefined ? {} : { categoryId: meta.categoryId }),
        takenAt: new Date().toISOString(),
        questions,
      });
    }
    // 🔴 문제가 도착한 **그때 한 번**이다. answers·index 가 바뀔 때마다 돌면 안 된다
    //    (그 저장은 `handleNext` 가 자기가 만든 값으로 직접 한다 — 상태 반영을 안 기다린다)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, examId]);

  /**
   * 풀던 중에 나가려 하면 **한 번 물어본다** (2026-10-14).
   *
   * 🔴 **2026-10-14 까지는 아예 못 나갔다.** 띠 하나를 띄우고 그 자리에 세워 뒀다.
   *    이유는 *"문제를 만드는 데 돈이 들었고 그냥 나가면 사라진다"* 였는데,
   *    **그 막기는 지키지도 못했다**:
   *
   * ```
   * 시험 내용은 마지막 문제를 풀어야 저장됐다 — 중간 저장이 없었다
   *   홈 버튼 · 앱 종료 · 오래 끊긴 전화  → 똑같이 사라진다   ✗ 못 막는다
   *   뒤로가기                          → 막혀 있다          ← 이것 하나뿐
   * ```
   *
   *    갇힌 사람은 앱을 강제로 끄므로 **막을수록 더 자주 잃는 구조**였다.
   *    (사장님: *"그냥 나갈 수 있게 하면 안돼?"*)
   *
   * 🔴 그래서 고친 방향은 「나가게 해 준다」가 아니라 **「나가도 안 사라지게 한다」**이다.
   *    문을 열기만 하면 정말로 잃기 시작한다 — 저장이 먼저다.
   *
   * ⚠ 안드로이드 하드웨어 뒤로가기도 같이 받는다 — 헤더 버튼만 막으면 반쪽이다.
   */
  const confirmLeave = useCallback(() => {
    if (phase !== 'solving') {
      onBack();
      return true;
    }
    setLeaving(true);
    return true;
  }, [onBack, phase]);

  /** 「나가기」를 고른 뒤. 🔴 **저장이 끝난 뒤에 나간다** — 먼저 나가면 저장이 취소될 수 있다 */
  const leaveNow = useCallback(() => {
    setLeaving(false);
    void examService
      .saveProgress({
        examId,
        questions,
        answers,
        index,
        isRetry: meta.isRetry,
        ...(meta.categoryId === undefined ? {} : { categoryId: meta.categoryId }),
        ...(meta.language === undefined ? {} : { language: meta.language }),
        savedAt: new Date().toISOString(),
      })
      .then(() => onBack());
  }, [answers, examId, index, meta, onBack, questions]);

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
      /*
       * 🔴 **고르는 족족 적는다.** 나갈 때만 적으면 앱이 죽는 경로가 그대로 남아
       *    "나갈 수 있게 했는데도 가끔 사라진다" 가 된다 — 그게 더 나쁘다.
       * ⚠ 상태(`answers`·`index`)가 반영되기를 기다리지 않고 **방금 만든 값**을 적는다.
       */
      void examService.saveProgress({
        examId,
        questions,
        answers: nextAnswers,
        index: index + 1,
        isRetry: meta.isRetry,
        ...(meta.categoryId === undefined ? {} : { categoryId: meta.categoryId }),
        ...(meta.language === undefined ? {} : { language: meta.language }),
        savedAt: new Date().toISOString(),
      });
      return;
    }

    // 마지막 문제 — 기록을 남기고 결과로 넘어간다
    const now = new Date().toISOString();
    /*
     * 🔴 재시험이면 **회차만 더한다.** `addAttempt` 는 통계를 건드리지 않는다 —
     *    같은 문제를 다시 풀면 외워서 맞히므로 정답률이 부푼다(`examService` 머리 주석).
     */
    const save = meta.isRetry
      ? examService.addAttempt(examId, nextAnswers).then(() => undefined)
      : (async () => {
          const record = {
            examId,
            ...(meta.language === undefined ? {} : { language: meta.language }),
            // 🔴 단어 담기가 이 값을 쓴다 — 담을 단어장이 어디인지
            ...(meta.categoryId === undefined ? {} : { categoryId: meta.categoryId }),
            takenAt: now,
            questions,
            attempts: [
              { answers: nextAnswers, score: scoreExam(questions, nextAnswers), takenAt: now },
            ],
          } as Parameters<typeof examService.saveRecord>[0];
          /*
           * 🔴 **통계는 한 판에 한 번만 센다. 저장하기 전에 물어본다** (2026-10-15).
           *
           *    성적표에서 이미 푼 판을, 남아 있던 「풀던 시험」으로 또 끝내는 길이 있다.
           *    저장한 뒤에 물으면 방금 넣은 회차가 보여서 구분이 사라진다 — 그래서 먼저다.
           * ⚠ 회차가 **빈** 기록(문제만 받아 둔 판)은 아직 안 센 것이므로 `false` 가 온다.
           */
          const counted = await examService.hasCountedAttempt(examId);
          await examService.saveRecord(record);
          // 🔴 1회차만 통계에 쓴다. 저장이 끝난 뒤에 부른다
          if (!counted) await examService.recordFirstAttempt(record);
        })();

    void save
      /*
       * 🔴 **끝났으면 「풀던 시험」을 비운다.** 안 비우면 성적표를 보고 나온 사람에게
       *    설정 화면이 *"풀던 시험이 있어요"* 라고 말한다 — 눌러도 이미 끝난 판이다.
       * ⚠ 저장이 **실패해도** 비운다. 그 판은 어떤 경로로도 다시 끝낼 수 없다
       *   (아래에서 결과 화면으로 넘기므로 사용자는 이미 떠났다).
       */
      .then(() => examService.clearProgress())
      .then(() => onFinish(examId))
      .catch((error: any) => {
        // 🔴 저장 실패를 삼키지 않는다 — 성적표가 비면 사용자가 알아야 한다
        console.warn('시험 기록 저장 실패:', error);
        showToast(t('성적을 저장하지 못했어요'), 'error');
        void examService.clearProgress().then(() => onFinish(examId));
      });
  }, [answers, current, examId, index, meta, onFinish, picked, questions, showToast, t]);

  // ── 기다리는 화면 ────────────────────────────────────────────────────────
  if (phase === 'loading') {
    const over = elapsed > EXAM_EXPECTED_WAIT_SEC;
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <StatusBar style={colors.isDark ? 'light' : 'dark'} />
        <ScreenHeader title={t('AI 시험')} onBack={onBack} />
        <ScrollView contentContainerStyle={styles.waitBox}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.waitTitle, { color: colors.text }]}>
            {isRetry ? t('시험을 불러오고 있어요') : t('내 단어로 문제를 만들고 있어요')}
          </Text>
          {/* ⚠ 재시험은 저장소만 읽으므로 초를 세는 것이 의미가 없다 */}
          {!isRetry && (
            <Text style={[styles.waitElapsed, { color: colors.primaryStrong }]}>
              {t('{{sec}}초', { sec: elapsed })}
            </Text>
          )}
          {!isRetry && (
            <Text style={[styles.waitHint, { color: colors.textSecondary }]}>
              {over
                ? t('거의 다 됐어요. 조금만 더 기다려 주세요')
                : /*
                    🔴 **더 이상 "닫지 말아 주세요"가 아니다**(2026-10-12 접수증 도입).
                       서버가 뒤에서 만들고 앱은 다시 들어와 이어받는다. 못 하게 해 놓고
                       부탁하던 것을, 할 수 있게 만든 뒤 사실대로 적는다.
                  */
                  t('{{sec}}초쯤 걸려요. 나갔다 와도 이어서 볼 수 있어요', {
                      sec: EXAM_EXPECTED_WAIT_SEC,
                    })}
            </Text>
          )}

          {/*
            무엇을 만들고 있나 (시안 #12).

            🔴 **✓ 를 차례로 켜지 않는다.** 시안은 네 단계 체크리스트인데, 서버는 단계별 진행을
               알려주지 않는다 — 시간으로 ✓ 를 켜면 그건 **모양만 다른 가짜 진행 막대**다.
               이 화면이 애초에 가짜 막대를 거부하고 경과 초를 세는 이유가 그것이다.
            → 그래서 **지금 하고 있는 일의 목록**으로 둔다. 기다림이 무엇을 사는지는 알려 주되,
              얼마나 왔는지는 **아는 척하지 않는다.**
          */}
          {!isRetry && (
            <View style={[styles.stepsBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.stepsTitle, { color: colors.textSecondary }]}>
                {t('이런 걸 만들고 있어요')}
              </Text>
              {WAIT_STEPS.map((step) => (
                <View key={step.title} style={styles.stepRow}>
                  <MaterialIcons name="circle" size={6} color={colors.primary} />
                  <View style={styles.stepTexts}>
                    <Text style={[styles.stepTitle, { color: colors.text }]}>{t(step.title)}</Text>
                    <Text style={[styles.stepSub, { color: colors.textTertiary }]}>{t(step.sub)}</Text>
                  </View>
                </View>
              ))}
            </View>
          )}

        </ScrollView>
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
        : failMessage(failure, degraded);
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <StatusBar style={colors.isDark ? 'light' : 'dark'} />
        <ScreenHeader title={t('AI 시험')} onBack={onBack} />
        <View style={styles.waitBox}>
          <MaterialIcons name="cloud-off" size={56} color={colors.textTertiary} />
          {/* ⚠ `{{total}}` 은 「다 씀」 제목에만 있다. 나머지 문구는 이 값을 그냥 무시한다 */}
          <Text style={[styles.waitTitle, { color: colors.text }]}>
            {t(message.title, { total: EXAM_FREE_QUOTA })}
          </Text>
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

      {/*
        * 나가기 확인 (2026-10-14 시안).
        *
        * 🔴 **「계속 풀기」를 `onCancel` 쪽에 둔다.** 시트를 바깥 눌러 닫거나 끌어 내리는 것도
        *    같은 자리로 떨어지기 때문이다 — 「나가기」를 거기 걸면 **실수로 시트를 닫은 사람이
        *    시험에서 나가 버린다.** 물러서는 자리에는 언제나 *아무 일도 안 일어나는 쪽*을 둔다.
        *
        * ⚠ 「나가기」를 빨간색(`danger`)으로 그리지 않는다. **아무것도 잃지 않기 때문이다** —
        *   겁주는 색은 문구(*"그대로 남아요"*)와 어긋나고, 사용자는 글자보다 색을 먼저 믿는다.
        *   그리고 나가는 길을 눈에 안 띄게 만드는 것은 전자상거래법이 말하는 「취소 방해」에
        *   가깝다(`CHANGELOG` 다크패턴 절). 그래서 **나가기가 오른쪽 주 버튼**이다.
        */}
      <ConfirmSheet
        visible={leaving}
        title={t('나중에 이어서 푸실 수 있어요')}
        // ⚠ 숫자를 넣지 않는다 — `index` 는 *보고 있던 문제*이지 *다 푼 개수*가 아니다.
        //   「5문제까지 푸신 게」라고 하면 4개를 푼 사람에게 하나를 더 풀었다고 말하는 꼴이다
        message={t('지금까지 푸신 게 그대로 남아요')}
        confirmLabel={t('나가기')}
        cancelLabel={t('계속 풀기')}
        onConfirm={leaveNow}
        onCancel={() => setLeaving(false)}
      />

      <Toast message={toast.message} type={toast.type} visible={toast.visible} onHide={hideToast} />
    </View>
  );
}

const styles = StyleSheet.create({
  // ── 기다리는 화면 (2026-10-08 시안 #12) ──
  stepsBox: { alignSelf: 'stretch', borderWidth: 1, borderRadius: 16, padding: 16, marginTop: 24 },
  stepsTitle: { fontSize: 12, fontWeight: '700', marginBottom: 10 },
  stepRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 10 },
  stepTexts: { flex: 1, marginTop: -4 },
  stepTitle: { fontSize: 14, fontWeight: '600' },
  stepSub: { fontSize: 12, marginTop: 1, lineHeight: 16 },

  container: { flex: 1 },
  /*
   * 🔴 **`flex: 1` 이 아니라 `flexGrow: 1` 이다.** ScrollView 의 contentContainer 에 `flex: 1` 을
   *    주면 내용이 화면 높이에 묶여 **넘쳐도 스크롤되지 않는다** — 1.3.2~1.6.0 동안 퀴즈 결과
   *    화면이 바로 그 상태였다(`CHANGELOG` 1.7.0 OTA). 단계 목록과 팁이 붙으면서 이 화면도
   *    길어졌으므로 같은 함정에 빠지지 않게 한다.
   * ⚠ `flexGrow` 는 **짧을 때만** 가운데로 모은다. 그게 원하는 동작이다.
   */
  waitBox: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: SPACING.xl },
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
