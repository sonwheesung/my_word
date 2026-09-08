/**
 * 간격 반복의 **상태 관리**. 계산 자체는 utils/srs.ts 에 있다.
 *
 * 🔴 이 파일의 핵심 규칙: **SRS 상태는 파생값이다.**
 *    `s·d·만기`는 전부 `words + quizResults` 에서 다시 만들어 낼 수 있다. 그래서
 *      · 백업에 담지 않는다 — 담으면 백업의 만기와 재생의 만기가 어긋날 수 있고, 얻는 정보가 0이다
 *        (이 앱이 통계를 저장하지 않고 매번 파생하는 것과 같은 이유다)
 *      · 저장본이 이력과 어긋나면 **말없이 다시 만든다**(복원 직후·구버전·손상)
 *    저장하는 이유는 오직 속도다. 진실은 언제나 quizResults 쪽에 있다.
 */

import {
  GRADE_FORGOT,
  GRADE_RECALLED,
  dueKeyAfter,
  firstReview,
  nextReview,
  normalizeCard,
  type Grade,
  type SrsCard,
} from '../utils/srs';
import { daysBetween, formatLocalDate, isDateKey, toLocalDateKey } from '../utils/date';
import { SRS_KEY } from '../constants/appConfig';
import { quizResultStorage, wordStorage, readRaw, writeRaw } from '../utils/storage';

/** 저장 형식 버전. 계산식이 바뀌어 기존 저장본을 못 믿게 되면 올린다(그러면 전부 재생된다) */
export const SRS_STORE_VERSION = 1;

export interface SrsEntry extends SrsCard {
  /** 마지막으로 푼 날 'YYYY-MM-DD' */
  last: string;
  /** 다음에 볼 날 'YYYY-MM-DD' */
  due: string;
}

export interface SrsStore {
  v: number;
  /**
   * 이 저장본을 만들 때 소비한 퀴즈 결과 개수.
   *
   * 🔴 이 한 값이 자가 치유의 전부다. 실제 결과 개수와 다르면 그 사이에 우리가 모르는 일이
   *    있었다는 뜻이므로(백업 복원이 대표적) 통째로 다시 만든다.
   */
  builtFrom: number;
  /** wordId(문자열) → 상태. **한 번도 안 푼 단어는 여기 없다** — 없으면 곧 만기다 */
  cards: Record<string, SrsEntry>;
}

/** 계산에 필요한 최소한의 단어 정보 */
export interface WordRef {
  wordId: number;
  categoryId: number;
  createdAt: string;
}

/** 계산에 필요한 최소한의 퀴즈 이력 */
export interface HistoryEntry {
  wordId: number;
  isCorrect: boolean;
  takenAt: string;
}

export interface DueSummary {
  /** 오늘 볼 단어 수(한 번도 안 푼 단어 포함) */
  total: number;
  /** 카테고리별 만기 수 */
  byCategory: Record<number, number>;
  /** 만기가 0일 때 다음으로 볼 날. 볼 것이 하나도 없으면 null */
  nextDue: string | null;
}

const emptyStore = (): SrsStore => ({ v: SRS_STORE_VERSION, builtFrom: 0, cards: {} });

function gradeOf(isCorrect: boolean): Grade {
  return isCorrect ? GRADE_RECALLED : GRADE_FORGOT;
}

// ── 순수 계산 (저장소를 모른다 — 테스트가 목 없이 돈다) ─────────────────

/**
 * 퀴즈 이력을 처음부터 재생해서 상태를 만든다.
 *
 * ⚠ 읽기 전용이다. `quizResults` 를 고치지 않는다 — 고치는 순간 정답률·스트릭 같은
 *   기존 통계가 함께 흔들리고, 그건 이 기능이 건드릴 자리가 아니다.
 *
 * ⚠ 없어진 단어의 이력은 버린다. 단어를 지웠는데 만기 수에 남아 있으면
 *   "복습 3개"를 눌렀는데 2개만 나오는 상태가 된다.
 */
