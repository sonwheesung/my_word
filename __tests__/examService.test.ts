/**
 * AI 단어 시험 검증. 저장소를 모르는 순수 함수와, 소스를 훑는 규칙 하나를 다룬다.
 *
 * 🔴 이 파일이 지키는 가장 무거운 약속:
 *    **시험은 아직 통계에 쓰지 않는다.** `quizService.saveQuizResults` 도
 *    `srsService.recordAnswers` 도 부르지 않는다.
 *
 *    기획은 *"내 단어 문제만 반영하고 재시험은 반영하지 않는다"* 로 정했는데 **재시험을 구분하는
 *    코드가 아직 없다.** 구분 못 하는 상태에서 쓰면 같은 문제를 다시 풀어 맞힌 것이 정답률을
 *    부풀린다 — 플래시카드가 막아 둔 것과 똑같은 사고이고, **크래시도 경고도 없이 숫자만 틀린다.**
 *    그래서 "안 부른다"를 기억에 맡기지 않고 아래 마지막 describe 가 소스를 읽어 확인한다.
 *
 * 두 번째 약속: **앞이 비면 뒤가 채운다.** 만기가 0개인 사용자에게 시험이 4문제만 나오면 안 된다.
 *
 * 세 번째 약속: **넘긴 문제를 분모에서 빼지 않는다.** 빼면 다 넘긴 사람이 100점이 된다.
 */

// 🚫 `tsconfig.json` 의 `types` 에 "node" 를 넣지 않는다(flashcardService.test.ts 와 같은 이유).
declare const require: (id: string) => any;
declare const __dirname: string;

const fs = require('fs') as { readFileSync(p: string, enc: string): string };
const path = require('path') as { join(...parts: string[]): string };

import {
  DEFAULT_EXAM_PREFS,
  EXAM_LANGUAGES,
  SEED_QUOTA,
  countLanguages,
  detectCategoryLanguage,
  detectLanguage,
  isExamLanguage,
  parseExamPrefs,
  parseRecords,
  pickSeeds,
  scoreExam,
  toSeedPayload,
  trimRecords,
  type ExamRecord,
} from '../src/services/examService';
import { EXAM_SEED_COUNT } from '../src/constants/appConfig';
import type { ExamQuestion } from '../src/services/commonServer/types';
import type { Word } from '../src/types/word';

// ── 거푸집 ──────────────────────────────────────────────────────────────────

let seq = 0;
function makeWord(word: string, over: Partial<Word> = {}): Word {
  seq += 1;
  return {
    wordId: seq,
    categoryId: 1,
    word,
    meanings: ['뜻'],
    examples: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...over,
  };
}

function makeQuestion(answerIndex: number, over: Partial<ExamQuestion> = {}): ExamQuestion {
  return {
    id: `q${answerIndex}-${Math.random()}`,
    word: '機会',
    axis: 'meaning',
    format: 'choice',
    prompt: '문제',
    choices: ['가', '나', '다', '라'],
    answerIndex,
    meaning: '기회',
    explanation: '해설',
    ...over,
  };
}

/** 고정 난수 — 같은 입력에 같은 순서가 나오는지 재려면 rng 가 결정적이어야 한다 */
const fixedRng = () => 0.5;

// ── 언어 판정 ───────────────────────────────────────────────────────────────

describe('detectLanguage', () => {
  it('가나가 있으면 일본어다', () => {
    expect(detectLanguage('ひらがな')).toBe('ja');
    expect(detectLanguage('カタカナ')).toBe('ja');
    // 한자와 섞여도 가나가 이긴다 — 가장 강한 신호다
    expect(detectLanguage('食べ物')).toBe('ja');
  });

  it('한글이면 한국어다', () => {
    expect(detectLanguage('사과')).toBe('ko');
  });

  it('🔴 한자 단독은 일본어로 본다 (구분 불가라 다수 사용자 쪽으로 기울인다)', () => {
    expect(detectLanguage('学校')).toBe('ja');
    expect(detectLanguage('機会')).toBe('ja');
  });

  it('로마자면 영어다', () => {
    expect(detectLanguage('apple')).toBe('en');
  });

  it('판정할 수 없으면 null 이다 — 추측으로 보내지 않는다', () => {
    expect(detectLanguage('123')).toBeNull();
    expect(detectLanguage('!!!')).toBeNull();
    expect(detectLanguage('')).toBeNull();
  });

  it('돌려주는 값은 항상 서버가 받는 코드다', () => {
    for (const text of ['ひらがな', '사과', '学校', 'apple']) {
      const got = detectLanguage(text);
      expect(got).not.toBeNull();
      expect(EXAM_LANGUAGES).toContain(got as string);
    }
  });
});

