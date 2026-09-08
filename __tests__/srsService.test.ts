/**
 * SRS 상태 관리 검증 — 저장소를 모르는 순수 함수만 다룬다(목이 필요 없다).
 *
 * 🔴 이 파일이 지키는 가장 무거운 약속:
 *    **재생(replay)은 읽기 전용이고, 언제 돌려도 같은 답을 준다.**
 *    이게 깨지면 기존 사용자 전원의 만기가 한꺼번에 이상해진다. 크래시가 아니라
 *    "왜 이 단어가 오늘 뜨지?" 라서 아무도 신고하지 않는다.
 */

import {
  SRS_STORE_VERSION,
  applyAnswer,
  buildStore,
  forecast,
  nextDueKey,
  parseStore,
  selectDue,
  summarize,
  type HistoryEntry,
  type SrsStore,
  type WordRef,
} from '../src/services/srsService';

const TODAY = '2026-09-08';

const w = (wordId: number, categoryId = 1, createdAt = '2026-09-01T03:00:00.000Z'): WordRef => ({
  wordId,
  categoryId,
  createdAt,
});

const h = (wordId: number, isCorrect: boolean, day: string): HistoryEntry => ({
  wordId,
  isCorrect,
  takenAt: `${day}T05:00:00.000Z`,
});

describe('재생 — 이력에서 상태를 만든다', () => {
  it('이력이 없으면 상태도 없다', () => {
    const store = buildStore([w(1), w(2)], [], TODAY);
    expect(store.cards).toEqual({});
    expect(store.builtFrom).toBe(0);
    expect(store.v).toBe(SRS_STORE_VERSION);
  });

  it('한 번 맞힌 단어는 3일 뒤가 만기다', () => {
    const store = buildStore([w(1)], [h(1, true, '2026-09-01')], TODAY);
    expect(store.cards['1'].last).toBe('2026-09-01');
    expect(store.cards['1'].due).toBe('2026-09-04');
    expect(store.cards['1'].reps).toBe(1);
    expect(store.cards['1'].lapses).toBe(0);
  });

  it('만기에 다시 맞히면 만기가 더 멀어진다', () => {
    const store = buildStore(
      [w(1)],
      [h(1, true, '2026-09-01'), h(1, true, '2026-09-04')],
      TODAY,
    );
    expect(store.cards['1'].due).toBe('2026-09-15'); // 09-04 + 11일
    expect(store.cards['1'].reps).toBe(2);
  });

  it('틀리면 만기가 가까워진다', () => {
    const ok = buildStore([w(1)], [h(1, true, '2026-09-01'), h(1, true, '2026-09-04')], TODAY);
    const no = buildStore([w(1)], [h(1, true, '2026-09-01'), h(1, false, '2026-09-04')], TODAY);
    expect(no.cards['1'].due < ok.cards['1'].due).toBe(true);
    expect(no.cards['1'].lapses).toBe(1);
  });

  it('🔴 이력이 뒤죽박죽 들어와도 시간순으로 재생한다', () => {
    // 저장 순서를 믿을 수 없다. 순서가 뒤집히면 경과일이 음수가 되어 전부 같은 날 취급된다.
    const inOrder = [h(1, true, '2026-09-01'), h(1, false, '2026-09-03'), h(1, true, '2026-09-05')];
    const shuffled = [inOrder[2], inOrder[0], inOrder[1]];
    expect(buildStore([w(1)], shuffled, TODAY)).toEqual(buildStore([w(1)], inOrder, TODAY));
  });

  it('지워진 단어의 이력은 버린다', () => {
    // 남겨 두면 "복습 3개"를 눌렀는데 2개만 나온다
    const store = buildStore([w(1)], [h(1, true, '2026-09-01'), h(99, true, '2026-09-01')], TODAY);
    expect(Object.keys(store.cards)).toEqual(['1']);
  });

  it('날짜를 못 읽는 기록은 건너뛴다', () => {
    const broken: HistoryEntry = { wordId: 1, isCorrect: true, takenAt: '망가짐' };
    const store = buildStore([w(1)], [broken, h(1, true, '2026-09-01')], TODAY);
    expect(store.cards['1'].last).toBe('2026-09-01');
    expect(store.cards['1'].reps).toBe(1);
  });

  it('builtFrom 은 건너뛴 것까지 포함한 **원본 개수**다', () => {
    // 저장된 배열 길이와 비교해 어긋남을 잡는 값이라, 걸러낸 뒤 개수를 세면 영원히 어긋난다
    const history = [h(1, true, '2026-09-01'), h(99, true, '2026-09-01')];
    expect(buildStore([w(1)], history, TODAY).builtFrom).toBe(2);
  });
});

