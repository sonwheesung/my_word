/**
 * SRS 계산 검증.
 *
 * 🔴 이 로직에는 **눈으로 볼 수 있는 오라클이 없다.** "내일 뜰 단어가 맞는가"는 내일이 와야
 *    알고, 틀려도 크래시가 아니라 **간격만 조용히 이상해진다.** 그래서 여기서 세 겹으로 막는다:
 *
 *    ① 정의   — 모델이 스스로 모순되지 않는가 (R(t=S) 는 정확히 0.9 여야 한다)
 *    ② 성질   — 맞히면 길어지고 틀리면 짧아지는가 (부호와 방향)
 *    ③ 황금값 — 실제 일수를 못 박는다. 가중치를 한 자리 잘못 옮기면 여기서 걸린다
 */

import {
  DESIRED_RETENTION,
  GRADE_FORGOT,
  GRADE_RECALLED,
  addDays,
  dateKeyOf,
  daysBetween,
  dueKeyAfter,
  firstReview,
  intervalDays,
  nextReview,
  normalizeCard,
  retrievability,
  toDateKey,
  type SrsCard,
} from '../src/utils/srs';

describe('① 정의 — 모델이 스스로 모순되지 않는다', () => {
  it('안정도만큼 지났을 때 떠올릴 확률은 정확히 0.9 다', () => {
    // S 의 정의 그 자체다. 이게 깨지면 FACTOR 나 DECAY 를 잘못 옮긴 것이다.
    for (const s of [0.5, 1, 3.173, 10, 100, 3650]) {
      expect(retrievability(s, s)).toBeCloseTo(0.9, 10);
    }
  });

  it('유지율 0.9 로 잡으면 간격이 곧 안정도다', () => {
    expect(intervalDays(10, 0.9)).toBe(10);
    expect(intervalDays(37, 0.9)).toBe(37);
  });

  it('유지율을 올리면 간격이 짧아지고 내리면 길어진다', () => {
    expect(intervalDays(100, 0.95)).toBeLessThan(intervalDays(100, 0.9));
    expect(intervalDays(100, 0.8)).toBeGreaterThan(intervalDays(100, 0.9));
  });

  it('기본 유지율은 0.9 다', () => {
    expect(DESIRED_RETENTION).toBe(0.9);
  });

  it('시간이 지날수록 떠올릴 확률은 단조 감소한다', () => {
    let prev = 1;
    for (const t of [0, 1, 2, 5, 10, 30, 100, 1000]) {
      const r = retrievability(t, 10);
      expect(r).toBeLessThanOrEqual(prev);
      expect(r).toBeGreaterThanOrEqual(0);
      prev = r;
    }
  });

  it('막 복습한 직후에는 1 이다', () => {
    expect(retrievability(0, 5)).toBeCloseTo(1, 10);
  });
});

