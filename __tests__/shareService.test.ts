/**
 * CSV 내보내기/가져오기 회귀 테스트
 *
 * 배경: 내보내기는 줄바꿈이 포함된 필드를 큰따옴표로 감싸는데,
 * 파서가 파싱 전에 '\n' 으로 줄을 먼저 쪼개는 바람에
 * 자기가 내보낸 CSV 를 자기가 못 읽고 내용이 잘려 나갔다.
 */

import { shareService } from '../src/services/shareService';
import type { Word } from '../src/types/word';

function makeWord(overrides: Partial<Word> = {}): Word {
  return {
    wordId: 1,
    categoryId: 1,
    word: 'resilient',
    meanings: ['회복력 있는', '탄력적인'],
    examples: [{ example: 'She is resilient.', translation: '그녀는 회복력이 있다.' }],
    tags: ['형용사'],
    memo: '',
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('shareService — 라운드트립', () => {
  it('메모에 줄바꿈이 있어도 원본 그대로 복원된다', () => {
    const memo = '어원: re + salire\n시험에 자주 나옴';
    const csv = shareService.exportWordsToCSV([makeWord({ memo })]);
    const result = shareService.parseCSV(csv);

    expect(result.errors).toHaveLength(0);
    expect(result.success).toHaveLength(1);
    expect(result.success[0].word).toBe('resilient');
    expect(result.success[0].memo).toBe(memo);
    expect(result.success[0].meanings).toEqual(['회복력 있는', '탄력적인']);
  });

  it('예문에 줄바꿈이 있어도 원본 그대로 복원된다', () => {
    const example = 'Check the ledger.\nThen sign it.';
    const csv = shareService.exportWordsToCSV([
      makeWord({ word: 'ledger', examples: [{ example, translation: '원장을 확인해라.' }] }),
    ]);
    const result = shareService.parseCSV(csv);

    expect(result.errors).toHaveLength(0);
    expect(result.success[0].examples[0].example).toBe(example);
    expect(result.success[0].examples[0].translation).toBe('원장을 확인해라.');
  });

  it('줄바꿈이 섞인 여러 단어를 개별 레코드로 정확히 분리한다', () => {
    const words = [
      makeWord({ wordId: 1, word: 'alpha', memo: '첫째 줄\n둘째 줄' }),
      makeWord({ wordId: 2, word: 'beta', memo: '' }),
      makeWord({ wordId: 3, word: 'gamma', memo: 'A\nB\nC' }),
    ];
    const result = shareService.parseCSV(shareService.exportWordsToCSV(words));

    expect(result.errors).toHaveLength(0);
    expect(result.success.map((w) => w.word)).toEqual(['alpha', 'beta', 'gamma']);
    expect(result.success[2].memo).toBe('A\nB\nC');
  });

  it('콤마와 큰따옴표가 섞인 필드도 복원된다', () => {
    const memo = '이른바 "탄력", 즉 회복';
    const result = shareService.parseCSV(
      shareService.exportWordsToCSV([makeWord({ memo })]),
    );
    expect(result.success[0].memo).toBe(memo);
  });
});

describe('shareService — 라운드트립 퍼즈', () => {
  /** 재현 가능한 의사난수 (mulberry32) */
  function makeRandom(seed: number) {
    let state = seed;
    return () => {
      state |= 0;
      state = (state + 0x6d2b79f5) | 0;
      let t = Math.imul(state ^ (state >>> 15), 1 | state);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // '|' 는 뜻/태그/예문 구분자, '::' 는 예문-번역 구분자라 포맷상 제외한다.
  const ALPHABET = ['a', 'Z', '가', '힣', ',', '"', '\n', ' ', ':', ';', '.', '!', '\t', '9'];

  /** 앞뒤 공백이 없고 비어있지 않은 랜덤 문자열 */
  function randomField(rand: () => number, maxLength: number): string {
    const length = 1 + Math.floor(rand() * maxLength);
    let out = '';
    for (let i = 0; i < length; i++) {
      out += ALPHABET[Math.floor(rand() * ALPHABET.length)];
    }
    out = out.trim();
    return out.length > 0 ? out : 'x';
  }

  /**
   * 예문/번역은 '::' 로 이어붙여 저장하므로 본문에 콜론이 연달아 나오거나
   * 경계에 콜론이 붙으면 구분자와 뒤섞여 분리 위치가 어긋난다.
   * 포맷 자체의 한계이므로(아래 '알려진 한계' 참조) 퍼즈 대상에서 제외한다.
   */
  function sanitizeExampleField(value: string): string {
    // 콜론을 정리하면 공백이 다시 노출될 수 있으므로 안정될 때까지 반복한다
    let out = value;
    let previous = '';
    while (out !== previous) {
      previous = out;
      out = out
        .replace(/::+/g, ':') // 연속 콜론 → 단일 콜론
        .replace(/^:+|:+$/g, '') // 경계 콜론 제거
        .trim();
    }
    return out || 'x';
  }

  it('무작위 필드 200건이 내보내기→가져오기 후 동일하게 복원된다', () => {
    const rand = makeRandom(20260805);

    for (let iteration = 0; iteration < 200; iteration++) {
      const word = makeWord({
        word: randomField(rand, 12),
        meanings: [randomField(rand, 10), randomField(rand, 10)],
        examples: [
          {
            example: sanitizeExampleField(randomField(rand, 20)),
            translation: sanitizeExampleField(randomField(rand, 20)),
          },
        ],
        tags: [randomField(rand, 6)],
        memo: randomField(rand, 25),
      });

      const result = shareService.parseCSV(shareService.exportWordsToCSV([word]));

      expect(result.errors).toHaveLength(0);
      expect(result.success).toHaveLength(1);
      expect(result.success[0].word).toBe(word.word);
      expect(result.success[0].meanings).toEqual(word.meanings);
      expect(result.success[0].tags).toEqual(word.tags);
      expect(result.success[0].memo).toBe(word.memo);
      expect(result.success[0].examples).toEqual(word.examples);
    }
  });

  it('무작위 단어 50개를 한 번에 내보내도 경계가 어긋나지 않는다', () => {
    const rand = makeRandom(1234);
    const words = Array.from({ length: 50 }, (_, i) =>
      makeWord({
        wordId: i + 1,
        word: randomField(rand, 12),
        meanings: [randomField(rand, 10)],
        examples: [],
        tags: [],
        memo: randomField(rand, 30),
      }),
    );

    const result = shareService.parseCSV(shareService.exportWordsToCSV(words));

    expect(result.errors).toHaveLength(0);
    expect(result.success).toHaveLength(50);
    expect(result.success.map((w) => w.memo)).toEqual(words.map((w) => w.memo));
  });
});

describe('shareService — 기존 사용자 데이터 호환', () => {
  it('구버전이 내보낸 단일 행 CSV 도 그대로 파싱된다', () => {
    const legacy = '단어,뜻,예문,태그,메모\nresilient,회복력 있는|탄력적인,She is resilient.::그녀는 회복력이 있다.,형용사,암기 필요';
    const result = shareService.parseCSV(legacy);

    expect(result.errors).toHaveLength(0);
    expect(result.success).toHaveLength(1);
    expect(result.success[0].memo).toBe('암기 필요');
    expect(result.success[0].tags).toEqual(['형용사']);
  });

  it('헤더 없는 CSV 도 파싱된다', () => {
    const result = shareService.parseCSV('apple,사과\nbanana,바나나');
    expect(result.success.map((w) => w.word)).toEqual(['apple', 'banana']);
  });

  it('CRLF 줄바꿈을 쓰는 CSV 도 파싱된다', () => {
    const result = shareService.parseCSV('단어,뜻\r\napple,사과\r\nbanana,바나나');
    expect(result.errors).toHaveLength(0);
    expect(result.success.map((w) => w.word)).toEqual(['apple', 'banana']);
  });
});

describe('shareService — 예문 구분자', () => {
  it("예문/번역에 '::' 가 있어도 내용을 버리지 않는다", () => {
    const result = shareService.parseCSV('단어,뜻,예문\nratio,비율,A::B::C');

    expect(result.success[0].examples).toHaveLength(1);
    // 첫 '::' 가 구분자, 나머지는 전부 번역으로 보존
    expect(result.success[0].examples[0].example).toBe('A');
    expect(result.success[0].examples[0].translation).toBe('B::C');
  });

  it('번역이 없는 예문은 translation 이 undefined 다', () => {
    const result = shareService.parseCSV('단어,뜻,예문\nratio,비율,A plain example');
    expect(result.success[0].examples[0].example).toBe('A plain example');
    expect(result.success[0].examples[0].translation).toBeUndefined();
  });

  /**
   * 알려진 한계 — 예문이 콜론으로 끝나면 구분자 '::' 와 붙어 ':::' 가 되고
   * 분리 위치가 한 글자 어긋난다. 포맷이 '::' 를 이스케이프하지 않기 때문이며,
   * 해결하려면 내보내기 포맷을 바꿔야 해서 구버전 앱 호환이 깨진다.
   * 최소한 내용이 유실되지는 않는다는 점을 고정해 둔다.
   */
  it('예문이 콜론으로 끝나면 경계가 밀리지만 내용은 유실되지 않는다', () => {
    const csv = shareService.exportWordsToCSV([
      makeWord({ examples: [{ example: '다음을 보라:', translation: '주의' }] }),
    ]);
    const parsed = shareService.parseCSV(csv).success[0].examples[0];

    expect(parsed.example).toBe('다음을 보라');
    expect(parsed.translation).toBe(':주의');
    expect(`${parsed.example}${parsed.translation}`).toBe('다음을 보라:주의');
  });
});

describe('shareService — 검증 및 에러 리포트', () => {
  it('단어/뜻이 비면 에러로 분류한다', () => {
    const result = shareService.parseCSV('단어,뜻\n,뜻만있음\napple,\nbanana,바나나');

    expect(result.success.map((w) => w.word)).toEqual(['banana']);
    expect(result.errors).toHaveLength(2);
    expect(result.errors[0].reason).toBe('단어가 비어있습니다');
    expect(result.errors[1].reason).toBe('뜻이 비어있습니다');
  });

  it('여러 줄 필드 뒤의 에러 행도 실제 줄 번호로 보고한다', () => {
    const csv = '단어,뜻,예문,태그,메모\nalpha,알파,,,"첫째 줄\n둘째 줄"\n,뜻만있음';
    const result = shareService.parseCSV(csv);

    expect(result.success).toHaveLength(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].line).toBe(4); // 여러 줄 레코드를 건너뛴 실제 물리 줄
  });

  it('따옴표가 닫히지 않아도 뒤쪽 줄을 통째로 삼키지 않는다', () => {
    // 손으로 쓴 CSV 에 홀수 개의 따옴표가 섞인 경우
    const csv = '단어,뜻\nbolt,5" 나사\napple,사과\nbanana,바나나';
    const result = shareService.parseCSV(csv);

    expect(result.success.map((w) => w.word)).toEqual(['bolt', 'apple', 'banana']);
  });

  it('빈 입력은 빈 결과를 돌려준다', () => {
    expect(shareService.parseCSV('')).toEqual({ success: [], errors: [] });
    expect(shareService.parseCSV('   \n  \n ')).toEqual({ success: [], errors: [] });
  });
});
