import i18n from '../i18n';
import { quizResultStorage, wordStorage, categoryStorage } from '../utils/storage';
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
export interface ReminderWord {
  wordId: number;
  word: string;
  /** 뜻이 여러 개면 첫 번째만. 없으면 빈 문자열 */
  meaning: string;
}

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

export const quizService = {
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

  /**
   * 학습 리마인더 알림에 넣을 단어를 **약한 것부터** 뽑는다.
   *
   * 🔴 `getWordQuizStats()` 를 재사용하면 안 된다. 그 함수는 **퀴즈 결과에서 출발**해
   *    결과가 있는 단어만 담는다 — 그래서 **한 번도 안 푼 단어가 아예 안 들어 있다.**
   *    여기서 제일 알려 주고 싶은 것이 바로 그 단어들이라, 저장된 단어에서 출발해 뒤집는다.
   *
   * 순서:
   *   ① 퀴즈에 한 번도 안 나온 단어 — 오래 전에 넣고 방치한 것부터(createdAt 오름차순)
   *   ② 푼 적 있는 단어 — 정답률 낮은 순, 같으면 푼 횟수가 적은 순
   *
   * 며칠치를 한 번에 예약하므로 **서로 다른 단어**가 필요하다. 매일 같은 단어가 오면 무시당한다.
   */
  async getReminderWords(limit: number): Promise<ReminderWord[]> {
    if (limit <= 0) return [];

    const [allWords, allResults] = await Promise.all([
      wordStorage.getAll(),
      quizResultStorage.getAll(),
    ]);
    // 단어가 없으면 알릴 것도 없다. "복습하세요"만 오는 빈 앱은 알림을 끄게 만든다.
    if (allWords.length === 0) return [];

    const statsMap = new Map<number, { correct: number; total: number }>();
    for (const r of allResults) {
      const stats = statsMap.get(r.wordId) || { correct: 0, total: 0 };
      stats.total++;
      if (r.isCorrect) stats.correct++;
      statsMap.set(r.wordId, stats);
    }

    const never = allWords.filter((w) => !statsMap.has(w.wordId));
    // 무작위로 섞지 않는다 — 예약할 때마다 결과가 달라지면 테스트도 못 하고,
    // "오래 방치한 단어부터"가 사용자에게도 더 말이 된다.
    never.sort((a, b) => a.createdAt.localeCompare(b.createdAt));

    const quizzed = allWords
      .filter((w) => statsMap.has(w.wordId))
      .map((w) => {
        // 위에서 has 로 걸렀으므로 존재한다. 그래도 undefined 접근을 만들지 않는다.
        const s = statsMap.get(w.wordId) || { correct: 0, total: 0 };
        return { word: w, accuracy: s.total > 0 ? (s.correct / s.total) * 100 : 0, total: s.total };
      })
      .sort((a, b) => a.accuracy - b.accuracy || a.total - b.total || a.word.wordId - b.word.wordId)
      .map((entry) => entry.word);

    return [...never, ...quizzed].slice(0, limit).map((w) => ({
      wordId: w.wordId,
      word: w.word,
      // 뜻이 비어 있는 단어도 저장될 수 있다(가져오기 경로). 배열 접근 전에 길이를 본다.
      meaning: w.meanings.length > 0 ? w.meanings[0] : '',
    }));
  },
};
