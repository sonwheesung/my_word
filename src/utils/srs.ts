/**
 * 간격 반복(FSRS) **계산만** 담는다. 네이티브 모듈도 저장소도 import 하지 않는다.
 *
 * 🔴 notificationSchedule.ts 와 같은 이유로 갈라 놨다 — 이 파일의 로직은 눈으로 검증할 수단이
 *    없다(내일 뜰 단어가 맞는지는 내일이 와야 안다). 그래서 **테스트가 유일한 오라클**이고,
 *    그 테스트가 expo 목이나 AsyncStorage 목에 딸려 죽는 일이 없어야 한다.
 *
 * 모델은 FSRS 의 DSR 세 값이다:
 *   R (Retrievability) 지금 떠올릴 확률 0~1
 *   S (Stability)      R 이 0.9 로 떨어지기까지의 **일수**
 *   D (Difficulty)     그 단어의 내재적 어려움 1~10
 *
 * ⚠ 라이브러리를 쓰지 않고 직접 옮겼다. 파라미터 개인 최적화를 하지 않으므로 필요한 것은
 *   공식 몇 개뿐인데, 의존성 하나가 오픈소스 고지·번들 크기·R8 keep 규칙을 건드린다
 *   (이 프로젝트가 이미 두 번 아팠던 자리다).
 *
 * ⚠ 무작위(fuzz)를 넣지 않는다. Anki 는 복습이 한 날에 몰리지 않게 간격에 난수를 섞지만,
 *   그러면 같은 입력이 같은 출력을 주지 않아 테스트가 오라클 노릇을 못 한다.
 *   분산은 srsService 가 **단어 id 로 결정적으로** 처리한다.
 */

import { addDays } from './date';

/**
 * 채점 등급. FSRS 는 1~4(Again/Hard/Good/Easy)를 쓰지만 이 앱의 퀴즈는 **정답/오답 2단계**다.
 * 값을 1·3 으로 둔 것은 FSRS 공식을 그대로 쓰기 위해서다(2·4 는 안 나온다).
 */
export const GRADE_FORGOT = 1;
export const GRADE_RECALLED = 3;
export type Grade = typeof GRADE_FORGOT | typeof GRADE_RECALLED;

export interface SrsCard {
  /** 안정도(일). 클수록 오래 간다 */
  s: number;
  /** 난이도 1~10 */
  d: number;
  /** 복습 횟수 */
  reps: number;
  /** 잊은 횟수 */
  lapses: number;
}

/**
 * 목표 유지율. 복습 시점에 이 확률로 기억하고 있도록 간격을 잡는다.
 *
 * 설정에 노출하지 않는다 — 손잡이를 주면 "유지율"이 무엇인지 설명해야 하는데, 단어장 앱
 * 사용자에게 그 개념을 가르치는 비용이 얻는 것보다 크다. 0.9 는 FSRS 의 권장 기본값이다.
 */
export const DESIRED_RETENTION = 0.9;

/**
 * FSRS-5 기본 가중치 19개.
 *
 * 🔴 개인 최적화를 하지 않으므로 이 값이 곧 스케줄이다. 한 자리만 잘못 옮겨도 크래시 없이
 *    **간격만 조용히 이상해진다** — 그래서 아래 테스트가 첫 간격의 일수를 직접 못 박는다.
 *
 *   w0~w3  첫 복습 뒤 안정도 (Again/Hard/Good/Easy)
 *   w4,w5  첫 난이도
 *   w6,w7  난이도 갱신 · 평균 회귀
 *   w8~w10 성공 시 안정도 증가
 *   w11~14 실패 시 안정도
 *   w15,16 Hard 감점 · Easy 보너스  ← 2단계 채점이라 **쓰이지 않는다**
 *   w17,18 같은 날 재복습
 */
const W = [
  0.40255, 1.18385, 3.173, 15.69105, 7.1949, 0.5345, 1.4604, 0.0046, 1.54575,
  0.1192, 1.01925, 1.9395, 0.11, 0.29605, 2.2698, 0.2315, 2.9898, 0.51655, 0.6621,
] as const;

/** 망각곡선의 기울기. 지수함수가 아니라 **멱함수**다 — 실측 복습 로그에 더 잘 맞는다 */
const DECAY = -0.5;