export function buildStore(words: WordRef[], history: HistoryEntry[], _todayKey: string): SrsStore {
  const alive = new Set(words.map((w) => w.wordId));

  // 시간순으로 재생해야 한다 — 순서가 뒤집히면 경과일이 음수가 되어 전부 같은 날 취급된다.
  // takenAt 은 ISO 문자열이라 사전순 정렬이 곧 시간순이다.
  const ordered = history
    .filter((h) => alive.has(h.wordId) && typeof h.takenAt === 'string')
    .slice()
    .sort((a, b) => (a.takenAt < b.takenAt ? -1 : a.takenAt > b.takenAt ? 1 : 0));

  const cards: Record<string, SrsEntry> = {};
  for (const h of ordered) {
    const key = toLocalDateKey(h.takenAt);
    // 날짜를 못 읽는 기록은 건너뛴다. 여기서 통과시키면 깨진 만기가 저장소에 남는다.
    if (!isDateKey(key)) continue;

    const id = String(h.wordId);
    const prev = cards[id];
    const grade = gradeOf(h.isCorrect);

    const card: SrsCard = prev
      ? nextReview(prev, grade, daysBetween(prev.last, key))
      : firstReview(grade);

    cards[id] = { ...card, last: key, due: dueKeyAfter(key, card) };
  }

  return { v: SRS_STORE_VERSION, builtFrom: history.length, cards };
}

/** 방금 푼 한 문제를 반영한다. 저장본을 갈아치우지 않고 새 객체를 만든다 */
export function applyAnswer(
  store: SrsStore,
  wordId: number,
  isCorrect: boolean,
  todayKey: string,
): SrsStore {
  const id = String(wordId);
  const prev = normalizeCard(store.cards[id]);
  const grade = gradeOf(isCorrect);
  const last = store.cards[id]?.last;

  const card: SrsCard =
    prev && isDateKey(last)
      ? nextReview(prev, grade, daysBetween(last as string, todayKey))
      : firstReview(grade);

  return {
    ...store,
    builtFrom: store.builtFrom + 1,
    cards: { ...store.cards, [id]: { ...card, last: todayKey, due: dueKeyAfter(todayKey, card) } },
  };
}

/**
 * 오늘 볼 단어를 **우선순위 순으로** 고른다.
 *
 * 1. 만기가 지난 단어 — 오래 지난 것부터. 지금 이 순간 기억이 새고 있는 쪽이다
 * 2. 한 번도 안 푼 단어 — 오래 방치한 것부터
 *
 * 순서가 정해져 있는 것이 중요하다. 무작위로 섞으면 같은 화면을 두 번 열었을 때 목록이
 * 달라져서 "아까 그 단어 어디 갔지"가 된다.
 */
export function selectDue(words: WordRef[], store: SrsStore, todayKey: string): number[] {
  const overdue: Array<{ id: number; due: string }> = [];
  const fresh: Array<{ id: number; created: string }> = [];

  for (const w of words) {
    const entry = store.cards[String(w.wordId)];
    if (!entry || !isDateKey(entry.due)) {
      // 상태가 없거나 깨졌으면 "아직 안 본 단어"로 본다 — 빠뜨리는 것보다 낫다
      fresh.push({ id: w.wordId, created: w.createdAt ?? '' });
      continue;
    }
    if (entry.due <= todayKey) overdue.push({ id: w.wordId, due: entry.due });
  }

  overdue.sort((a, b) => (a.due < b.due ? -1 : a.due > b.due ? 1 : a.id - b.id));
  fresh.sort((a, b) => (a.created < b.created ? -1 : a.created > b.created ? 1 : a.id - b.id));

  return [...overdue.map((o) => o.id), ...fresh.map((f) => f.id)];
}

/** 만기가 0일 때 보여 줄 "다음 복습일". 볼 것이 아예 없으면 null */
export function nextDueKey(words: WordRef[], store: SrsStore, todayKey: string): string | null {
  let soonest: string | null = null;
  for (const w of words) {
    const entry = store.cards[String(w.wordId)];
    if (!entry || !isDateKey(entry.due) || entry.due <= todayKey) continue;
    if (soonest === null || entry.due < soonest) soonest = entry.due;
  }
  return soonest;
}

/** 만기 요약 — 홈 배너와 카테고리 뱃지가 함께 쓴다 */
export function summarize(words: WordRef[], store: SrsStore, todayKey: string): DueSummary {
  const dueIds = new Set(selectDue(words, store, todayKey));
  const byCategory: Record<number, number> = {};
  for (const w of words) {
    if (!dueIds.has(w.wordId)) continue;
    byCategory[w.categoryId] = (byCategory[w.categoryId] ?? 0) + 1;
  }
  return {
    total: dueIds.size,
    byCategory,
    nextDue: dueIds.size === 0 ? nextDueKey(words, store, todayKey) : null,
  };
}