describe('② 성질 — 맞히면 길어지고 틀리면 짧아진다', () => {
  it('첫 복습: 맞히면 틀렸을 때보다 안정도가 크고 난이도가 낮다', () => {
    const ok = firstReview(GRADE_RECALLED);
    const no = firstReview(GRADE_FORGOT);
    expect(ok.s).toBeGreaterThan(no.s);
    expect(ok.d).toBeLessThan(no.d);
    expect(no.lapses).toBe(1);
    expect(ok.lapses).toBe(0);
    expect(ok.reps).toBe(1);
  });

  it('만기에 맞히면 안정도가 오른다', () => {
    const card = firstReview(GRADE_RECALLED);
    const after = nextReview(card, GRADE_RECALLED, intervalDays(card.s));
    expect(after.s).toBeGreaterThan(card.s);
    expect(after.reps).toBe(2);
    expect(after.lapses).toBe(0);
  });

  it('🔴 틀리면 간격이 절대 늘지 않는다', () => {
    // 공식만으로는 아주 짧은 간격에서 안정도가 올라가는 구간이 생긴다.
    // 틀렸는데 다음이 더 멀어지면 사용자가 곧바로 알아본다.
    for (const s of [0.4, 1, 3.173, 10, 50, 200, 3650]) {
      const card: SrsCard = { s, d: 5, reps: 3, lapses: 0 };
      const after = nextReview(card, GRADE_FORGOT, intervalDays(s));
      expect(after.s).toBeLessThanOrEqual(card.s);
      expect(after.lapses).toBe(1);
    }
  });

  it('오래 방치했다가 맞히면 제때 맞혔을 때보다 더 크게 오른다', () => {
    // 잊기 직전에 되살린 기억이 더 오래 간다 — 간격 반복의 전제다.
    const card: SrsCard = { s: 10, d: 5, reps: 3, lapses: 0 };
    const onTime = nextReview(card, GRADE_RECALLED, 10);
    const late = nextReview(card, GRADE_RECALLED, 60);
    expect(late.s).toBeGreaterThan(onTime.s);
  });

  it('쉬운 단어(난이도 낮음)가 어려운 단어보다 더 크게 오른다', () => {
    const easy: SrsCard = { s: 10, d: 2, reps: 3, lapses: 0 };
    const hard: SrsCard = { s: 10, d: 9, reps: 3, lapses: 0 };
    expect(nextReview(easy, GRADE_RECALLED, 10).s).toBeGreaterThan(
      nextReview(hard, GRADE_RECALLED, 10).s,
    );
  });

  it('난이도는 틀리면 오르고 맞히면 내린다 · 1~10 을 벗어나지 않는다', () => {
    let card: SrsCard = { s: 5, d: 5, reps: 1, lapses: 0 };
    expect(nextReview(card, GRADE_FORGOT, 5).d).toBeGreaterThan(card.d);
    expect(nextReview(card, GRADE_RECALLED, 5).d).toBeLessThanOrEqual(card.d);

    // 계속 틀려도 10 을 넘지 않는다
    card = { s: 5, d: 5, reps: 1, lapses: 0 };
    for (let i = 0; i < 50; i++) card = nextReview(card, GRADE_FORGOT, 1);
    expect(card.d).toBeLessThanOrEqual(10);
    expect(card.d).toBeGreaterThanOrEqual(1);

    // 계속 맞혀도 1 밑으로 안 내려간다
    card = { s: 5, d: 5, reps: 1, lapses: 0 };
    for (let i = 0; i < 50; i++) card = nextReview(card, GRADE_RECALLED, intervalDays(card.s));
    expect(card.d).toBeGreaterThanOrEqual(1);
  });

  it('안정도는 상한 10년을 넘지 않는다', () => {
    let card = firstReview(GRADE_RECALLED);
    for (let i = 0; i < 200; i++) card = nextReview(card, GRADE_RECALLED, intervalDays(card.s));
    expect(card.s).toBeLessThanOrEqual(3650);
    expect(intervalDays(card.s)).toBeLessThanOrEqual(3650);
  });

  it('같은 날 다시 풀면 맞히면 오르고 틀리면 내린다', () => {
    const card: SrsCard = { s: 10, d: 5, reps: 1, lapses: 0 };
    expect(nextReview(card, GRADE_RECALLED, 0).s).toBeGreaterThan(card.s);
    expect(nextReview(card, GRADE_FORGOT, 0).s).toBeLessThan(card.s);
  });

  it('같은 입력은 언제나 같은 출력을 준다(무작위를 섞지 않는다)', () => {
    const card: SrsCard = { s: 12.5, d: 6.1, reps: 4, lapses: 1 };
    const a = nextReview(card, GRADE_RECALLED, 13);
    const b = nextReview(card, GRADE_RECALLED, 13);
    expect(a).toEqual(b);
  });

  it('간격은 최소 1일이다', () => {
    // 0 을 돌려주면 같은 날 무한히 다시 뜬다
    expect(intervalDays(0.001)).toBe(1);
    expect(intervalDays(firstReview(GRADE_FORGOT).s)).toBe(1);
  });
});

describe('③ 황금값 — 가중치를 잘못 옮기면 여기서 걸린다', () => {
  it('첫 복습 간격: 맞히면 3일, 틀리면 1일', () => {
    expect(intervalDays(firstReview(GRADE_RECALLED).s)).toBe(3);
    expect(intervalDays(firstReview(GRADE_FORGOT).s)).toBe(1);
  });

  it('첫 난이도가 FSRS 기본값과 같다', () => {
    expect(firstReview(GRADE_RECALLED).d).toBeCloseTo(5.282, 3);
    expect(firstReview(GRADE_FORGOT).d).toBeCloseTo(7.195, 3);
  });

  it('🔴 계속 맞히는 사람의 간격 수열이 고정된다', () => {
    // 만기마다 정확히 복습하고 전부 맞히는 경우. 이 수열이 바뀌었다면 공식이나 가중치가 바뀐 것이다.
    let card = firstReview(GRADE_RECALLED);
    const seq: number[] = [intervalDays(card.s)];
    for (let i = 0; i < 6; i++) {
      card = nextReview(card, GRADE_RECALLED, intervalDays(card.s));
      seq.push(intervalDays(card.s));
    }
    expect(seq).toEqual(GOLDEN_ALL_CORRECT);
  });

  it('🔴 한 번 틀린 뒤의 간격 수열이 고정된다', () => {
    let card = firstReview(GRADE_RECALLED);
    card = nextReview(card, GRADE_RECALLED, intervalDays(card.s)); // 맞힘
    card = nextReview(card, GRADE_FORGOT, intervalDays(card.s)); // 틀림
    const seq: number[] = [intervalDays(card.s)];
    for (let i = 0; i < 3; i++) {
      card = nextReview(card, GRADE_RECALLED, intervalDays(card.s));
      seq.push(intervalDays(card.s));
    }
    expect(seq).toEqual(GOLDEN_AFTER_LAPSE);
  });
});