/**
 * 곡선 계수. 상수로 박지 않고 정의에서 끌어낸다.
 *
 * S 의 정의가 "R 이 0.9 가 되는 시점"이므로 `R(t=S) === 0.9` 가 반드시 성립해야 한다.
 * 그 조건을 풀면 이 값이 나온다(= 19/81). 숫자를 베껴 적으면 정의와 어긋나도 알 수 없다.
 */
const FACTOR = Math.pow(0.9, 1 / DECAY) - 1;

/** 안정도 하한·상한(일). 상한은 10년 — 단어장 앱에서 그 너머는 의미가 없다 */
const MIN_STABILITY = 0.01;
const MAX_STABILITY = 3650;

const MIN_DIFFICULTY = 1;
const MAX_DIFFICULTY = 10;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * 마지막 복습에서 `elapsedDays` 일 지났을 때 떠올릴 확률.
 *
 * 저장소에서 온 값이 섞이므로 방어한다 — s 가 0 이면 0 나누기가 되어 NaN 이 새어 나가고,
 * NaN 은 비교에서 전부 false 라 **만기가 영원히 안 오는** 단어가 조용히 생긴다.
 */
export function retrievability(elapsedDays: number, stability: number): number {
  if (!Number.isFinite(elapsedDays) || !Number.isFinite(stability)) return 0;
  const s = Math.max(stability, MIN_STABILITY);
  const t = Math.max(elapsedDays, 0);
  return clamp(Math.pow(1 + (FACTOR * t) / s, DECAY), 0, 1);
}

/**
 * 안정도로부터 다음 복습까지의 간격(일).
 *
 * 정의상 유지율이 0.9 면 간격 === 안정도다. 0.9 보다 높게 잡으면 짧아지고 낮게 잡으면 길어진다.
 * 최소 1일 — 0일을 돌려주면 같은 날 무한히 다시 뜬다.
 */
export function intervalDays(stability: number, retention: number = DESIRED_RETENTION): number {
  // 🔴 clamp 는 NaN 을 그대로 통과시킨다(Math.min/max 가 그렇다). 여기서 막지 않으면 NaN 이
  //    만기 문자열까지 흘러가고, NaN 비교는 전부 false 라 그 단어는 **영영 안 뜬다.**
  //    깨진 값은 "가장 짧게" 로 본다 — 잘못 자주 보는 쪽이 영영 안 보는 쪽보다 낫다.
  const s = Number.isFinite(stability) ? clamp(stability, MIN_STABILITY, MAX_STABILITY) : MIN_STABILITY;
  const r = Number.isFinite(retention) ? clamp(retention, 0.5, 0.99) : DESIRED_RETENTION;
  const raw = (s / FACTOR) * (Math.pow(r, 1 / DECAY) - 1);
  return clamp(Math.round(raw), 1, MAX_STABILITY);
}

/** 첫 복습 직후의 난이도 */
function initialDifficulty(grade: number): number {
  return clamp(W[4] - Math.exp(W[5] * (grade - 1)) + 1, MIN_DIFFICULTY, MAX_DIFFICULTY);
}

/** 난이도 갱신. 선형 감쇠 뒤 평균으로 조금 되돌린다(한 번의 실수로 영영 어려운 단어가 되지 않게) */
function nextDifficulty(current: number, grade: number): number {
  const delta = -W[6] * (grade - 3);
  const damped = current + (delta * (10 - current)) / 9;
  const reverted = W[7] * initialDifficulty(4) + (1 - W[7]) * damped;
  return clamp(reverted, MIN_DIFFICULTY, MAX_DIFFICULTY);
}

/** 맞혔을 때의 새 안정도. 잊기 직전(R 이 낮을 때)에 맞힐수록 크게 오른다 */
function stabilityOnRecall(d: number, s: number, r: number): number {
  const gain =
    Math.exp(W[8]) * (11 - d) * Math.pow(s, -W[9]) * (Math.exp(W[10] * (1 - r)) - 1);
  return clamp(s * (1 + gain), MIN_STABILITY, MAX_STABILITY);
}

/**
 * 틀렸을 때의 새 안정도.
 *
 * `Math.min(.., s)` 가 중요하다 — 이 공식만으로는 아주 짧은 간격에서 실패했을 때 안정도가
 * **올라가는** 구간이 생긴다. 틀렸는데 다음 간격이 길어지면 사용자가 곧바로 알아본다.
 */
