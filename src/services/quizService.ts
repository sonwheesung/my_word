import i18n from '../i18n';
import { quizResultStorage, wordStorage, categoryStorage, readRaw, writeRaw } from '../utils/storage';
import { QUIZ_PREFS_KEY } from '../constants/appConfig';
import { formatLocalDate, toLocalDateKey } from '../utils/date';

export interface QuizResult {
  wordId: number;
  isCorrect: boolean;
  quizType: string;
  answerType?: string; // 'subjective' | 'multiple_choice'
  word?: string;
  correctAnswer?: string;
  userAnswer?: string;
}

export interface QuizStatistics {
  totalQuizCount: number;
  correctCount: number;
  incorrectCount: number;
  accuracy: number;
  totalWordCount: number;
  totalCategoryCount: number;
  weakWordCount: number;
}

export interface WordQuizStats {
  wordId: number;
  word: string;
  categoryId: number;
  totalCount: number;
  correctCount: number;
  incorrectCount: number;
  accuracy: number;
}

export interface CategoryQuizStats {
  categoryId: number;
  categoryName: string;
  wordCount: number;
  quizCount: number;
  correctCount: number;
  incorrectCount: number;
  accuracy: number;
  weakWordCount: number;
}

export interface DailyActivity {
  date: string;
  wordCount: number;
  quizCount: number;
}

/** 알림 문구에 넣을 단어 한 개. 화면에 쓰는 값이 아니라 **알림 본문에 그대로 들어갈 문자열**이다 */

export interface MyPageStats {
  totalWordCount: number;
  totalQuizCount: number;
  streakDays: number;
  totalActiveDays: number;
  activities: DailyActivity[];
}

function calculateStreak(activities: DailyActivity[]): number {
  if (activities.length === 0) return 0;

  const activeDates = new Set(activities.map((a) => a.date));
  const today = new Date();
  const todayStr = formatLocalDate(today);

  const checkDate = new Date(today);

  if (!activeDates.has(todayStr)) {
    checkDate.setDate(checkDate.getDate() - 1);
    const yesterdayStr = formatLocalDate(checkDate);
    if (!activeDates.has(yesterdayStr)) {
      return 0;
    }
  }

  let streak = 0;
  while (true) {
    const dateStr = formatLocalDate(checkDate);
    if (activeDates.has(dateStr)) {
      streak++;
      checkDate.setDate(checkDate.getDate() - 1);
    } else {
      break;
    }
  }
  return streak;
}

/**
 * **주어진 id 순서대로** 단어를 세운다. 순수 함수다.
 *
 * 🔴 **2026-10-08 결함에서 나왔다.** `QuizScreen` 이 넘겨받은 목록을
 *    `words.filter((w) => ids.includes(w.wordId))` 로 걸렀다. 그러면 **고르기는 맞고 순서는
 *    저장소 순서**가 된다 — 넘긴 쪽이 정한 순서가 조용히 버려진다. 크래시도 경고도 없다.
 *
 *    버려진 순서가 셋이었다:
 * ```
 * 홈 복습 배너   만기순(가장 오래 밀린 것부터)   ← 약속이 안 지켜지고 있었다
 * 플래시카드     방금 본 카드 순서(섞기·만기순)
 * 오답 재도전    틀린 순서
 * ```
 *
 * ⚠ 없는 id 는 조용히 건너뛴다. 지운 단어를 가리키는 목록이 들어와도 퀴즈가 멈추면 안 된다.
 * ⚠ 같은 id 가 두 번 오면 한 번만 세운다 — 같은 단어를 연달아 두 번 묻지 않는다.
 */
export function orderByIds<T extends { wordId: number }>(items: readonly T[], ids: readonly number[]): T[] {
  const byId = new Map<number, T>();
  for (const item of items) byId.set(item.wordId, item);
  const out: T[] = [];
  const taken = new Set<number>();
  for (const id of ids) {
    if (taken.has(id)) continue;
    const found = byId.get(id);
    if (found === undefined) continue;
    taken.add(id);
    out.push(found);
  }
  return out;
}

