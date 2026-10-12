/**
 * 서버 복구 — 서버가 준 줄을 기기 모양으로 옮기는 부분을 전수로 본다.
 *
 * 🔴 이 파일이 지키는 가장 무거운 약속: **복구는 사용자가 고른 순간에만 돈다.**
 *    `syncService`(부팅마다 조용히 도는 쪽)에서 이 서비스를 부르면 FAIL 한다 —
 *    자동 경로가 기기를 덮어쓰는 사고는 조용하고, 사용자는 단어가 사라진 것으로 겪는다.
 *
 * 🔴 두 번째 약속: **빈 것으로 기기를 덮지 않는다.** 서버가 0개를 돌려줬을 때 그대로 덮으면
 *    그건 복구가 아니라 삭제다. 네트워크가 반쯤 되는 상태에서 실제로 일어날 수 있다.
 *
 * ⚠ 서버가 주는 `meanings`·`questions`·`attempts`·`score` 는 **JSON 문자열**이다(서버가
 *   해석하지 않고 그대로 보관한다). 그걸 안 풀면 화면이 `"[\"사과\"]"` 를 뜻으로 보여 준다.
 */

declare const require: (id: string) => any;
declare const __dirname: string;

const fs = require('fs') as { readFileSync(p: string, enc: string): string };
const path = require('path') as { join(...parts: string[]): string };

import {
  nextIdFor,
  toCategories,
  toExams,
  toResults,
  toWords,
} from '../src/services/restoreService';

describe('toWords — 서버가 준 단어를 기기 모양으로', () => {
  it('JSON 문자열로 온 뜻을 푼다', () => {
    const [w] = toWords([
      {
        wordId: 101,
        categoryId: 1,
        word: 'apple',
        meanings: '["사과","애플"]',
        language: 'en',
        createdAt: '2026-10-01T00:00:00.000Z',
        updatedAt: '2026-10-02T00:00:00.000Z',
      },
    ]);
    expect(w.meanings).toEqual(['사과', '애플']);
    expect(w.word).toBe('apple');
    expect(w.language).toBe('en');
  });

  it('배열로 와도 받는다 — 서버 모양이 바뀌어도 깨지지 않는다', () => {
    expect(toWords([{ wordId: 1, categoryId: 1, meanings: ['물'] }])[0].meanings).toEqual(['물']);
  });

  it('⚠ 예문·태그·메모는 빈 값이다 — 서버에 없다', () => {
    const [w] = toWords([{ wordId: 1, categoryId: 1, word: 'a' }]);
    expect(w.examples).toEqual([]);
    expect(w.tags).toEqual([]);
    expect(w.memo).toBe('');
  });

  it('🔴 id 가 없는 줄은 버린다 — 반쯤 복원된 단어를 만들지 않는다', () => {
    expect(toWords([{ word: 'no-id' }, { wordId: 1 }, { wordId: 2, categoryId: 1 }])).toHaveLength(
      1,
    );
  });

  it('🔴 language 가 없으면 키를 아예 안 넣는다', () => {
    const [w] = toWords([{ wordId: 1, categoryId: 1, language: null }]);
    expect('language' in w).toBe(false);
  });

  it('updatedAt 이 없으면 createdAt 으로 메운다 — 밀기 커서가 빈 문자열을 못 쓴다', () => {
    const [w] = toWords([{ wordId: 1, categoryId: 1, createdAt: '2026-01-01T00:00:00.000Z' }]);
    expect(w.updatedAt).toBe('2026-01-01T00:00:00.000Z');
  });

  it('어떤 쓰레기에도 던지지 않는다', () => {
    expect(() => toWords([null, 42, 'x', [], { wordId: 'a' }] as unknown[])).not.toThrow();
    expect(toWords([null, 42, 'x'] as unknown[])).toEqual([]);
  });
});

describe('toCategories', () => {
  it('설명이 비면 키를 안 넣는다', () => {
    const [c] = toCategories([{ categoryId: 1, categoryName: '영어', description: null }]);
    expect('description' in c).toBe(false);
    expect(c.displayOrder).toBe(0);
  });

  it('순서를 그대로 옮긴다', () => {
    const [c] = toCategories([{ categoryId: 2, categoryName: '일본어', displayOrder: 5 }]);
    expect(c).toMatchObject({ categoryId: 2, categoryName: '일본어', displayOrder: 5 });
  });

  it('id 가 없으면 버린다', () => {
    expect(toCategories([{ categoryName: '없음' }])).toEqual([]);
  });
});

