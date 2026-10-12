import { parseLastCategory, pickDefaultCategory } from '../src/services/categoryService';
import type { Category } from '../src/types/word';

// ⚠ 이 저장소의 소스검사 테스트가 쓰는 모양 그대로다(`quizOrder.test.ts`).
//   `node:fs` 로 쓰면 `npx tsc --noEmit` 이 타입을 못 찾는다 — jest 는 babel 이라 그냥 돈다.
declare const __dirname: string;
const fs = require('fs') as { readFileSync(p: string, enc: string): string };
const path = require('path') as { join(...parts: string[]): string };

/**
 * 🔴 **단어 추가 화면이 매번 첫 카테고리로 되돌아가던 결함**(2026-10-12 사장님 제보).
 *
 * 화면 *안에서는* 저장 뒤에도 카테고리를 유지했는데(시안 #11), 화면을 나갔다 들어오면
 * `categories[0]` 이었다. 두 번째 카테고리를 주로 쓰는 사람은 **단어마다 매번 다시 골라야 했다.**
 */

const cat = (categoryId: number, categoryName: string): Category => ({
  categoryId,
  categoryName,
  displayOrder: categoryId,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
});

const CATS = [cat(1, '토익 필수'), cat(2, '일본어'), cat(3, '생활 영어')];

describe('pickDefaultCategory', () => {
  it('마지막에 쓴 것이 아직 있으면 그것을 고른다', () => {
    expect(pickDefaultCategory(CATS, 2)).toBe(2);
    expect(pickDefaultCategory(CATS, 3)).toBe(3);
  });

  it('🔴 첫 번째로 되돌아가지 않는다 — 이 결함의 본체다', () => {
    // 고친 것: 2 를 쓰고 나갔다 들어오면 2 여야 한다. 버그였다면 1 이 나온다
    expect(pickDefaultCategory(CATS, 2)).not.toBe(CATS[0].categoryId);
  });

  it('한 번도 안 썼으면 첫 번째', () => {
    expect(pickDefaultCategory(CATS, null)).toBe(1);
  });

  it('🔴 지워진 카테고리였으면 첫 번째로 되돌린다', () => {
    // 없는 id 를 그대로 돌려주면 화면이 「카테고리 선택」인 채 멈추고
    // 저장이 "카테고리를 선택해주세요" 로 막힌다 — 사용자는 뭘 안 골랐는지 모른다
    expect(pickDefaultCategory(CATS, 99)).toBe(1);
  });

  it('카테고리가 하나도 없으면 null', () => {
    expect(pickDefaultCategory([], 2)).toBeNull();
    expect(pickDefaultCategory([], null)).toBeNull();
  });

  it('순서가 바뀌어도 id 로 찾는다 (배열 위치에 기대지 않는다)', () => {
    const reordered = [cat(3, '생활 영어'), cat(1, '토익 필수'), cat(2, '일본어')];
    expect(pickDefaultCategory(reordered, 2)).toBe(2);
    expect(pickDefaultCategory(reordered, null)).toBe(3);
  });
});

describe('parseLastCategory — 어떤 입력에도 던지지 않는다', () => {
  it.each([
    [null, null],
    ['', null],
    ['2', 2],
    ['  3  ', 3],
    ['0', null],
    ['-1', null],
    ['1.5', null],
    ['abc', null],
    ['{}', null],
    ['NaN', null],
    ['Infinity', null],
  ])('%p → %p', (raw, expected) => {
    expect(parseLastCategory(raw as string | null)).toBe(expected);
  });
});

/**
 * 🔴 **순수 함수 테스트는 「화면이 그걸 부르는가」를 못 잡는다.**
 *    위를 전부 통과시키면서 `AddWordScreen` 이 여전히 `data[0]` 을 쓰면 결함은 그대로다.
 *    이 프로젝트에서 변이 테스트가 두 번 샌 자리라 소스를 직접 읽는다.
 *
 * ⚠ 주석은 걷어낸다 — **내 주석이 옛 코드를 인용**하고 있어서, 안 걷으면 가드가 통과한다.
 */
describe('AddWordScreen 이 실제로 쓰는가 (소스 검사)', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'screens', 'AddWordScreen.tsx'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');

  it('pickDefaultCategory 로 기본값을 고른다', () => {
    expect(src).toMatch(/setSelectedCategoryId\(\s*pickDefaultCategory\(/);
  });

  it('🔴 data[0] 로 되돌아가는 줄이 남아 있지 않다', () => {
    expect(src).not.toMatch(/setSelectedCategoryId\(\s*data\[0\]/);
  });

  it('저장에 성공하면 그 카테고리를 기억한다', () => {
    expect(src).toMatch(/saveLastCategoryId\(\s*selectedCategoryId\s*\)/);
  });

  it('⚠ 수정 모드는 그 단어의 카테고리를 쓴다 — 기본값이 덮지 않는다', () => {
    expect(src).toMatch(/setSelectedCategoryId\(wordData\.categoryId\)/);
  });
});