describe('방어 — 저장소에서 무엇이 와도 만기가 멈추지 않는다', () => {
  it('NaN·문자열·null 이 섞인 상태를 거른다', () => {
    expect(normalizeCard(null)).toBeNull();
    expect(normalizeCard('{}')).toBeNull();
    expect(normalizeCard({})).toBeNull();
    expect(normalizeCard({ s: NaN, d: 5 })).toBeNull();
    expect(normalizeCard({ s: 5, d: Infinity })).toBeNull();
  });

  it('범위를 벗어난 값은 잘라서 받아들인다', () => {
    const c = normalizeCard({ s: 99999, d: 42, reps: -3, lapses: 1.7 });
    expect(c).toEqual({ s: 3650, d: 10, reps: 0, lapses: 1 });
  });

  it('🔴 NaN 이 계산에 새어 들어가도 결과가 NaN 이 되지 않는다', () => {
    // NaN 은 모든 비교에서 false 라, 새어 나가면 그 단어는 **영영 만기가 안 온다**
    const broken = { s: NaN, d: NaN, reps: 0, lapses: 0 } as SrsCard;
    const after = nextReview(broken, GRADE_RECALLED, 5);
    expect(Number.isFinite(after.s)).toBe(true);
    expect(Number.isFinite(after.d)).toBe(true);
    expect(Number.isFinite(retrievability(NaN, 10))).toBe(true);
    expect(Number.isFinite(intervalDays(NaN))).toBe(true);
  });

  it('기기 시계를 되돌려 경과일이 음수여도 같은 날로 본다', () => {
    const card: SrsCard = { s: 10, d: 5, reps: 2, lapses: 0 };
    expect(nextReview(card, GRADE_RECALLED, -30)).toEqual(nextReview(card, GRADE_RECALLED, 0));
  });
});

describe('날짜 — 로컬 자정 기준', () => {
  it('로컬 날짜를 쓴다(UTC 가 아니다)', () => {
    // 로컬 23시 30분은 아직 그날이다. toISOString() 을 쓰면 하루가 밀린다.
    const late = new Date(2026, 8, 8, 23, 30);
    expect(toDateKey(late)).toBe('2026-09-08');
    const early = new Date(2026, 8, 8, 0, 15);
    expect(toDateKey(early)).toBe('2026-09-08');
  });

  it('한 자리 월·일을 0 으로 채운다', () => {
    expect(toDateKey(new Date(2026, 0, 5, 12))).toBe('2026-01-05');
  });

  it('깨진 ISO 는 null 이다', () => {
    expect(dateKeyOf('nope')).toBeNull();
    expect(dateKeyOf('')).toBeNull();
    expect(dateKeyOf('2026-09-08T03:00:00.000Z')).not.toBeNull();
  });

  it('일수 차이를 센다', () => {
    expect(daysBetween('2026-09-01', '2026-09-08')).toBe(7);
    expect(daysBetween('2026-09-08', '2026-09-08')).toBe(0);
    expect(daysBetween('2026-09-08', '2026-09-01')).toBe(-7);
  });

  it('월·연·윤년 경계를 넘는다', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29'); // 2028 은 윤년
    expect(addDays('2027-02-28', 1)).toBe('2027-03-01');
    expect(daysBetween('2026-12-25', '2027-01-05')).toBe(11);
  });

  it('형식이 깨지면 원본을 그대로 돌려준다(예외를 던지지 않는다)', () => {
    expect(addDays('망가짐', 3)).toBe('망가짐');
    expect(daysBetween('망가짐', '2026-09-08')).toBe(0);
  });

  it('만기일은 복습한 날 + 간격이다', () => {
    const card = firstReview(GRADE_RECALLED);
    expect(dueKeyAfter('2026-09-08', card)).toBe('2026-09-11'); // +3일
  });

  it('사전순 비교가 곧 날짜 비교다(만기 판정에 쓴다)', () => {
    expect('2026-09-08' <= '2026-09-08').toBe(true);
    expect('2026-09-07' <= '2026-09-08').toBe(true);
    expect('2026-10-01' <= '2026-09-08').toBe(false);
    expect('2026-09-09' <= '2026-09-10').toBe(true);
  });
});

// 아래 두 수열은 구현이 만들어 낸 값을 **눈으로 확인한 뒤** 못 박은 것이다.
// 바뀌었다면 공식·가중치가 바뀐 것이므로, 고치기 전에 왜 바뀌었는지부터 설명할 수 있어야 한다.
const GOLDEN_ALL_CORRECT: number[] = [3, 11, 35, 101, 270, 672, 1571];
const GOLDEN_AFTER_LAPSE: number[] = [2, 6, 16, 41];