function stabilityOnLapse(d: number, s: number, r: number): number {
  const next =
    W[11] * Math.pow(d, -W[12]) * (Math.pow(s + 1, W[13]) - 1) * Math.exp(W[14] * (1 - r));
  return clamp(Math.min(next, s), MIN_STABILITY, MAX_STABILITY);
}

/** 같은 날 다시 풀었을 때. 하루가 안 지났으므로 망각곡선을 쓰지 않는다 */
function stabilitySameDay(s: number, grade: number): number {
  return clamp(s * Math.exp(W[17] * (grade - 3 + W[18])), MIN_STABILITY, MAX_STABILITY);
}

/** 그 단어를 처음 풀었을 때의 상태 */
export function firstReview(grade: Grade): SrsCard {
  return {
    s: clamp(W[grade - 1], MIN_STABILITY, MAX_STABILITY),
    d: initialDifficulty(grade),
    reps: 1,
    lapses: grade === GRADE_FORGOT ? 1 : 0,
  };
}

/**
 * 두 번째 이후의 복습.
 *
 * `elapsedDays` 는 **로컬 자정 기준 날짜 차이**다(시각이 아니라 날짜). 0 이면 같은 날 재복습.
 * 음수가 들어오면(기기 시계를 되돌린 경우) 0 으로 본다 — 막을 수단도 의미도 없고,
 * 그대로 계산하면 R 이 1 을 넘어 안정도가 튄다.
 */
export function nextReview(card: SrsCard, grade: Grade, elapsedDays: number): SrsCard {
  const prev = normalizeCard(card) ?? firstReview(grade);
  const elapsed = Number.isFinite(elapsedDays) ? Math.max(Math.floor(elapsedDays), 0) : 0;

  // ⚠ 순서가 있다 — 난이도를 **먼저** 갱신하고, 안정도 공식에는 그 **새 난이도**를 넣는다.
  //   FSRS 레퍼런스 구현이 그렇게 하고, 뒤집으면 한 스텝씩 밀린 스케줄이 나온다.
  const d = nextDifficulty(prev.d, grade);

  let s: number;
  if (elapsed === 0) {
    s = stabilitySameDay(prev.s, grade);
  } else {
    const r = retrievability(elapsed, prev.s);
    s = grade === GRADE_FORGOT ? stabilityOnLapse(d, prev.s, r) : stabilityOnRecall(d, prev.s, r);
  }

  return {
    s,
    d,
    reps: prev.reps + 1,
    lapses: prev.lapses + (grade === GRADE_FORGOT ? 1 : 0),
  };
}

/**
 * 저장소에서 읽은 값을 상태로 받아들일 수 있는지 검사한다.
 *
 * 백업 복원·구버전·손으로 고친 파일에서 무엇이든 올 수 있다. 여기서 걸러 내지 않으면
 * NaN 하나가 그 단어를 **영영 만기가 안 오는 상태**로 만든다(NaN 비교는 전부 false).
 */
export function normalizeCard(raw: unknown): SrsCard | null {
  if (!raw || typeof raw !== 'object') return null;
  const c = raw as Partial<SrsCard>;
  if (!Number.isFinite(c.s) || !Number.isFinite(c.d)) return null;

  return {
    s: clamp(c.s as number, MIN_STABILITY, MAX_STABILITY),
    d: clamp(c.d as number, MIN_DIFFICULTY, MAX_DIFFICULTY),
    reps: Number.isFinite(c.reps) ? Math.max(Math.floor(c.reps as number), 0) : 0,
    lapses: Number.isFinite(c.lapses) ? Math.max(Math.floor(c.lapses as number), 0) : 0,
  };
}

// ── 만기일 ────────────────────────────────────────────────────────
// 날짜 키의 정의와 산술은 utils/date.ts 에 있다 — 스트릭 집계가 이미 같은 규칙을 쓰고 있고,
// 사본을 만들면 언젠가 한쪽만 고쳐진다.

/** 복습한 날 + 간격 = 다음 만기일 */
export function dueKeyAfter(reviewedOn: string, card: SrsCard): string {
  return addDays(reviewedOn, intervalDays(card.s));
}