describe('isExamLanguage', () => {
  it('아는 코드만 통과시킨다 — 모르는 값을 보내면 서버가 400 이다', () => {
    expect(isExamLanguage('ja')).toBe(true);
    expect(isExamLanguage('klingon')).toBe(false);
    expect(isExamLanguage('ja-JP')).toBe(false); // BCP-47 은 서버가 모른다
    expect(isExamLanguage(undefined)).toBe(false);
    expect(isExamLanguage(null)).toBe(false);
    expect(isExamLanguage(7)).toBe(false);
  });
});

describe('detectCategoryLanguage — 기획의 엣지 케이스', () => {
  it('한 언어만 있으면 그것이다', () => {
    expect(detectCategoryLanguage([makeWord('ひらがな'), makeWord('食べ物')])).toBe('ja');
  });

  it('🔴 섞여 있으면 다수결이다 (무작위 단어를 한 카테고리에 담은 경우)', () => {
    const words = [makeWord('ひらがな'), makeWord('食べ物'), makeWord('apple'), makeWord('사과')];
    expect(detectCategoryLanguage(words)).toBe('ja');
  });

  it('저장된 language 가 글자 추정을 이긴다', () => {
    // 글자로는 일본어로 보이지만 사용자가 중국어로 저장해 둔 단어들
    const words = [
      makeWord('学校', { language: 'zh' }),
      makeWord('機会', { language: 'zh' }),
      makeWord('食べ物'),
    ];
    expect(detectCategoryLanguage(words)).toBe('zh');
  });

  it('판정할 수 없으면 null 이다 — 화면이 고르라고 한다', () => {
    expect(detectCategoryLanguage([])).toBeNull();
    expect(detectCategoryLanguage([makeWord('123'), makeWord('!!!')])).toBeNull();
  });

  it('같은 수면 항상 같은 답을 준다 (결정적)', () => {
    const words = [makeWord('ひらがな'), makeWord('apple')];
    const first = detectCategoryLanguage(words);
    for (let i = 0; i < 5; i += 1) expect(detectCategoryLanguage(words)).toBe(first);
  });
});

describe('countLanguages', () => {
  it('섞인 가지 수를 센다 — 화면이 안내를 띄울지 판단한다', () => {
    expect(countLanguages([makeWord('ひらがな'), makeWord('食べ物')])).toBe(1);
    expect(countLanguages([makeWord('ひらがな'), makeWord('apple'), makeWord('사과')])).toBe(3);
    expect(countLanguages([])).toBe(0);
  });
});

// ── 씨앗 고르기 ─────────────────────────────────────────────────────────────

