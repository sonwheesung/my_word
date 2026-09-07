/**
 * 백업/복원 회귀 테스트 (jest.setup.js 가 TZ=Asia/Seoul 로 고정).
 *
 * 🔴 이 파일의 존재 이유는 단 하나의 단언이다:
 *
 *      **복원 직후의 통계가 백업 시점의 통계와 정확히 같은가.**
 *
 *    통계는 저장된 값이 아니라 `words[].createdAt` · `quizResults[].takenAt` 에서 매번
 *    계산되는 파생값이다. 그래서 복원이 날짜를 다시 쓰거나, 고아 결과를 정리하거나,
 *    id 카운터를 빠뜨리면 **크래시 없이 통계만 조용히 달라진다.** 눈으로는 못 잡는다.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { backupService, BACKUP_SCHEMA_VERSION } from '../src/services/backupService';
import { quizService } from '../src/services/quizService';
import { wordStorage } from '../src/utils/storage';
import type { Word, Category } from '../src/types/word';

const CATEGORIES_KEY = '@my_word_categories';
const WORDS_KEY = '@my_word_words';
const QUIZ_RESULTS_KEY = '@my_word_quiz_results';
const NEXT_ID_KEY = '@my_word_next_id';
const AD_FREE_KEY = '@my_word_ad_free';

function makeCategory(categoryId: number, name: string): Category {
  return {
    categoryId,
    categoryName: name,
    displayOrder: categoryId,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function makeWord(wordId: number, word: string, createdAt: string, categoryId = 1): Word {
  return {
    wordId,
    categoryId,
    word,
    meanings: ['뜻'],
    examples: [],
    tags: [],
    memo: '',
    createdAt,
    updatedAt: createdAt,
  };
}

function makeResult(resultId: number, wordId: number, isCorrect: boolean, takenAt: string) {
  return { resultId, wordId, isCorrect, quizType: 'word_to_meaning', takenAt };
}

/** 스트릭·히트맵이 살아 있는지 보려면 **여러 날에 걸친** 데이터가 필요하다 */
async function seedRealisticData() {
  const categories = [makeCategory(1, '영어'), makeCategory(2, '일본어')];
  const words = [
    makeWord(10, 'apple', '2026-08-30T01:00:00.000Z'),
    makeWord(11, 'banana', '2026-08-31T02:00:00.000Z'),
    makeWord(12, 'cherry', '2026-09-01T03:00:00.000Z', 2),
  ];
  const results = [
    makeResult(20, 10, true, '2026-08-30T05:00:00.000Z'),
    makeResult(21, 10, false, '2026-08-31T05:00:00.000Z'),
    makeResult(22, 11, false, '2026-08-31T06:00:00.000Z'),
    makeResult(23, 12, true, '2026-09-01T07:00:00.000Z'),
    // 🔴 이미 지워진 단어(id 99)의 결과 — 실제 저장소에 이런 고아가 남는다
    makeResult(24, 99, false, '2026-09-01T08:00:00.000Z'),
  ];
  await AsyncStorage.setItem(CATEGORIES_KEY, JSON.stringify(categories));
  await AsyncStorage.setItem(WORDS_KEY, JSON.stringify(words));
  await AsyncStorage.setItem(QUIZ_RESULTS_KEY, JSON.stringify(results));
  await AsyncStorage.setItem(NEXT_ID_KEY, '24');
}

/** "새 기기"를 흉내 낸다 */
async function wipe() {
  await AsyncStorage.clear();
}

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('🔴 왕복 — 복원 후 통계가 백업 시점과 같은가', () => {
  it('통계·마이페이지 지표가 한 글자도 다르지 않다', async () => {
    await seedRealisticData();

    const before = {
      stats: await quizService.getStatistics(),
      myPage: await quizService.getMyPageStats(),
      wordStats: await quizService.getWordQuizStats(),
      categoryStats: await quizService.getCategoryQuizStats(),
    };

    const backup = await backupService.create();
    const text = backupService.serialize(backup);

    await wipe(); // 새 기기

    const parsed = backupService.parse(text);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    await backupService.restore(parsed.data);

    const after = {
      stats: await quizService.getStatistics(),
      myPage: await quizService.getMyPageStats(),
      wordStats: await quizService.getWordQuizStats(),
      categoryStats: await quizService.getCategoryQuizStats(),
    };

    expect(after).toEqual(before);
  });

  it('스트릭과 활동 일수가 유지된다 — 날짜를 다시 쓰면 여기서 무너진다', async () => {
    await seedRealisticData();
    const before = await quizService.getMyPageStats();
    // 8/30 · 8/31 · 9/1 사흘에 걸친 활동이므로 하루로 뭉치면 안 된다
    expect(before.activities.length).toBe(3);

    const text = backupService.serialize(await backupService.create());
    await wipe();
    const parsed = backupService.parse(text);
    if (!parsed.ok) throw new Error('parse 실패');
    await backupService.restore(parsed.data);

    const after = await quizService.getMyPageStats();
    expect(after.activities).toEqual(before.activities);
    expect(after.streakDays).toBe(before.streakDays);
    expect(after.totalActiveDays).toBe(3);
  });

  it('삭제된 단어의 고아 결과를 버리지 않는다 — 버리면 총 퀴즈 수가 줄어든다', async () => {
    await seedRealisticData();
    const before = await quizService.getStatistics();
    expect(before.totalQuizCount).toBe(5); // 고아 1건 포함

    const text = backupService.serialize(await backupService.create());
    await wipe();
    const parsed = backupService.parse(text);
    if (!parsed.ok) throw new Error('parse 실패');
    await backupService.restore(parsed.data);

    const after = await quizService.getStatistics();
    expect(after.totalQuizCount).toBe(5);
    expect(after.accuracy).toBe(before.accuracy);
  });

  it('날짜 문자열이 원본 그대로 남는다', async () => {
    await seedRealisticData();
    const text = backupService.serialize(await backupService.create());
    await wipe();
    const parsed = backupService.parse(text);
    if (!parsed.ok) throw new Error('parse 실패');
    await backupService.restore(parsed.data);

    const words = await wordStorage.getAll();
    expect(words.find((w) => w.wordId === 10)?.createdAt).toBe('2026-08-30T01:00:00.000Z');
  });
});

