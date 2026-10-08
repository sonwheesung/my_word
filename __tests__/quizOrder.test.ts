/**
 * 🔴 **퀴즈가 넘겨받은 순서를 지키는가**, 그리고 **틀린 개수를 한 곳에서만 세는가**.
 *
 * 둘 다 2026-10-08 에 쌓인 흠을 걷다가 코드에서 확인한 결함이다. 공통점이 하나 있다 —
 * **크래시도 경고도 없고 숫자·순서만 조용히 틀린다.** 타입 체크가 못 보는 종류다.
 */

declare const require: (id: string) => any;
declare const __dirname: string;

const fs = require('fs') as { readFileSync(p: string, enc: string): string };
const path = require('path') as { join(...parts: string[]): string };

import { orderByIds, wrongWordIds } from '../src/services/quizService';

const w = (wordId: number) => ({ wordId, word: 'w' + wordId });
const r = (wordId: number, isCorrect: boolean) => ({ wordId, isCorrect });

describe('🔴 orderByIds — 넘겨받은 순서를 지킨다', () => {
  const words = [w(1), w(2), w(3), w(4)];

  it('🔴 저장소 순서가 아니라 **준 순서**로 세운다', () => {
    expect(orderByIds(words, [3, 1, 2]).map((x) => x.wordId)).toEqual([3, 1, 2]);
  });

  it('🔴 만기순이 뒤집혀도 그대로 따른다 (홈 복습 배너가 쓰는 길)', () => {
    expect(orderByIds(words, [4, 3, 2, 1]).map((x) => x.wordId)).toEqual([4, 3, 2, 1]);
  });

  it('⚠ 없는 id 는 조용히 건너뛴다 (지운 단어를 가리키는 목록)', () => {
    expect(orderByIds(words, [2, 999, 1]).map((x) => x.wordId)).toEqual([2, 1]);
  });

  it('⚠ 같은 id 가 두 번 오면 한 번만 센다', () => {
    expect(orderByIds(words, [2, 2, 1]).map((x) => x.wordId)).toEqual([2, 1]);
  });

  it('빈 목록 · 빈 단어장에 던지지 않는다', () => {
    expect(orderByIds(words, [])).toEqual([]);
    expect(orderByIds([], [1, 2])).toEqual([]);
  });

  it('고른 것 자체는 예전과 같다 (순서만 바뀐 것이지 집합이 바뀐 게 아니다)', () => {
    const got = orderByIds(words, [3, 1]).map((x) => x.wordId).sort();
    const old = words.filter((x) => [3, 1].includes(x.wordId)).map((x) => x.wordId).sort();
    expect(got).toEqual(old);
  });
});

describe('🔴 wrongWordIds — 건수가 아니라 단어 수다', () => {
  it('🔴 한 단어가 두 번 틀려도 한 번만 센다 (mixed 모드)', () => {
    // 라벨이 "3개"인데 2문제가 나오던 자리
    const results = [r(1, false), r(1, false), r(2, false)];
    expect(results.filter((x) => !x.isCorrect)).toHaveLength(3); // 건수는 3
    expect(wrongWordIds(results)).toEqual([1, 2]); // 실제로 낼 것은 2
  });

  it('맞힌 것은 안 센다', () => {
    expect(wrongWordIds([r(1, true), r(2, false), r(3, true)])).toEqual([2]);
  });

  it('⚠ 처음 틀린 순서를 지킨다 (orderByIds 가 그 순서로 낸다)', () => {
    expect(wrongWordIds([r(5, false), r(2, false), r(5, false)])).toEqual([5, 2]);
  });

  it('⚠ 한 번이라도 맞혔어도 틀린 적이 있으면 낸다', () => {
    // 같은 단어를 두 유형으로 물어 하나는 맞고 하나는 틀렸다 — 아직 모르는 단어다
    expect(wrongWordIds([r(7, true), r(7, false)])).toEqual([7]);
  });

  it('다 맞히면 빈 배열', () => {
    expect(wrongWordIds([r(1, true), r(2, true)])).toEqual([]);
    expect(wrongWordIds([])).toEqual([]);
  });
});

// ── 🔴 **화면이 그 함수를 실제로 쓰는가**를 소스로 훑는다 ─────────────────────
//
// 위의 순수 함수 테스트는 "답이 맞는가" 를 본다. 그것만으로는 **그 답을 쓰는가** 를 못 본다 —
// 2026-10-08 변이 테스트에서 셋이 그대로 빠져나갔다(화면이 옛 `filter` 로 돌아가기 ·
// `review` 분기도 돌아가기 · 결과 화면이 다시 건수로 세기). 전부 **고치기 전 상태 그대로**다.
//
// ⚠ **주석을 반드시 걷어낸다.** 이 변경의 주석에 옛 코드가 글자 그대로 적혀 있어서,
//   안 걷으면 가드가 주석을 보고 빨개지거나 초록이 된다.

const FILES = [
  'src/screens/QuizScreen.tsx',
  'src/screens/QuizResultScreen.tsx',
  'App.tsx',
];

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '');
}

const read = (rel: string): string => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');

describe('🔴 넘겨받은 순서를 버리지 않는다 (소스 훑기)', () => {
  it('훑을 파일이 실제로 존재한다', () => {
    // 🔴 파일을 옮기거나 이름을 바꾸면 이 배열도 같이 고친다 —
    //    안 고치면 가드가 **없는 파일을 지키면서 초록**이 된다
    for (const rel of FILES) {
      expect(() => read(rel)).not.toThrow();
      expect(read(rel).length).toBeGreaterThan(0);
    }
  });

  it('🔴 QuizScreen 이 목록 두 곳 모두 orderByIds 로 세운다', () => {
    const src = stripComments(read('src/screens/QuizScreen.tsx'));
    expect(src).toContain('orderByIds(words, retryWordIds)');
    expect(src).toContain('orderByIds(words, dueIds)');
  });

  it('🔴 QuizScreen 에 순서를 버리는 filter 가 없다', () => {
    const src = stripComments(read('src/screens/QuizScreen.tsx'));
    // `words.filter(w => <목록>.includes(w.wordId))` 모양 — 고르기는 맞고 순서가 저장소 순서가 된다
    expect(src).not.toMatch(/words\s*\.filter\([^)]*retryWordIds\s*\.includes/);
    expect(src).not.toMatch(/words\s*\.filter\([^)]*dueIds\s*\.includes/);
  });

  it('🔴 결과 화면의 다시 풀기 라벨이 단어 수를 쓴다 (건수가 아니다)', () => {
    const src = stripComments(read('src/screens/QuizResultScreen.tsx'));
    expect(src).toContain('wrongWordIds(results)');
    expect(src).toMatch(/틀린 \{\{count\}\}개 다시 풀기[\s\S]{0,40}retryCount/);
    expect(src).not.toMatch(/틀린 \{\{count\}\}개 다시 풀기[\s\S]{0,40}wrongResults\.length/);
  });

  it('🔴 App 과 결과 화면이 같은 함수로 센다 (각자 세면 갈라진다)', () => {
    const src = stripComments(read('App.tsx'));
    expect(src).toContain('wrongWordIds(quizResults)');
    // 손으로 다시 세는 모양이 되살아나지 않게 막는다
    expect(src).not.toMatch(/new Set\([\s\S]{0,80}isCorrect/);
  });
});