describe('🔴 불변식 — 재생은 읽기 전용이고, 언제 돌려도 같다', () => {
  const words = [w(1), w(2, 2), w(3)];
  const history = [
    h(1, true, '2026-09-01'),
    h(2, false, '2026-09-02'),
    h(1, true, '2026-09-04'),
    h(3, true, '2026-09-05'),
    h(2, true, '2026-09-06'),
  ];

  it('입력 배열을 건드리지 않는다', () => {
    // 🔴 quizResults 를 고치면 정답률·스트릭 같은 기존 통계가 함께 흔들린다.
    //    그건 이 기능이 건드릴 자리가 아니다.
    const before = JSON.parse(JSON.stringify(history));
    const wordsBefore = JSON.parse(JSON.stringify(words));
    buildStore(words, history, TODAY);
    expect(history).toEqual(before);
    expect(words).toEqual(wordsBefore);
  });

  it('🔴 오늘이 언제냐에 따라 만기가 달라지지 않는다', () => {
    // 이 성질 때문에 백업에 SRS 를 담지 않아도 된다 — 복원한 날이 언제든 같은 답이 나온다.
    const a = buildStore(words, history, '2026-09-08');
    const b = buildStore(words, history, '2027-03-15');
    expect(a).toEqual(b);
  });

  it('같은 입력을 두 번 재생하면 완전히 같다', () => {
    expect(buildStore(words, history, TODAY)).toEqual(buildStore(words, history, TODAY));
  });

  it('한 문제씩 반영한 결과와 통째로 재생한 결과가 같다', () => {
    // 🔴 둘이 어긋나면, 퀴즈를 풀며 쌓은 만기와 복원 뒤 재생한 만기가 달라진다.
    let incremental: SrsStore = { v: SRS_STORE_VERSION, builtFrom: 0, cards: {} };
    for (const entry of history) {
      const day = entry.takenAt.slice(0, 10);
      incremental = applyAnswer(incremental, entry.wordId, entry.isCorrect, day);
    }
    expect(incremental.cards).toEqual(buildStore(words, history, TODAY).cards);
    expect(incremental.builtFrom).toBe(history.length);
  });
});

describe('만기 고르기 — 순서가 정해져 있다', () => {
  const store = buildStore(
    [w(1), w(2), w(3)],
    [
      h(1, true, '2026-09-01'), // 만기 09-04 — 가장 오래 지남
      h(2, true, '2026-09-03'), // 만기 09-06
      h(3, true, '2026-09-07'), // 만기 09-10 — 아직 아님
    ],
    TODAY,
  );

  it('오래 지난 만기부터 나온다', () => {
    expect(selectDue([w(1), w(2), w(3)], store, TODAY)).toEqual([1, 2]);
  });

  it('한 번도 안 푼 단어는 만기 지난 단어 **뒤에** 온다', () => {
    // 만기 지난 단어는 지금 기억이 새고 있고, 새 단어는 아직 샐 기억이 없다
    const words = [w(1), w(2), w(3), w(4, 1, '2026-08-20T03:00:00.000Z')];
    expect(selectDue(words, store, TODAY)).toEqual([1, 2, 4]);
  });

  it('안 푼 단어끼리는 오래 방치한 것부터', () => {
    const words = [
      w(7, 1, '2026-09-05T03:00:00.000Z'),
      w(5, 1, '2026-08-01T03:00:00.000Z'),
      w(6, 1, '2026-08-15T03:00:00.000Z'),
    ];
    expect(selectDue(words, { ...store, cards: {} }, TODAY)).toEqual([5, 6, 7]);
  });

  it('같은 화면을 두 번 열어도 목록이 같다(무작위가 없다)', () => {
    const words = [w(1), w(2), w(3), w(4)];
    expect(selectDue(words, store, TODAY)).toEqual(selectDue(words, store, TODAY));
  });

  it('만기 당일도 포함한다(다음 날이 아니다)', () => {
    const one = buildStore([w(1)], [h(1, true, '2026-09-01')], TODAY);
    expect(selectDue([w(1)], one, '2026-09-03')).toEqual([]);
    expect(selectDue([w(1)], one, '2026-09-04')).toEqual([1]);
  });

  it('상태가 깨진 단어는 빠뜨리지 않고 "안 본 단어"로 본다', () => {
    const broken: SrsStore = {
      v: SRS_STORE_VERSION,
      builtFrom: 1,
      cards: { '1': { s: 5, d: 5, reps: 1, lapses: 0, last: '2026-09-01', due: '망가짐' } },
    };
    expect(selectDue([w(1)], broken, TODAY)).toEqual([1]);
  });
});