/** 저장소에서 읽은 것을 저장본으로 받아들일 수 있는지. 조금이라도 이상하면 null → 재생된다 */
export function parseStore(raw: string | null): SrsStore | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<SrsStore>;
    if (!parsed || typeof parsed !== 'object') return null;
    if (parsed.v !== SRS_STORE_VERSION) return null;
    if (!Number.isFinite(parsed.builtFrom)) return null;
    if (!parsed.cards || typeof parsed.cards !== 'object') return null;

    const cards: Record<string, SrsEntry> = {};
    for (const [id, value] of Object.entries(parsed.cards)) {
      const card = normalizeCard(value);
      const v = value as Partial<SrsEntry>;
      if (!card || !isDateKey(v.last) || !isDateKey(v.due)) continue;
      cards[id] = { ...card, last: v.last as string, due: v.due as string };
    }
    return { v: SRS_STORE_VERSION, builtFrom: Math.max(Math.floor(parsed.builtFrom as number), 0), cards };
  } catch {
    return null;
  }
}

// ── 저장소를 쓰는 부분 ───────────────────────────────────────────────

function todayOf(now?: Date): string {
  return formatLocalDate(now ?? new Date());
}

async function loadWords(): Promise<WordRef[]> {
  const words = await wordStorage.getAll();
  return words.map((w) => ({ wordId: w.wordId, categoryId: w.categoryId, createdAt: w.createdAt }));
}

/**
 * 저장본을 읽되, 이력과 어긋나면 다시 만든다.
 *
 * 🔴 부팅 경로에서 부르지 않는다. 홈 배너가 처음 물을 때 계산한다 —
 *    시작을 막는 계산은 이 앱에서 만들지 않는다.
 */
async function loadStore(todayKey: string): Promise<{ store: SrsStore; words: WordRef[] }> {
  const [words, results, raw] = await Promise.all([
    loadWords(),
    quizResultStorage.getAll(),
    readRaw(SRS_KEY),
  ]);

  const saved = parseStore(raw);
  if (saved && saved.builtFrom === results.length) {
    return { store: saved, words };
  }

  // 저장본이 없거나 이력과 어긋난다(복원·구버전·손상) → 통째로 다시 만든다
  const rebuilt = buildStore(words, results as HistoryEntry[], todayKey);
  await persist(rebuilt);
  return { store: rebuilt, words };
}

async function persist(store: SrsStore): Promise<void> {
  try {
    await writeRaw(SRS_KEY, JSON.stringify(store));
  } catch {
    // 저장에 실패해도 화면을 막지 않는다. 다음에 다시 만들면 된다(파생값이라 잃을 것이 없다)
  }
}

export const srsService = {
  /** 홈 배너·카테고리 뱃지가 쓰는 요약 */
  async getDueSummary(now?: Date): Promise<DueSummary> {
    try {
      const todayKey = todayOf(now);
      const { store, words } = await loadStore(todayKey);
      return summarize(words, store, todayKey);
    } catch {
      // 만기를 못 세도 홈은 떠야 한다
      return { total: 0, byCategory: {}, nextDue: null };
    }
  },

  /**
   * 복습 퀴즈에 낼 단어 id. `categoryId` 를 주면 그 안에서만 고른다.
   * 홈 배너는 전 카테고리 횡단이라 인자 없이 부르고, 퀴즈 설정의 `복습할 단어` 모드는 넘긴다.
   */
  async getDueWordIds(limit: number, categoryId?: number, now?: Date): Promise<number[]> {
    if (limit <= 0) return [];
    try {
      const todayKey = todayOf(now);
      const { store, words } = await loadStore(todayKey);
      const scope = categoryId === undefined ? words : words.filter((w) => w.categoryId === categoryId);
      return selectDue(scope, store, todayKey).slice(0, limit);
    } catch {
      return [];
    }
  },

  /**
   * 퀴즈 한 판의 채점 결과를 반영한다.
   *
   * ⚠ quizService.saveQuizResults 가 끝난 **뒤에** 부른다. 순서가 뒤집히면 결과 개수와
   *   builtFrom 이 어긋나 다음 조회 때 통째로 재생된다(틀리지는 않지만 헛일이다).
   */
  async recordAnswers(
    answers: Array<{ wordId: number; isCorrect: boolean }>,
    now?: Date,
  ): Promise<void> {
    if (answers.length === 0) return;
    try {
      const todayKey = todayOf(now);
      const { store } = await loadStore(todayKey);
      let next = store;
      for (const a of answers) {
        next = applyAnswer(next, a.wordId, a.isCorrect, todayKey);
      }
      await persist(next);
    } catch {
      // 반영에 실패해도 퀴즈 결과 자체는 이미 저장됐다. 다음 조회 때 재생되어 따라잡는다
    }
  },

  /** 저장본을 버린다. 다음 조회 때 이력에서 다시 만들어진다 */
  async invalidate(): Promise<void> {
    try {
      await writeRaw(SRS_KEY, '');
    } catch {
      // 무시 — 어긋나면 어차피 재생된다
    }
  },
};
