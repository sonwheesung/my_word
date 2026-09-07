/**
 * 알림에 넣을 단어 고르기 — `quizService.getReminderWords`.
 *
 * 🔴 이 테스트가 지키는 것: **한 번도 안 푼 단어가 1순위**라는 규칙.
 *    기존 `getWordQuizStats()` 는 퀴즈 결과에서 출발해 결과 없는 단어를 아예 담지 않는다.
 *    그걸 재사용했다면 "안 푼 단어"는 영원히 안 뽑히면서도 함수는 멀쩡히 값을 반환했을 것이다 —
 *    조용히 틀리는 종류라 단언으로 못박아 둔다.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { quizService } from '../src/services/quizService';
import type { Word } from '../src/types/word';

const WORDS_KEY = '@my_word_words';
const QUIZ_RESULTS_KEY = '@my_word_quiz_results';

function makeWord(wordId: number, word: string, createdAt: string, meanings = ['뜻']): Word {
  return {
    wordId,
    categoryId: 1,
    word,
    meanings,
    examples: [],
    tags: [],
    memo: '',
    createdAt,
    updatedAt: createdAt,
  };
}

function makeResult(resultId: number, wordId: number, isCorrect: boolean) {
  return {
    resultId,
    wordId,
    isCorrect,
    quizType: 'word_to_meaning',
    takenAt: '2026-09-01T10:00:00.000Z',
  };
}

async function seed(words: Word[], results: ReturnType<typeof makeResult>[] = []) {
  await AsyncStorage.setItem(WORDS_KEY, JSON.stringify(words));
  await AsyncStorage.setItem(QUIZ_RESULTS_KEY, JSON.stringify(results));
}

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('getReminderWords', () => {
  it('단어가 없으면 빈 배열이다 — 빈 앱에 "복습하세요"는 알림을 끄게 만든다', async () => {
    await seed([]);
    expect(await quizService.getReminderWords(7)).toEqual([]);
  });

  it('limit 이 0 이하면 빈 배열이다', async () => {
    await seed([makeWord(1, 'apple', '2026-01-01T00:00:00.000Z')]);
    expect(await quizService.getReminderWords(0)).toEqual([]);
    expect(await quizService.getReminderWords(-3)).toEqual([]);
  });

  it('🔴 한 번도 안 푼 단어가 정답률 0% 인 단어보다 먼저 온다', async () => {
    await seed(
      [
        makeWord(1, 'quizzed', '2026-01-01T00:00:00.000Z'),
        makeWord(2, 'never', '2026-01-02T00:00:00.000Z'),
      ],
      // 1번은 두 번 다 틀렸다 = 정답률 0%. 그래도 "아직 안 푼" 2번이 앞이다.
      [makeResult(1, 1, false), makeResult(2, 1, false)],
    );

    const picked = await quizService.getReminderWords(2);
    expect(picked.map((p) => p.word)).toEqual(['never', 'quizzed']);
  });

  it('안 푼 단어끼리는 오래된 것부터 — 넣어 두고 방치한 순서다', async () => {
    await seed([
      makeWord(1, 'newest', '2026-03-01T00:00:00.000Z'),
      makeWord(2, 'oldest', '2026-01-01T00:00:00.000Z'),
      makeWord(3, 'middle', '2026-02-01T00:00:00.000Z'),
    ]);

    const picked = await quizService.getReminderWords(3);
    expect(picked.map((p) => p.word)).toEqual(['oldest', 'middle', 'newest']);
  });

  it('푼 단어끼리는 정답률이 낮은 것부터', async () => {
    await seed(
      [
        makeWord(1, 'perfect', '2026-01-01T00:00:00.000Z'),
        makeWord(2, 'weak', '2026-01-02T00:00:00.000Z'),
        makeWord(3, 'half', '2026-01-03T00:00:00.000Z'),
      ],
      [
        makeResult(1, 1, true), // perfect 100%
        makeResult(2, 2, false), // weak 0%
        makeResult(3, 3, true), // half 50%
        makeResult(4, 3, false),
      ],
    );

    const picked = await quizService.getReminderWords(3);
    expect(picked.map((p) => p.word)).toEqual(['weak', 'half', 'perfect']);
  });

  it('정답률이 같으면 덜 풀어 본 것부터', async () => {
    await seed(
      [
        makeWord(1, 'tried-more', '2026-01-01T00:00:00.000Z'),
        makeWord(2, 'tried-once', '2026-01-02T00:00:00.000Z'),
      ],
      // 둘 다 0% 지만 1번은 세 번, 2번은 한 번 틀렸다
      [
        makeResult(1, 1, false),
        makeResult(2, 1, false),
        makeResult(3, 1, false),
        makeResult(4, 2, false),
      ],
    );

    const picked = await quizService.getReminderWords(2);
    expect(picked.map((p) => p.word)).toEqual(['tried-once', 'tried-more']);
  });

  it('limit 만큼만 준다', async () => {
    await seed([
      makeWord(1, 'a', '2026-01-01T00:00:00.000Z'),
      makeWord(2, 'b', '2026-01-02T00:00:00.000Z'),
      makeWord(3, 'c', '2026-01-03T00:00:00.000Z'),
    ]);

    expect(await quizService.getReminderWords(2)).toHaveLength(2);
  });

  it('단어가 limit 보다 적으면 있는 만큼만 준다 — 모자란 자리를 채우려 중복시키지 않는다', async () => {
    await seed([makeWord(1, 'only', '2026-01-01T00:00:00.000Z')]);

    const picked = await quizService.getReminderWords(7);
    expect(picked).toHaveLength(1);
    expect(picked[0].word).toBe('only');
  });

  it('뜻이 여러 개면 첫 번째만 쓴다', async () => {
    await seed([makeWord(1, 'apple', '2026-01-01T00:00:00.000Z', ['사과', '애플', '사과나무'])]);

    expect((await quizService.getReminderWords(1))[0].meaning).toBe('사과');
  });

  it('뜻이 비어 있어도 깨지지 않는다 — 가져오기로 들어온 단어가 그럴 수 있다', async () => {
    await seed([makeWord(1, 'apple', '2026-01-01T00:00:00.000Z', [])]);

    const picked = await quizService.getReminderWords(1);
    expect(picked[0].meaning).toBe('');
    expect(picked[0].word).toBe('apple');
  });

  it('삭제된 단어의 퀴즈 결과가 남아 있어도 그 단어를 되살리지 않는다', async () => {
    // 단어는 지웠는데 결과만 남은 상태. 결과에서 출발하면 "(삭제된 단어)" 가 알림에 뜬다.
    await seed(
      [makeWord(1, 'alive', '2026-01-01T00:00:00.000Z')],
      [makeResult(1, 999, false)],
    );

    const picked = await quizService.getReminderWords(7);
    expect(picked.map((p) => p.wordId)).toEqual([1]);
  });
});