describe('요약 — 홈 배너와 카테고리 뱃지', () => {
  const words = [w(1, 1), w(2, 1), w(3, 2)];
  const store = buildStore(
    words,
    [h(1, true, '2026-09-01'), h(2, true, '2026-09-07'), h(3, true, '2026-09-01')],
    TODAY,
  );

  it('카테고리별로 센다', () => {
    const s = summarize(words, store, TODAY);
    expect(s.total).toBe(2); // 1(만기 09-04) · 3(만기 09-04). 2는 09-10 이라 아직
    expect(s.byCategory).toEqual({ 1: 1, 2: 1 });
    expect(s.nextDue).toBeNull();
  });

  it('만기가 0이면 다음 복습일을 알려 준다', () => {
    const s = summarize(words, store, '2026-09-01');
    expect(s.total).toBe(0);
    expect(s.nextDue).toBe('2026-09-04');
  });

  it('단어가 아예 없으면 다음 복습일도 없다', () => {
    const s = summarize([], { v: SRS_STORE_VERSION, builtFrom: 0, cards: {} }, TODAY);
    expect(s.total).toBe(0);
    expect(s.nextDue).toBeNull();
  });

  it('안 푼 단어가 있으면 만기가 0이 아니다', () => {
    const s = summarize([...words, w(9)], store, '2026-09-01');
    expect(s.total).toBe(1);
    expect(s.nextDue).toBeNull();
  });

  it('다음 복습일은 가장 이른 날이다', () => {
    expect(nextDueKey(words, store, '2026-09-01')).toBe('2026-09-04');
  });
});

describe('한 문제 반영', () => {
  it('맞히면 만기가 멀어지고 틀리면 오늘로 당겨진다', () => {
    const base = buildStore([w(1)], [h(1, true, '2026-09-01'), h(1, true, '2026-09-04')], TODAY);
    const ok = applyAnswer(base, 1, true, TODAY);
    const no = applyAnswer(base, 1, false, TODAY);
    expect(ok.cards['1'].due > no.cards['1'].due).toBe(true);
    expect(no.cards['1'].lapses).toBe(1);
    expect(ok.cards['1'].last).toBe(TODAY);
  });

  it('처음 보는 단어면 첫 복습으로 시작한다', () => {
    const empty: SrsStore = { v: SRS_STORE_VERSION, builtFrom: 0, cards: {} };
    const after = applyAnswer(empty, 42, true, TODAY);
    expect(after.cards['42'].reps).toBe(1);
    expect(after.cards['42'].due).toBe('2026-09-11');
  });

  it('같은 날 두 번 풀어도 만기가 최소 하루 뒤다', () => {
    const empty: SrsStore = { v: SRS_STORE_VERSION, builtFrom: 0, cards: {} };
    const once = applyAnswer(empty, 1, true, TODAY);
    const twice = applyAnswer(once, 1, true, TODAY);
    expect(twice.cards['1'].due > TODAY).toBe(true);
    expect(twice.cards['1'].reps).toBe(2);
  });

  it('원래 저장본을 고치지 않는다', () => {
    const base = buildStore([w(1)], [h(1, true, '2026-09-01')], TODAY);
    const snapshot = JSON.parse(JSON.stringify(base));
    applyAnswer(base, 1, false, TODAY);
    expect(base).toEqual(snapshot);
  });
});