describe('pickSeeds', () => {
  it('할당이 다 차면 만기 4 · 취약 3 · 무작위 3 이다', () => {
    const words = Array.from({ length: 30 }, (_, i) => makeWord(`w${i}`));
    const dueIds = words.slice(0, 8).map((w) => w.wordId);
    const weakIds = words.slice(8, 16).map((w) => w.wordId);
    const plan = pickSeeds(words, dueIds, weakIds, EXAM_SEED_COUNT, fixedRng);
    expect(plan.due).toHaveLength(SEED_QUOTA.due);
    expect(plan.weak).toHaveLength(SEED_QUOTA.weak);
    expect(plan.random).toHaveLength(SEED_QUOTA.random);
  });

  it('🔴 만기가 비면 그 몫이 뒤로 넘어간다 (이제 시작한 사용자)', () => {
    const words = Array.from({ length: 30 }, (_, i) => makeWord(`w${i}`));
    const weakIds = words.slice(0, 20).map((w) => w.wordId);
    const plan = pickSeeds(words, [], weakIds, EXAM_SEED_COUNT, fixedRng);
    expect(plan.due).toHaveLength(0);
    // 만기 4 를 못 채웠으니 취약이 3+4=7 을 가져간다
    expect(plan.weak).toHaveLength(7);
    expect(plan.random).toHaveLength(3);
    expect(plan.due.length + plan.weak.length + plan.random.length).toBe(EXAM_SEED_COUNT);
  });

  it('🔴 만기도 취약도 비면 무작위가 전부 채운다', () => {
    const words = Array.from({ length: 30 }, (_, i) => makeWord(`w${i}`));
    const plan = pickSeeds(words, [], [], EXAM_SEED_COUNT, fixedRng);
    expect(plan.random).toHaveLength(EXAM_SEED_COUNT);
  });

  it('단어가 할당보다 적으면 있는 만큼만 준다 (모자라도 던지지 않는다)', () => {
    const words = [makeWord('a'), makeWord('b')];
    const plan = pickSeeds(words, [], [], EXAM_SEED_COUNT, fixedRng);
    expect(plan.due.length + plan.weak.length + plan.random.length).toBe(2);
  });

  it('단어가 없으면 빈 계획이다', () => {
    const plan = pickSeeds([], [1, 2], [3], EXAM_SEED_COUNT, fixedRng);
    expect(plan.due.length + plan.weak.length + plan.random.length).toBe(0);
  });

  it('🔴 같은 단어를 두 번 담지 않는다 (만기이면서 취약인 단어가 흔하다)', () => {
    const words = Array.from({ length: 20 }, (_, i) => makeWord(`w${i}`));
    const overlap = words.slice(0, 10).map((w) => w.wordId);
    const plan = pickSeeds(words, overlap, overlap, EXAM_SEED_COUNT, fixedRng);
    const all = [...plan.due, ...plan.weak, ...plan.random].map((w) => w.wordId);
    expect(new Set(all).size).toBe(all.length);
  });

  it('지워진 단어의 이력이 남아 있어도 건너뛴다', () => {
    const words = [makeWord('a'), makeWord('b')];
    const plan = pickSeeds(words, [999999], [], EXAM_SEED_COUNT, fixedRng);
    expect(plan.due).toHaveLength(0);
    expect(plan.random).toHaveLength(2);
  });

  it('limit 을 넘지 않는다', () => {
    const words = Array.from({ length: 50 }, (_, i) => makeWord(`w${i}`));
    const plan = pickSeeds(words, [], [], 5, fixedRng);
    expect(plan.due.length + plan.weak.length + plan.random.length).toBe(5);
  });
});

describe('toSeedPayload', () => {
  it('뜻은 첫 번째만 보낸다', () => {
    const plan = pickSeeds([makeWord('機会', { meanings: ['기회', '찬스'] })], [], [], 10, fixedRng);
    expect(toSeedPayload(plan)).toEqual([{ word: '機会', meaning: '기회' }]);
  });

  it('뜻이 비면 키를 아예 안 보낸다', () => {
    const plan = pickSeeds([makeWord('機会', { meanings: ['   '] })], [], [], 10, fixedRng);
    expect(toSeedPayload(plan)).toEqual([{ word: '機会' }]);
  });

  it('뜻이 없는 단어도 던지지 않는다', () => {
    const plan = pickSeeds([makeWord('機会', { meanings: [] })], [], [], 10, fixedRng);
    expect(toSeedPayload(plan)).toEqual([{ word: '機会' }]);
  });
});

// ── 채점 ────────────────────────────────────────────────────────────────────

