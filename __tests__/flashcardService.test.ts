/**
 * 플래시카드 검증. 저장소를 모르는 순수 함수와, 소스를 훑는 규칙 하나를 다룬다.
 *
 * 🔴 이 파일이 지키는 가장 무거운 약속:
 *    **플래시카드는 채점하지 않는다.** 카드를 몇 장 넘겼든 정답률과 복습 만기가 움직이지 않는다.
 *    이게 깨지면 통계가 조용히 오염된다. 크래시도 경고도 없고 숫자만 틀린다.
 *    1.6.0 의 SRS 버그(`reps` 가 한 판에 +2)가 정확히 그 모양이었고, 화면으로는 안 보였다.
 *    그래서 "안 부른다"를 사람의 기억에 맡기지 않고 아래 마지막 describe 가 소스를 읽어 확인한다.
 *
 * 두 번째 약속: **훑어보기는 자르지 않는다.** 만기순으로 내도 만기가 아닌 단어를 빼지 않는다.
 *    빼면 그건 퀴즈다.
 */

// 🚫 `tsconfig.json` 의 `types` 에 "node" 를 넣지 않는다. 그러면 전역 타이머 타입이
//    number 에서 NodeJS.Timeout 으로 바뀌어 앱 코드 쪽이 흔들린다. 여기서만 선언한다.
declare const require: (id: string) => any;
declare const __dirname: string;

const fs = require('fs') as { readFileSync(p: string, enc: string): string };
const path = require('path') as { join(...parts: string[]): string };

import {
  DEFAULT_PREFS,
  buildSequence,
  isCardOrder,
  parsePrefs,
} from '../src/services/flashcardService';
import type { Word } from '../src/types/word';

const w = (wordId: number, createdAt: string, categoryId = 1): Word => ({
  wordId,
  categoryId,
  word: `w${wordId}`,
  meanings: [`뜻${wordId}`],
  examples: [],
  createdAt,
  updatedAt: createdAt,
});

const ids = (list: Word[]) => list.map((x) => x.wordId);

describe('취향 읽기: 어떤 입력에도 던지지 않는다', () => {
  it('저장된 것이 없으면 기본값', () => {
    expect(parsePrefs(null)).toEqual(DEFAULT_PREFS);
  });

  it('JSON 이 깨져 있어도 기본값', () => {
    expect(parsePrefs('{순서:')).toEqual(DEFAULT_PREFS);
  });

  it('객체가 아니면 기본값', () => {
    expect(parsePrefs('42')).toEqual(DEFAULT_PREFS);
    expect(parsePrefs('null')).toEqual(DEFAULT_PREFS);
    expect(parsePrefs('"created"')).toEqual(DEFAULT_PREFS);
  });

  it('모르는 순서 값은 기본값으로 되돌린다', () => {
    // 앱을 내려 설치하면 옛 버전이 쓴 값이 남아 있을 수 있다
    expect(parsePrefs('{"order":"weak"}').order).toBe(DEFAULT_PREFS.order);
  });

  it('일부만 저장돼 있으면 나머지는 기본값', () => {
    expect(parsePrefs('{"order":"shuffle"}')).toEqual({
      ...DEFAULT_PREFS,
      order: 'shuffle',
    });
  });

  it('lastCategoryId 가 숫자가 아니면 버린다', () => {
    expect(parsePrefs('{"lastCategoryId":"3"}').lastCategoryId).toBeNull();
    expect(parsePrefs('{"lastCategoryId":null}').lastCategoryId).toBeNull();
    expect(parsePrefs('{"lastCategoryId":7}').lastCategoryId).toBe(7);
  });

  it('불리언 자리에 다른 것이 오면 기본값', () => {
    const parsed = parsePrefs('{"frontIsWord":"yes","autoSpeak":1}');
    expect(parsed.frontIsWord).toBe(DEFAULT_PREFS.frontIsWord);
    expect(parsed.autoSpeak).toBe(DEFAULT_PREFS.autoSpeak);
  });

  it('순서 값 판별', () => {
    expect(isCardOrder('created')).toBe(true);
    expect(isCardOrder('shuffle')).toBe(true);
    expect(isCardOrder('due')).toBe(true);
    expect(isCardOrder('review')).toBe(false);
    expect(isCardOrder(undefined)).toBe(false);
  });
});