describe('toResults', () => {
  it('정답 여부를 불린으로 받는다', () => {
    const rows = toResults([
      { resultId: 1, wordId: 101, isCorrect: true, quizType: 'multiple', takenAt: 'T' },
      { resultId: 2, wordId: 101, isCorrect: false, quizType: 'multiple', takenAt: 'T' },
    ]);
    expect(rows.map((r) => r.isCorrect)).toEqual([true, false]);
  });

  it('🔴 isCorrect 가 문자열이면 오답으로 본다 — 틀린 것을 맞다고 세지 않는다', () => {
    /*
     * 정답률이 부풀는 쪽보다 깎이는 쪽이 덜 나쁘다. 부풀면 사용자가 자기 실력을 잘못 알고,
     * 그 숫자로 복습을 그만둔다(플래시카드 절이 같은 이유로 채점을 거부한다).
     */
    expect(toResults([{ resultId: 1, wordId: 1, isCorrect: 'true', takenAt: 'T' }])[0].isCorrect).toBe(
      false,
    );
  });

  it('⚠ 내가 쓴 답은 서버에 없다 — 키가 아예 없다', () => {
    const [r] = toResults([{ resultId: 1, wordId: 1, takenAt: 'T' }]);
    expect('userAnswer' in r).toBe(false);
    expect('correctAnswer' in r).toBe(false);
    expect('word' in r).toBe(false);
  });

  it('quizType 이 없으면 unknown — 통계가 키로 쪼개다 빈 문자열을 만들지 않는다', () => {
    expect(toResults([{ resultId: 1, wordId: 1, takenAt: 'T' }])[0].quizType).toBe('unknown');
  });
});

describe('toExams — 회차가 진실이다', () => {
  it('JSON 문자열 셋을 전부 푼다', () => {
    const [e] = toExams([
      {
        examId: 'e1',
        language: 'en',
        takenAt: 'T',
        questions: '[{"q":"1"}]',
        attempts: '[{"score":{"correct":3}}]',
        score: '{"correct":3,"total":5}',
      },
    ]) as Array<Record<string, unknown>>;
    expect(e.questions).toEqual([{ q: '1' }]);
    expect(e.attempts).toEqual([{ score: { correct: 3 } }]);
    expect(e.score).toEqual({ correct: 3, total: 5 });
  });

  it('깨진 JSON 이면 빈 값 — 성적표 한 판 때문에 복구가 멈추지 않는다', () => {
    const [e] = toExams([{ examId: 'e1', questions: '{{{', score: 'nope' }]) as Array<
      Record<string, unknown>
    >;
    expect(e.questions).toEqual([]);
    expect(e.score).toEqual({});
  });

  it('examId 가 없으면 버린다', () => {
    expect(toExams([{ language: 'en' }])).toEqual([]);
  });
});

describe('🔴 nextIdFor — 이 한 줄을 틀리면 조용히 망가진다', () => {
  it('셋 중 가장 큰 id + 1', () => {
    expect(
      nextIdFor(
        [{ wordId: 10 }] as never,
        [{ categoryId: 777 }] as never,
        [{ resultId: 120 }] as never,
      ),
    ).toBe(778);
  });

  it('🔴 퀴즈 결과의 id 도 센다 — 같은 카운터를 쓴다', () => {
    /*
     * `resultId` 를 빼고 세면 다음에 추가하는 단어가 이미 쓰인 id 를 받고,
     * **기존 퀴즈 결과가 그 새 단어에 붙는다.** 정답률이 엉뚱한 단어에 표시되고 오류는 안 난다.
     */
    expect(nextIdFor([{ wordId: 3 }] as never, [], [{ resultId: 5000 }] as never)).toBe(5001);
  });

  it('전부 비면 1', () => {
    expect(nextIdFor([], [], [])).toBe(1);
  });
});

// ── 🔴 소스를 훑어 규칙을 기계로 지킨다 ─────────────────────────────────────

const read = (rel: string): string => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
const stripComments = (src: string): string =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/\/\/[^\n]*/g, (m) => ' '.repeat(m.length));

describe('🔴 복구는 자동으로 돌지 않는다 (소스 훑기)', () => {
  it('⚠ 가드가 실제로 읽었다', () => {
    expect(read('src/services/restoreService.ts')).toContain('export const restoreService');
    expect(read('src/services/syncService.ts')).toContain('export const syncService');
  });

  it('🔴 밀기 쪽이 복구를 부르지 않는다', () => {
    const src = stripComments(read('src/services/syncService.ts'));
    expect(src).not.toContain('restoreService');
    expect(src).not.toContain('syncPull');
    expect(src).not.toContain('syncCounts');
  });

  it('🔴 복구가 저장을 베끼지 않는다 — backupService 에 맡긴다', () => {
    /*
     * 한 트랜잭션으로 넣고 · `nextId` 를 마지막에 쓰고 · 복습 만기 캐시를 끊는 셋을
     * 여기서 다시 구현하면 **그중 하나를 빠뜨린다.**
     */
    const src = stripComments(read('src/services/restoreService.ts'));
    expect(src).toContain('backupService.restore');
    for (const banned of ['backupRepo', 'writeRaw', 'wordStorage', 'categoryStorage']) {
      expect(src).not.toContain(banned);
    }
  });

  it('🔴 빈 것으로 기기를 덮지 않는다', () => {
    const src = stripComments(read('src/services/restoreService.ts'));
    expect(src).toContain("reason: 'empty'");
  });

  it('🔴 당기는 루프에 상한이 있다 — 서버가 커서를 잘못 줘도 멈춘다', () => {
    const src = stripComments(read('src/services/restoreService.ts'));
    expect(src).toMatch(/MAX_PAGES\s*=\s*\d+/);
    expect(src).toContain('page < MAX_PAGES');
    // 커서가 앞으로 가지 않으면 멈춘다
    expect(src).toContain('res.nextAfter <= after');
  });
});