describe('scoreExam', () => {
  it('맞은 것·틀린 것·넘긴 것을 센다', () => {
    const questions = [makeQuestion(0), makeQuestion(1), makeQuestion(2), makeQuestion(3)];
    const score = scoreExam(questions, [0, 0, null, 3]);
    expect(score.correct).toBe(2);
    expect(score.wrong).toBe(1);
    expect(score.skipped).toBe(1);
    expect(score.total).toBe(4);
  });

  it('🔴 넘긴 문제를 분모에서 빼지 않는다 — 빼면 다 넘긴 사람이 100점이 된다', () => {
    const questions = [makeQuestion(0), makeQuestion(1)];
    const allSkipped = scoreExam(questions, [null, null]);
    expect(allSkipped.accuracy).toBe(0);
    const oneOfTwo = scoreExam(questions, [0, null]);
    expect(oneOfTwo.accuracy).toBe(50);
  });

  it('답이 모자라도 넘긴 것으로 센다 (배열 길이를 믿지 않는다)', () => {
    const questions = [makeQuestion(0), makeQuestion(1), makeQuestion(2)];
    const score = scoreExam(questions, [0]);
    expect(score.correct).toBe(1);
    expect(score.skipped).toBe(2);
    expect(score.total).toBe(3);
  });

  it('문제가 없으면 0 이다 (0 으로 나누지 않는다)', () => {
    expect(scoreExam([], []).accuracy).toBe(0);
  });

  it('정답률은 소수 한 자리다', () => {
    const questions = Array.from({ length: 3 }, (_, i) => makeQuestion(i % 4));
    const score = scoreExam(questions, [questions[0].answerIndex, null, null]);
    expect(score.accuracy).toBe(33.3);
  });
});

// ── 기록 ────────────────────────────────────────────────────────────────────

function makeRecord(examId: string, takenAt: string): ExamRecord {
  const questions = [makeQuestion(0)];
  return {
    examId,
    language: 'ja',
    takenAt,
    questions,
    answers: [0],
    score: scoreExam(questions, [0]),
  };
}

describe('parseRecords — 🔴 어떤 입력에도 던지지 않는다', () => {
  it('없으면 빈 배열', () => {
    expect(parseRecords(null)).toEqual([]);
    expect(parseRecords('')).toEqual([]);
  });

  it('깨진 JSON 도 빈 배열', () => {
    expect(parseRecords('{{{')).toEqual([]);
    expect(parseRecords('not json')).toEqual([]);
  });

  it('배열이 아니면 빈 배열', () => {
    expect(parseRecords('{"a":1}')).toEqual([]);
    expect(parseRecords('42')).toEqual([]);
    expect(parseRecords('null')).toEqual([]);
  });

  it('모양이 안 맞는 항은 버리고 나머지는 살린다', () => {
    const good = makeRecord('ok', '2026-10-07T00:00:00.000Z');
    const raw = JSON.stringify([good, { examId: 'bad' }, null, 42, { questions: [] }]);
    const parsed = parseRecords(raw);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].examId).toBe('ok');
  });

  it('점수가 없으면 다시 센다', () => {
    const questions = [makeQuestion(1)];
    const raw = JSON.stringify([
      { examId: 'x', takenAt: '2026-10-07T00:00:00.000Z', language: 'ja', questions, answers: [1] },
    ]);
    expect(parseRecords(raw)[0].score.correct).toBe(1);
  });
});

describe('trimRecords', () => {
  it('최신이 앞이다', () => {
    const records = [
      makeRecord('old', '2026-10-01T00:00:00.000Z'),
      makeRecord('new', '2026-10-07T00:00:00.000Z'),
    ];
    expect(trimRecords(records)[0].examId).toBe('new');
  });

  it('🔴 상한을 넘으면 오래된 것을 버린다 (백업이 끝없이 커지지 않게)', () => {
    const records = Array.from({ length: 30 }, (_, i) =>
      makeRecord(`e${i}`, `2026-10-${String((i % 28) + 1).padStart(2, '0')}T00:00:00.000Z`),
    );
    expect(trimRecords(records, 20)).toHaveLength(20);
  });

  it('상한이 0 이어도 하나는 남긴다 (빈 성적표를 만들지 않는다)', () => {
    expect(trimRecords([makeRecord('a', '2026-10-07T00:00:00.000Z')], 0)).toHaveLength(1);
  });
});