describe('순서 만들기', () => {
  const words = [
    w(3, '2026-09-03T00:00:00.000Z'),
    w(1, '2026-09-01T00:00:00.000Z'),
    w(2, '2026-09-02T00:00:00.000Z'),
  ];

  it('단어가 없으면 빈 배열', () => {
    expect(buildSequence([], 'created')).toEqual([]);
    expect(buildSequence([], 'due', [1, 2])).toEqual([]);
    expect(buildSequence([], 'shuffle')).toEqual([]);
  });

  it('등록순: 생성일 오름차순', () => {
    expect(ids(buildSequence(words, 'created'))).toEqual([1, 2, 3]);
  });

  it('등록순: 같은 시각이면 wordId 로 갈라 항상 같은 답을 준다', () => {
    const same = '2026-09-01T00:00:00.000Z';
    const tied = [w(9, same), w(4, same), w(6, same)];
    expect(ids(buildSequence(tied, 'created'))).toEqual([4, 6, 9]);
    // 입력 순서를 바꿔도 결과가 같다
    expect(ids(buildSequence([...tied].reverse(), 'created'))).toEqual([4, 6, 9]);
  });

  it('무작위: 같은 rng 면 같은 순서(테스트가 가능해야 한다)', () => {
    const rng = () => 0.5;
    expect(ids(buildSequence(words, 'shuffle', [], rng))).toEqual(
      ids(buildSequence(words, 'shuffle', [], rng)),
    );
  });

  it('🔴 무작위: 단어를 잃거나 늘리지 않는다', () => {
    let seed = 0;
    const rng = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    const out = buildSequence(words, 'shuffle', [], rng);
    expect(out).toHaveLength(words.length);
    expect(ids(out).slice().sort()).toEqual([1, 2, 3]);
  });

  it('만기순: 만기 단어가 준 우선순위대로 앞에 온다', () => {
    expect(ids(buildSequence(words, 'due', [3, 1]))).toEqual([3, 1, 2]);
  });

  it('🔴 만기순: 만기가 아닌 단어를 빼지 않는다(자르면 퀴즈다)', () => {
    const out = buildSequence(words, 'due', [2]);
    expect(ids(out)).toEqual([2, 1, 3]);
    expect(out).toHaveLength(words.length);
  });

  it('만기가 하나도 없으면 등록순과 같다', () => {
    expect(ids(buildSequence(words, 'due', []))).toEqual([1, 2, 3]);
  });

  it('만기 목록에 없는 단어 id 가 섞여 있어도 무해하다', () => {
    // 만기를 읽은 뒤 단어가 지워지면 실제로 생긴다
    expect(ids(buildSequence(words, 'due', [999, 2]))).toEqual([2, 1, 3]);
  });

  it('만기 목록에 같은 id 가 두 번 있어도 카드가 두 장이 되지 않는다', () => {
    const out = buildSequence(words, 'due', [2, 2, 1]);
    expect(ids(out)).toEqual([2, 1, 3]);
    expect(out).toHaveLength(3);
  });

  it('원본 배열을 건드리지 않는다', () => {
    const input = [...words];
    const before = ids(input);
    buildSequence(input, 'created');
    buildSequence(input, 'due', [3]);
    buildSequence(input, 'shuffle', [], () => 0.5);
    expect(ids(input)).toEqual(before);
  });
});

/**
 * 🔴 여기가 이 파일의 존재 이유다.
 *
 * "플래시카드는 점수를 남기지 않는다"는 결정을 **주석과 기억이 아니라 기계로** 지킨다.
 * 나중에 누가 "카드에서도 안다/모른다를 받자"고 하면 이 테스트가 먼저 깨지고,
 * 그때 통계 오염과 백업 오라클까지 같이 검토하게 된다.
 */
describe('🔴 채점 금지: 소스에 쓰기 경로가 없다', () => {
  const FILES = [
    'src/services/flashcardService.ts',
    'src/screens/FlashcardScreen.tsx',
    'src/screens/FlashcardSetupScreen.tsx',
    'src/components/FlipCard.tsx',
  ];

  /** 부르면 정답률이나 만기가 움직이는 것들 */
  const FORBIDDEN = ['recordAnswers', 'saveResults', 'quizResultStorage', 'quizService'];

  const read = (rel: string) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');

  it.each(FILES)('%s: 채점 쓰기를 부르지 않는다', (rel) => {
    // 주석에 이름이 나오는 것은 허용한다(왜 안 부르는지 적어 두는 편이 낫다).
    // 실제 호출만 잡기 위해 주석 줄을 걷어내고 본다.
    const code = read(rel)
      .split('\n')
      .filter((line: string) => {
        const t = line.trim();
        return !(t.startsWith('//') || t.startsWith('*') || t.startsWith('/*'));
      })
      .join('\n');

    for (const name of FORBIDDEN) {
      expect(code).not.toContain(name);
    }
  });

  it('만기 조회는 읽기 함수만 쓴다', () => {
    const code = read('src/services/flashcardService.ts');
    expect(code).toContain('getDueWordIds');
  });

  it('취향 키만 쓰고 다른 저장소 키를 건드리지 않는다', () => {
    const code = read('src/services/flashcardService.ts');
    expect(code).toContain('FLASHCARD_PREFS_KEY');
    for (const key of ['SRS_KEY', 'WORDS_KEY', 'QUIZ_RESULTS_KEY', 'BACKUP_KEYS']) {
      expect(code).not.toContain(key);
    }
  });
});