/**
 * 틀린 **단어**의 id. 순수 함수다.
 *
 * 🔴 **이 함수의 값은 "지금 틀린 것을 고쳤다" 가 아니다. 중복을 막아 둔 것이다.**
 *
 *    결과 화면은 `결과 건수`로 라벨을 그리고 App 은 `new Set` 으로 **단어 수**를 넘겼다 —
 *    같은 수를 **두 곳이 서로 다른 방법으로** 세고 있었다. 한 함수로 묶어 갈라질 수 없게 했다.
 *
 * ~~`mixed` 에서 한 단어를 두 번 틀리면 "3개" 라 해놓고 2문제가 나온다~~
 * ⚠ **2026-10-08 에 정정했다. 그 증상은 지금 일어날 수 없다.**
 *    `QuizScreen` 이 `selectedWords.map(...)` 으로 **한 단어에 문제 하나**만 만들고
 *    (`mixed` 도 유형만 무작위로 고를 뿐이다), `selectedWords` 에 중복이 없다.
 *    그래서 두 수는 **항상 같다.** 처음에 "갈라진다" 고 적은 것은 코드 모양만 보고
 *    실제로 갈라지는 경로가 있는지 재지 않은 추정이었다.
 *
 *    🔴 **그래도 묶는 쪽이 맞다** — 한 단어에 문제를 둘 이상 내는 날이 오면
 *    그날 조용히 갈라지고, 그 변경을 하는 사람은 이 라벨을 떠올리지 않는다.
 *
 * ⚠ 처음 틀린 순서를 지킨다 — `orderByIds` 가 그 순서로 문제를 낸다.
 */
export function wrongWordIds(results: readonly { wordId: number; isCorrect: boolean }[]): number[] {
  const out: number[] = [];
  const seen = new Set<number>();
  for (const r of results) {
    if (r.isCorrect || seen.has(r.wordId)) continue;
    seen.add(r.wordId);
    out.push(r.wordId);
  }
  return out;
}

/**
 * 지난 퀴즈 설정 (2026-10-08 시안 #8).
 *
 * 🔴 **예전에는 일부러 기억하지 않았다.** 설계 문서에 *"지난 선택은 기억하지 않는다"* 로
 *    적혀 있었다. 시안 #8 이 「지난 설정 그대로」 카드로 뒤집었다 — 같은 설정으로 반복하는 것이
 *    보통이라 매번 다시 고르게 하는 쪽이 번거롭다.
 */
/*
 * ⚠ 같은 유니온이 `QuizSetupScreen`·`QuizScreen` 에도 있다. **가져오지 않고 여기 다시 적는다** —
 *   서비스가 화면을 import 하면 층이 뒤집힌다. 문자열 유니온이라 TS 가 **같은 타입으로 본다**
 *   (구조적 타이핑). 값이 늘면 세 곳을 같이 고쳐야 하고, `parseQuizPrefs` 가 모르는 값을
 *   버리므로 빠뜨려도 **조용히 틀리지는 않는다**(지난 설정이 없는 것으로 읽힌다).
 */
export type QuizMode = 'random' | 'recent' | 'weak' | 'mixed' | 'review';
export type QuizDirection = 'word_to_meaning' | 'meaning_to_word';
export type QuizAnswerType = 'subjective' | 'multiple_choice';

export interface QuizPrefs {
  categoryId: number | null;
  mode: QuizMode;
  direction: QuizDirection;
  answerType: QuizAnswerType;
  wordCount: number;
}

const QUIZ_MODES: QuizMode[] = ['random', 'recent', 'weak', 'mixed', 'review'];
const QUIZ_DIRECTIONS: QuizDirection[] = ['word_to_meaning', 'meaning_to_word'];
const QUIZ_ANSWER_TYPES: QuizAnswerType[] = ['subjective', 'multiple_choice'];

/**
 * 🔴 **어떤 입력에도 던지지 않는다.** 설정 하나가 깨졌다고 퀴즈를 못 치면 안 된다.
 *
 * ⚠ **모르는 값은 버린다.** 저장본이 오염되면 `mode` 에 없는 모드가 들어올 수 있고,
 *   그대로 쓰면 `QuizScreen` 의 분기를 전부 빠져나가 **문제가 0개인 퀴즈**가 된다.
 * ⚠ `null` 을 주면 부르는 쪽이 *"지난 설정이 없다"* 로 읽는다 — 기본값과 구별해야
 *   「지난 설정 그대로」 카드를 띄울지 정할 수 있다.
 */