describe('🔴 id 카운터 — 빠뜨리면 퀴즈 기록이 엉뚱한 단어에 붙는다', () => {
  it('복원 후 새로 만든 단어의 id 가 기존 것과 겹치지 않는다', async () => {
    await seedRealisticData();
    const text = backupService.serialize(await backupService.create());
    await wipe();
    const parsed = backupService.parse(text);
    if (!parsed.ok) throw new Error('parse 실패');
    await backupService.restore(parsed.data);

    const created = await wordStorage.create({
      categoryId: 1,
      word: 'durian',
      meanings: ['두리안'],
      examples: [],
    });

    const existingIds = (await wordStorage.getAll()).map((w) => w.wordId);
    // 새 id 가 복원된 단어(10·11·12)나 결과 id(20~24)와 겹치면 안 된다
    expect(created.wordId).toBeGreaterThan(24);
    expect(existingIds.filter((id) => id === created.wordId)).toHaveLength(1);
  });

  it('카운터가 데이터보다 작게 적힌 백업도 고쳐서 받는다', async () => {
    const broken = JSON.stringify({
      schemaVersion: 1,
      appVersion: '1.4.0',
      exportedAt: '2026-09-07T00:00:00.000Z',
      categories: [makeCategory(1, '영어')],
      words: [makeWord(500, 'apple', '2026-09-01T00:00:00.000Z')],
      quizResults: [],
      nextId: 1, // 🔴 손으로 고쳤거나 옛 버그로 어긋난 값
      settings: {},
    });

    const parsed = backupService.parse(broken);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.data.nextId).toBe(500);
  });
});

describe('🔴 백업에 담기면 안 되는 것', () => {
  it('광고 제거 구매 캐시를 담지 않는다 — 담으면 결제 우회 경로가 된다', async () => {
    await seedRealisticData();
    await AsyncStorage.setItem(AD_FREE_KEY, 'true');

    const text = backupService.serialize(await backupService.create());

    expect(text).not.toContain('ad_free');
    expect(text).not.toContain(AD_FREE_KEY);
  });

  it('기기 식별자(SecureStore)를 담지 않는다', async () => {
    await seedRealisticData();
    const text = backupService.serialize(await backupService.create());
    expect(text).not.toContain('myword_device_id');
  });
});

describe('parse — 아무 파일이나 들어와도 죽지 않는다', () => {
  it.each([
    ['빈 문자열', '', 'invalid-json'],
    ['JSON 이 아님', 'hello', 'invalid-json'],
    ['깨진 JSON', '{"a":', 'invalid-json'],
    ['배열', '[1,2,3]', 'not-a-backup'],
    ['다른 앱의 JSON', '{"foo":"bar"}', 'not-a-backup'],
    ['schemaVersion 없음', '{"words":[],"categories":[],"quizResults":[]}', 'not-a-backup'],
    ['words 가 배열이 아님', '{"schemaVersion":1,"words":{},"categories":[],"quizResults":[]}', 'not-a-backup'],
  ])('%s → %s', (_label, input, reason) => {
    const result = backupService.parse(input as string);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe(reason);
  });

  it('미래 스키마는 읽으려 시도조차 하지 않는다', () => {
    const future = JSON.stringify({
      schemaVersion: BACKUP_SCHEMA_VERSION + 1,
      words: [],
      categories: [],
      quizResults: [],
    });
    const result = backupService.parse(future);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('newer-schema');
  });

  it('요소 모양이 틀리면 corrupt 로 거른다', () => {
    const bad = JSON.stringify({
      schemaVersion: 1,
      words: [{ wordId: 'not-a-number' }],
      categories: [],
      quizResults: [],
    });
    const result = backupService.parse(bad);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('corrupt');
  });

  it('빈 백업도 정상으로 받는다 — 단어가 없는 기기의 백업이다', () => {
    const empty = JSON.stringify({
      schemaVersion: 1,
      appVersion: '1.5.0',
      exportedAt: '2026-09-07T00:00:00.000Z',
      categories: [],
      words: [],
      quizResults: [],
      nextId: 0,
      settings: {},
    });
    const result = backupService.parse(empty);
    expect(result.ok).toBe(true);
  });
});

describe('summarize — 확인 화면이 보여줄 숫자', () => {
  it('개수를 그대로 센다', async () => {
    await seedRealisticData();
    const summary = backupService.summarize(await backupService.create());
    expect(summary).toMatchObject({ words: 3, categories: 2, quizResults: 5 });
  });
});