describe('parseExamPrefs — 🔴 어떤 입력에도 던지지 않는다', () => {
  it('없으면 기본값', () => {
    expect(parseExamPrefs(null)).toEqual(DEFAULT_EXAM_PREFS);
    expect(parseExamPrefs('{{{')).toEqual(DEFAULT_EXAM_PREFS);
    expect(parseExamPrefs('42')).toEqual(DEFAULT_EXAM_PREFS);
  });

  it('모르는 언어 코드는 버린다 — 서버에 400 을 받지 않기 위해', () => {
    const raw = JSON.stringify({ languageByCategory: { '1': 'ja', '2': 'klingon' } });
    const prefs = parseExamPrefs(raw);
    expect(prefs.languageByCategory).toEqual({ '1': 'ja' });
  });

  it('lastCategoryId 가 숫자가 아니면 null', () => {
    expect(parseExamPrefs(JSON.stringify({ lastCategoryId: 'x' })).lastCategoryId).toBeNull();
    expect(parseExamPrefs(JSON.stringify({ lastCategoryId: 3 })).lastCategoryId).toBe(3);
  });

  it('🔴 기본값을 돌려줄 때 공유 객체를 주지 않는다 (불러 쓴 쪽이 고치면 다음 호출이 오염된다)', () => {
    const a = parseExamPrefs(null);
    a.languageByCategory['1'] = 'ja';
    expect(parseExamPrefs(null).languageByCategory).toEqual({});
  });
});

// ── 🔴 소스를 훑어 규칙을 기계로 지킨다 ─────────────────────────────────────
//
// 플래시카드 테스트와 같은 장치다. 사람의 기억에 맡기면 다음 사람이
// "시험 점수도 통계에 넣으면 좋지 않나"로 되돌리기 쉬운 자리다.
//
// 🔴 **파일을 옮기거나 이름을 바꾸면 이 FILES 배열도 같이 고친다.**
//    안 고치면 가드가 **없는 파일을 지키면서 초록**이 된다. 그게 이 종류 테스트의 유일한 고장 방식이다.

const FILES = [
  'src/services/examService.ts',
  'src/screens/ExamSetupScreen.tsx',
  'src/screens/ExamScreen.tsx',
  'src/screens/ExamResultScreen.tsx',
];

/** 주석을 걷어낸다 — 주석에 적힌 "부르지 않는다"가 금지어로 잡히면 안 된다 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

function readSource(rel: string): string {
  return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
}

describe('🔴 시험은 아직 통계에 쓰지 않는다 (소스 훑기)', () => {
  it('훑을 파일이 실제로 존재한다 — 없는 파일을 지키며 초록이 되는 것을 막는다', () => {
    expect(FILES.length).toBeGreaterThan(0);
    for (const rel of FILES) {
      expect(() => readSource(rel)).not.toThrow();
      expect(readSource(rel).length).toBeGreaterThan(0);
    }
  });

  const FORBIDDEN = ['saveQuizResults', 'recordAnswers', 'quizResultStorage'];

  for (const rel of FILES) {
    for (const needle of FORBIDDEN) {
      it(`${rel} 에 ${needle} 가 없다`, () => {
        expect(stripComments(readSource(rel))).not.toContain(needle);
      });
    }
  }

  it('🔴 examService 는 quizService 를 읽기로만 쓴다 (취약 단어 조회)', () => {
    const source = stripComments(readSource('src/services/examService.ts'));
    // 읽기 하나만 허용한다. 다른 quizService 호출이 생기면 여기서 걸린다.
    const calls = source.match(/quizService\.\w+/g) ?? [];
    expect(new Set(calls)).toEqual(new Set(['quizService.getWeakWordIds']));
  });

  it('🔴 examService 는 srsService 를 읽기로만 쓴다 (만기 조회)', () => {
    const source = stripComments(readSource('src/services/examService.ts'));
    const calls = source.match(/srsService\.\w+/g) ?? [];
    expect(new Set(calls)).toEqual(new Set(['srsService.getDueWordIds']));
  });
});