export function parseQuizPrefs(raw: string | null): QuizPrefs | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const o = parsed as Record<string, unknown>;
  const mode = QUIZ_MODES.find((m) => m === o.mode);
  const direction = QUIZ_DIRECTIONS.find((d) => d === o.direction);
  const answerType = QUIZ_ANSWER_TYPES.find((a) => a === o.answerType);
  if (mode === undefined || direction === undefined || answerType === undefined) return null;
  const wordCount = typeof o.wordCount === 'number' && Number.isFinite(o.wordCount) && o.wordCount > 0
    ? Math.floor(o.wordCount)
    : null;
  if (wordCount === null) return null;
  const categoryId = typeof o.categoryId === 'number' && Number.isFinite(o.categoryId)
    ? o.categoryId
    : null;
  return { categoryId, mode, direction, answerType, wordCount };
}

export const quizService = {
  /** 지난 설정. 없거나 깨졌으면 `null` — 그때는 「지난 설정 그대로」 카드를 안 띄운다 */
  async loadQuizPrefs(): Promise<QuizPrefs | null> {
    try {
      return parseQuizPrefs(await readRaw(QUIZ_PREFS_KEY));
    } catch {
      return null;
    }
  },

  /** ⚠ 저장 실패는 삼킨다. 설정을 못 적었다고 퀴즈를 못 시작하면 안 된다 */
  async saveQuizPrefs(prefs: QuizPrefs): Promise<void> {
    try {
      await writeRaw(QUIZ_PREFS_KEY, JSON.stringify(prefs));
    } catch {
      // 다음 판에서 다시 적힌다
    }
  },

  async saveQuizResults(results: QuizResult[]): Promise<void> {
    await quizResultStorage.saveResults(results);
  },

  async getWeakWordIds(limit: number = 20): Promise<number[]> {
    const allResults = await quizResultStorage.getAll();
    const wordStatsMap = new Map<number, { correct: number; total: number }>();
    for (const r of allResults) {
      const stats = wordStatsMap.get(r.wordId) || { correct: 0, total: 0 };
      stats.total++;
      if (r.isCorrect) stats.correct++;
      wordStatsMap.set(r.wordId, stats);
    }

    const weakWords: Array<{ wordId: number; accuracy: number }> = [];
    wordStatsMap.forEach((stats, wordId) => {
      const accuracy = (stats.correct / stats.total) * 100;
      if (accuracy < 50) {
        weakWords.push({ wordId, accuracy });
      }
    });

    weakWords.sort((a, b) => a.accuracy - b.accuracy);
    return weakWords.slice(0, limit).map((w) => w.wordId);
  },

  async getStatistics(): Promise<QuizStatistics> {
    const allResults = await quizResultStorage.getAll();
    const allWords = await wordStorage.getAll();
    const allCategories = await categoryStorage.getAll();

    const totalQuizCount = allResults.length;
    const correctCount = allResults.filter((r) => r.isCorrect).length;
    const incorrectCount = totalQuizCount - correctCount;
    const accuracy = totalQuizCount > 0 ? (correctCount / totalQuizCount) * 100 : 0;

    const wordStatsMap = new Map<number, { correct: number; total: number }>();
    for (const r of allResults) {
      const stats = wordStatsMap.get(r.wordId) || { correct: 0, total: 0 };
      stats.total++;
      if (r.isCorrect) stats.correct++;
      wordStatsMap.set(r.wordId, stats);
    }
    let weakWordCount = 0;
    wordStatsMap.forEach((stats) => {
      if ((stats.correct / stats.total) * 100 < 50) weakWordCount++;
    });

    return {
      totalQuizCount,
      correctCount,
      incorrectCount,
      accuracy,
      totalWordCount: allWords.length,
      totalCategoryCount: allCategories.length,
      weakWordCount,
    };
  },

  async getWordQuizStats(filterCategoryId?: number): Promise<WordQuizStats[]> {
    const allResults = await quizResultStorage.getAll();
    const allWords = await wordStorage.getAll();

    const wordMap = new Map<number, { word: string; categoryId: number }>();
    for (const w of allWords) {
      wordMap.set(w.wordId, { word: w.word, categoryId: w.categoryId });
    }

    const statsMap = new Map<number, { correct: number; total: number }>();
    for (const r of allResults) {
      if (filterCategoryId != null) {
        const wordInfo = wordMap.get(r.wordId);
        if (!wordInfo || wordInfo.categoryId !== filterCategoryId) continue;
      }
      const stats = statsMap.get(r.wordId) || { correct: 0, total: 0 };
      stats.total++;
      if (r.isCorrect) stats.correct++;
      statsMap.set(r.wordId, stats);
    }

    const result: WordQuizStats[] = [];
    statsMap.forEach((stats, wordId) => {
      const wordInfo = wordMap.get(wordId);
      result.push({
        wordId,
        word: wordInfo?.word || i18n.t('(삭제된 단어)'),
        categoryId: wordInfo?.categoryId || 0,
        totalCount: stats.total,
        correctCount: stats.correct,
        incorrectCount: stats.total - stats.correct,
        accuracy: (stats.correct / stats.total) * 100,
      });
    });

    return result;
  },

  async getCategoryQuizStats(): Promise<CategoryQuizStats[]> {
    const allResults = await quizResultStorage.getAll();
    const allWords = await wordStorage.getAll();
    const allCategories = await categoryStorage.getAll();

    // wordId → categoryId 매핑
    const wordCategoryMap = new Map<number, number>();
    for (const w of allWords) {
      wordCategoryMap.set(w.wordId, w.categoryId);
    }

    // 카테고리별 단어 수
    const categoryWordCount = new Map<number, number>();
    for (const w of allWords) {
      categoryWordCount.set(w.categoryId, (categoryWordCount.get(w.categoryId) || 0) + 1);
    }

    // 카테고리별 퀴즈 결과 집계
    const categoryStatsMap = new Map<number, { correct: number; total: number; wordResults: Map<number, { correct: number; total: number }> }>();
    for (const r of allResults) {
      const catId = wordCategoryMap.get(r.wordId);
      if (catId == null) continue;

      if (!categoryStatsMap.has(catId)) {
        categoryStatsMap.set(catId, { correct: 0, total: 0, wordResults: new Map() });
      }
      const catStats = categoryStatsMap.get(catId)!;
      catStats.total++;
      if (r.isCorrect) catStats.correct++;

      // 단어별 결과 (취약 단어 집계용)
      const wordStats = catStats.wordResults.get(r.wordId) || { correct: 0, total: 0 };
      wordStats.total++;
      if (r.isCorrect) wordStats.correct++;
      catStats.wordResults.set(r.wordId, wordStats);
    }

    const result: CategoryQuizStats[] = allCategories
      .sort((a, b) => a.displayOrder - b.displayOrder)
      .map((cat) => {
        const stats = categoryStatsMap.get(cat.categoryId);
        let weakWordCount = 0;
        if (stats) {
          stats.wordResults.forEach((ws) => {
            if ((ws.correct / ws.total) * 100 < 50) weakWordCount++;
          });
        }
        return {
          categoryId: cat.categoryId,
          categoryName: cat.categoryName,
          wordCount: categoryWordCount.get(cat.categoryId) || 0,
          quizCount: stats?.total || 0,
          correctCount: stats?.correct || 0,
          incorrectCount: (stats?.total || 0) - (stats?.correct || 0),
          accuracy: stats && stats.total > 0 ? (stats.correct / stats.total) * 100 : 0,
          weakWordCount,
        };
      });

    return result;
  },

  async getMyPageStats(): Promise<MyPageStats> {
    const allResults = await quizResultStorage.getAll();
    const allWords = await wordStorage.getAll();

    const activityMap = new Map<string, { wordCount: number; quizCount: number }>();

    for (const word of allWords) {
      const date = toLocalDateKey(word.createdAt);
      const entry = activityMap.get(date) || { wordCount: 0, quizCount: 0 };
      entry.wordCount++;
      activityMap.set(date, entry);
    }

    for (const result of allResults) {
      const date = toLocalDateKey(result.takenAt);
      const entry = activityMap.get(date) || { wordCount: 0, quizCount: 0 };
      entry.quizCount++;
      activityMap.set(date, entry);
    }

    const activities: DailyActivity[] = [];
    activityMap.forEach((value, date) => {
      activities.push({ date, ...value });
    });
    activities.sort((a, b) => a.date.localeCompare(b.date));

    return {
      totalWordCount: allWords.length,
      totalQuizCount: allResults.length,
      streakDays: calculateStreak(activities),
      totalActiveDays: activities.length,
      activities,
    };
  },
};
