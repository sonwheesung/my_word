/**
 * 활동 기록/스트릭 날짜 집계 회귀 테스트 (jest.setup.js 가 TZ=Asia/Seoul 로 고정)
 *
 * 배경: 저장소는 시각을 ISO-8601(UTC) 로 보관하는데 집계가 UTC 문자열을
 * 그대로 잘라 썼다. KST 오전 0~9시 활동이 전날로 집계되어
 * 히트맵이 하루 밀리고 스트릭이 근거 없이 끊겼다.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { quizService } from '../src/services/quizService';
import { formatLocalDate, toLocalDateKey } from '../src/utils/date';
import type { Word } from '../src/types/word';

const WORDS_KEY = '@my_word_words';
const QUIZ_RESULTS_KEY = '@my_word_quiz_results';

function makeWord(createdAt: string, wordId = 1): Word {
  return {
    wordId,
    categoryId: 1,
    word: `word${wordId}`,
    meanings: ['뜻'],
    examples: [],
    tags: [],
    memo: '',
    createdAt,
    updatedAt: createdAt,
  };
}

function makeResult(takenAt: string, resultId: number) {
  return {
    resultId,
    wordId: 1,
    isCorrect: true,
    quizType: 'word_to_meaning',
    takenAt,
  };
}

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('utils/date', () => {
  it('테스트 시간대가 KST 로 고정되어 있다', () => {
    expect(new Date('2026-08-05T08:30:00+09:00').getHours()).toBe(8);
  });

  it('UTC 로는 전날인 KST 오전 시각을 당일로 환산한다', () => {
    const iso = new Date('2026-08-05T08:30:00+09:00').toISOString();
    expect(iso).toBe('2026-08-04T23:30:00.000Z'); // 저장 포맷은 UTC 그대로 유지
    expect(toLocalDateKey(iso)).toBe('2026-08-05');
  });

  it('UTC 로는 다음날인 KST 심야 시각을 당일로 환산한다', () => {
    const iso = new Date('2026-08-05T23:30:00+09:00').toISOString();
    expect(iso).toBe('2026-08-05T14:30:00.000Z');
    expect(toLocalDateKey(iso)).toBe('2026-08-05');
  });

  it('한 자리 월/일을 0 으로 채운다', () => {
    expect(formatLocalDate(new Date(2026, 0, 3))).toBe('2026-01-03');
  });

  it('손상된 타임스탬프는 예외 없이 폴백한다', () => {
    expect(toLocalDateKey('망가진값')).toBe('망가진값');
    expect(toLocalDateKey('2026-08-05T!!!')).toBe('2026-08-05');
  });
});

describe('getMyPageStats — 활동 버킷', () => {
  it('KST 오전 활동이 당일 칸에 기록된다', async () => {
    const kstMorning = new Date('2026-08-05T08:30:00+09:00').toISOString();
    await AsyncStorage.setItem(WORDS_KEY, JSON.stringify([makeWord(kstMorning)]));

    const stats = await quizService.getMyPageStats();

    expect(stats.activities).toEqual([
      { date: '2026-08-05', wordCount: 1, quizCount: 0 },
    ]);
  });

  it('KST 기준 같은 날의 새벽/심야 활동을 한 칸으로 합친다', async () => {
    const results = [
      makeResult(new Date('2026-08-05T00:10:00+09:00').toISOString(), 1),
      makeResult(new Date('2026-08-05T13:00:00+09:00').toISOString(), 2),
      makeResult(new Date('2026-08-05T23:50:00+09:00').toISOString(), 3),
    ];
    await AsyncStorage.setItem(QUIZ_RESULTS_KEY, JSON.stringify(results));

    const stats = await quizService.getMyPageStats();

    expect(stats.totalActiveDays).toBe(1);
    expect(stats.activities[0]).toEqual({ date: '2026-08-05', wordCount: 0, quizCount: 3 });
  });

  it('KST 기준 3일 연속 학습을 활동일 3일로 집계한다', async () => {
    const results = [
      makeResult(new Date('2026-08-03T22:00:00+09:00').toISOString(), 1),
      makeResult(new Date('2026-08-04T08:00:00+09:00').toISOString(), 2),
      makeResult(new Date('2026-08-04T22:00:00+09:00').toISOString(), 3),
      makeResult(new Date('2026-08-05T08:00:00+09:00').toISOString(), 4),
    ];
    await AsyncStorage.setItem(QUIZ_RESULTS_KEY, JSON.stringify(results));

    const stats = await quizService.getMyPageStats();

    expect(stats.totalActiveDays).toBe(3);
    expect(stats.activities.map((a) => a.date)).toEqual([
      '2026-08-03',
      '2026-08-04',
      '2026-08-05',
    ]);
  });
});

describe('getMyPageStats — 스트릭', () => {
  /** n일 전 로컬 날짜의 KST 오전 8시 ISO 문자열 */
  function daysAgoMorningISO(n: number): string {
    const d = new Date();
    d.setDate(d.getDate() - n);
    d.setHours(8, 0, 0, 0);
    return d.toISOString();
  }

  it('오늘 오전에만 학습해도 스트릭이 1이다', async () => {
    await AsyncStorage.setItem(
      QUIZ_RESULTS_KEY,
      JSON.stringify([makeResult(daysAgoMorningISO(0), 1)]),
    );

    const stats = await quizService.getMyPageStats();
    expect(stats.streakDays).toBe(1);
  });

  it('오늘 포함 3일 연속이면 스트릭이 3이다', async () => {
    const results = [0, 1, 2].map((n, i) => makeResult(daysAgoMorningISO(n), i + 1));
    await AsyncStorage.setItem(QUIZ_RESULTS_KEY, JSON.stringify(results));

    const stats = await quizService.getMyPageStats();
    expect(stats.streakDays).toBe(3);
  });

  it('오늘 아직 안 했어도 어제까지 연속이면 스트릭을 유지한다', async () => {
    const results = [1, 2].map((n, i) => makeResult(daysAgoMorningISO(n), i + 1));
    await AsyncStorage.setItem(QUIZ_RESULTS_KEY, JSON.stringify(results));

    const stats = await quizService.getMyPageStats();
    expect(stats.streakDays).toBe(2);
  });

  it('이틀 이상 비면 스트릭이 0이다', async () => {
    await AsyncStorage.setItem(
      QUIZ_RESULTS_KEY,
      JSON.stringify([makeResult(daysAgoMorningISO(3), 1)]),
    );

    const stats = await quizService.getMyPageStats();
    expect(stats.streakDays).toBe(0);
  });

  it('활동이 없으면 스트릭이 0이다', async () => {
    const stats = await quizService.getMyPageStats();
    expect(stats.streakDays).toBe(0);
    expect(stats.totalActiveDays).toBe(0);
  });
});