describe('저장본 읽기 — 이상하면 버린다(재생이 되살린다)', () => {
  const valid: SrsStore = {
    v: SRS_STORE_VERSION,
    builtFrom: 3,
    cards: { '1': { s: 5, d: 5, reps: 2, lapses: 0, last: '2026-09-01', due: '2026-09-06' } },
  };

  it('정상 저장본을 그대로 읽는다', () => {
    expect(parseStore(JSON.stringify(valid))).toEqual(valid);
  });

  it('빈 값·깨진 JSON·다른 버전은 버린다', () => {
    expect(parseStore(null)).toBeNull();
    expect(parseStore('')).toBeNull();
    expect(parseStore('{')).toBeNull();
    expect(parseStore('[]')).toBeNull();
    expect(parseStore(JSON.stringify({ ...valid, v: 999 }))).toBeNull();
    expect(parseStore(JSON.stringify({ v: SRS_STORE_VERSION, builtFrom: 'x', cards: {} }))).toBeNull();
  });

  it('개별 카드가 깨졌으면 그 카드만 버린다', () => {
    const mixed = JSON.stringify({
      ...valid,
      cards: {
        ...valid.cards,
        '2': { s: NaN, d: 5, reps: 1, lapses: 0, last: '2026-09-01', due: '2026-09-06' },
        '3': { s: 5, d: 5, reps: 1, lapses: 0, last: '2026-09-01', due: '엉망' },
      },
    });
    const parsed = parseStore(mixed);
    expect(Object.keys(parsed!.cards)).toEqual(['1']);
  });
});

describe('알림 예보 — 그 시각에 앱이 없어도 되게 미리 굽는다', () => {
  const words = [w(1), w(2), w(3)];
  //  1 → 만기 09-04 (오늘 이미 지남)
  //  2 → 만기 09-15 (09-04 에 두 번째로 맞혀 11일)
  //  3 → 한 번도 안 품 → 언제나 만기
  const store = buildStore(
    words,
    [h(1, true, '2026-09-01'), h(2, true, '2026-09-01'), h(2, true, '2026-09-04')],
    TODAY,
  );

  it('날짜별로 하루씩, 내일부터 센다', () => {
    const plan = forecast(words, store, TODAY, 3);
    expect(plan.map((d) => d.dayKey)).toEqual(['2026-09-09', '2026-09-10', '2026-09-11']);
  });

  it('만기 수는 날이 갈수록 줄지 않는다', () => {
    // 복습을 안 하면 만기는 쌓이기만 한다. 줄어든다면 계산이 틀린 것이다.
    const plan = forecast(words, store, TODAY, 14);
    for (let i = 1; i < plan.length; i++) {
      expect(plan[i].dueIds.length).toBeGreaterThanOrEqual(plan[i - 1].dueIds.length);
    }
  });

  it('🔴 아직 만기가 아닌 단어는 그날이 되어야 들어온다', () => {
    const plan = forecast(words, store, TODAY, 8);
    // 09-15 는 오늘(09-08)로부터 7일 뒤 = plan[6]
    expect(plan[5].dueIds).not.toContain(2); // 09-14
    expect(plan[6].dueIds).toContain(2); // 09-15
  });

  it('볼 것이 하나도 없는 날은 빈 목록이다', () => {
    // 단어 하나, 오늘 막 풀어서 만기가 3일 뒤 → 내일·모레는 비어 있다
    const one = buildStore([w(1)], [h(1, true, TODAY)], TODAY);
    const plan = forecast([w(1)], one, TODAY, 4);
    expect(plan.map((d) => d.dueIds.length)).toEqual([0, 0, 1, 1]);
  });

  it('0일치를 물으면 빈 예보다', () => {
    expect(forecast(words, store, TODAY, 0)).toEqual([]);
  });
});
