import { quizResultStorage, wordStorage, categoryStorage } from '../utils/storage';

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
  const todayStr = today.toISOString().split('T')[0];

  const checkDate = new Date(today);

  if (!activeDates.has(todayStr)) {
    checkDate.setDate(checkDate.getDate() - 1);
    const yesterdayStr = checkDate.toISOString().split('T')[0];
    if (!activeDates.has(yesterdayStr)) {
      return 0;
    }
  }

  let streak = 0;
  while (true) {
    const dateStr = checkDate.toISOString().split('T')[0];
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
        word: wordInfo?.word || '(삭제된 단어)',
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
      const date = word.createdAt.split('T')[0];
      const entry = activityMap.get(date) || { wordCount: 0, quizCount: 0 };
      entry.wordCount++;
      activityMap.set(date, entry);
    }

    for (const result of allResults) {
      const date = result.takenAt.split('T')[0];
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
