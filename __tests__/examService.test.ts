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
  countWordsInLanguage,
  detectCategoryLanguage,
  detectLanguage,
  isExamLanguage,
  parseExamPrefs,
  parseExamProgress,
  parseRecords,
  collectNewWords,
  pickSeeds,
  scoreExam,
  toSeedPayload,
  trimRecords,
  type ExamAnswer,
  type ExamRecord,
} from '../src/services/examService';
import {
  EXAM_SEED_COUNT,
  EXAM_SIZE,
  QUESTIONS_PER_WORD,
  WORDS_FOR_FULL_EXAM,
} from '../src/constants/appConfig';
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
    attempts: [{ answers: [0], score: scoreExam(questions, [0]), takenAt }],
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
    expect(parseRecords(raw)[0].attempts[0].score.correct).toBe(1);
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
  'src/screens/ExamHistoryScreen.tsx',
];

/** 주석을 걷어낸다 — 주석에 적힌 "부르지 않는다"가 금지어로 잡히면 안 된다 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

function readSource(rel: string): string {
  return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
}

describe('🔴 화면은 통계를 쓰지 않는다 (소스 훑기)', () => {
  /*
   * 🔴 **이 describe 는 2026-10-07 Phase 5 에서 규칙이 바뀌어 갱신됐다.**
   *
   *    전에는 "examService 와 화면 넷 전부 통계를 안 쓴다" 였다. 재시험을 구분할 수 없었기
   *    때문이다. 이제 회차 구조가 생겨 1회차를 구분할 수 있으므로 `recordFirstAttempt` 한 곳만
   *    통계를 쓴다. **옛 검사가 빨개져서 이 갱신이 일어났다** — 가드가 제 일을 한 것이다
   *    (common_server CLAUDE.md 의 "진화형 가드 결함": 제품이 바뀌었는데 검사를 같이 안 고치는 것).
   *
   * 🔴 **파일을 옮기거나 이름을 바꾸면 FILES 배열도 같이 고친다.**
   *    안 고치면 가드가 없는 파일을 지키면서 초록이 된다.
   */
  it('훑을 파일이 실제로 존재한다', () => {
    expect(FILES.length).toBeGreaterThan(0);
    for (const rel of FILES) {
      expect(() => readSource(rel)).not.toThrow();
      expect(readSource(rel).length).toBeGreaterThan(0);
    }
  });

  const FORBIDDEN = ['saveQuizResults', 'recordAnswers', 'quizResultStorage'];
  const SCREENS = FILES.filter((f) => f.includes('/screens/'));

  for (const rel of SCREENS) {
    for (const needle of FORBIDDEN) {
      it(`${rel} 에 ${needle} 가 없다`, () => {
        expect(stripComments(readSource(rel))).not.toContain(needle);
      });
    }
  }

  it('🔴 examService 는 quizService 를 읽기로만 쓴다 (취약 단어 조회)', () => {
    const source = stripComments(readSource('src/services/examService.ts'));
    const calls = source.match(/quizService\.\w+/g) ?? [];
    expect(new Set(calls)).toEqual(new Set(['quizService.getWeakWordIds']));
  });

  it('🔴 examService 가 srsService 에 쓰는 것은 recordAnswers 하나뿐이다', () => {
    const source = stripComments(readSource('src/services/examService.ts'));
    const calls = source.match(/srsService\.\w+/g) ?? [];
    expect(new Set(calls)).toEqual(new Set(['srsService.getDueWordIds', 'srsService.recordAnswers']));
  });
});

// ── 단어 담기 ───────────────────────────────────────────────────────────────

describe('🔴 collectNewWords — 시험이 단어장을 키운다', () => {
  const q = (word: string, choices: string[], answerIndex: number): ExamQuestion =>
    makeQuestion(answerIndex, { word, choices, id: `q-${word}-${choices.join('')}` });

  it('오답 보기를 후보로 준다', () => {
    const got = collectNewWords([q('機会', ['時代', '場所', '機会', '手段'], 2)], ['機会']);
    expect(got).toEqual(['時代', '場所', '手段']);
  });

  it('🔴 정답은 후보가 아니다 (그 문제의 단어이고 이미 갖고 있다)', () => {
    const got = collectNewWords([q('機会', ['機会', 'a', 'b', 'c'], 0)], []);
    expect(got).not.toContain('機会');
  });

  it('🔴 시험이 물은 단어는 빼준다 — 내 단어장에서 온 것이다', () => {
    // 遠慮 가 다른 문제의 오답 보기로 나와도, 그게 내 단어면 후보가 아니다
    const got = collectNewWords(
      [q('機会', ['遠慮', 'x', 'y', 'z'], 1), q('遠慮', ['a', 'b', 'c', '遠慮'], 3)],
      [],
    );
    expect(got).not.toContain('遠慮');
  });

  it('이미 가진 단어는 빼준다', () => {
    const got = collectNewWords([q('機会', ['機械', '危機', '期間', '機会'], 3)], ['機会', '機械']);
    expect(got).toEqual(['危機', '期間']);
  });

  it('중복을 걷고 나온 순서를 지킨다', () => {
    const got = collectNewWords(
      [q('a', ['첫째', '둘째', 'a', '셋째'], 2), q('b', ['둘째', '넷째', 'b', '첫째'], 2)],
      [],
    );
    expect(got).toEqual(['첫째', '둘째', '셋째', '넷째']);
  });

  it('공백만 있는 보기는 버린다', () => {
    expect(collectNewWords([q('a', ['  ', 'ok', 'a', ''], 2)], [])).toEqual(['ok']);
  });

  it('앞뒤 공백이 있어도 이미 가진 것으로 본다', () => {
    expect(collectNewWords([q('a', [' 機会 ', 'x', 'a', 'y'], 2)], ['機会'])).not.toContain('機会');
  });

  it('문제가 없으면 빈 배열', () => {
    expect(collectNewWords([], ['機会'])).toEqual([]);
  });

  it('answerIndex 가 범위를 벗어나도 던지지 않는다', () => {
    expect(() => collectNewWords([q('a', ['x', 'y', 'a', 'z'], 99)], [])).not.toThrow();
  });
});

describe('ExamRecord 에 categoryId', () => {
  it('있으면 보존된다', () => {
    const rec = { ...makeRecord('c', '2026-10-07T00:00:00.000Z'), categoryId: 7 };
    expect(parseRecords(JSON.stringify([rec]))[0].categoryId).toBe(7);
  });

  it('🔴 없어도 열린다 — 이 필드가 생기기 전에 친 시험', () => {
    const old = makeRecord('old', '2026-10-01T00:00:00.000Z');
    const parsed = parseRecords(JSON.stringify([old]));
    expect(parsed).toHaveLength(1);
    expect(parsed[0].categoryId).toBeUndefined();
  });

  it('숫자가 아니면 없는 것으로 본다', () => {
    const rec = { ...makeRecord('x', '2026-10-07T00:00:00.000Z'), categoryId: 'nope' };
    expect(parseRecords(JSON.stringify([rec]))[0].categoryId).toBeUndefined();
  });
});

// ── 재시험 · 성적표 (Phase 5) ───────────────────────────────────────────────

describe('🔴 회차 — 옛 기록을 1회차로 옮긴다', () => {
  it('옛 모양(answers·score 가 기록에 직접)이 1회차가 된다', () => {
    const questions = [makeQuestion(1)];
    const raw = JSON.stringify([
      { examId: 'old', takenAt: '2026-10-01T00:00:00.000Z', language: 'ja', questions, answers: [1] },
    ]);
    const parsed = parseRecords(raw);
    expect(parsed[0].attempts).toHaveLength(1);
    expect(parsed[0].attempts[0].answers).toEqual([1]);
    expect(parsed[0].attempts[0].score.correct).toBe(1);
    expect(parsed[0].attempts[0].takenAt).toBe('2026-10-01T00:00:00.000Z');
  });

  it('새 모양(attempts)은 그대로 읽는다', () => {
    const questions = [makeQuestion(0)];
    const raw = JSON.stringify([
      {
        examId: 'n', takenAt: '2026-10-01T00:00:00.000Z', language: 'ja', questions,
        attempts: [
          { answers: [0], takenAt: '2026-10-01T00:00:00.000Z' },
          { answers: [1], takenAt: '2026-10-02T00:00:00.000Z' },
        ],
      },
    ]);
    const parsed = parseRecords(raw);
    expect(parsed[0].attempts).toHaveLength(2);
    expect(parsed[0].attempts[0].score.correct).toBe(1);
    expect(parsed[0].attempts[1].score.correct).toBe(0);
  });

  it('회차에 점수가 없으면 다시 센다', () => {
    const questions = [makeQuestion(2)];
    const raw = JSON.stringify([
      { examId: 'x', takenAt: '2026-10-01T00:00:00.000Z', language: 'ja', questions, attempts: [{ answers: [2] }] },
    ]);
    expect(parseRecords(raw)[0].attempts[0].score.correct).toBe(1);
  });

  it('깨진 회차는 버리고 나머지는 살린다', () => {
    const questions = [makeQuestion(0)];
    const raw = JSON.stringify([
      {
        examId: 'x', takenAt: '2026-10-01T00:00:00.000Z', language: 'ja', questions,
        attempts: [{ answers: [0] }, null, 42, { noAnswers: true }],
      },
    ]);
    expect(parseRecords(raw)[0].attempts).toHaveLength(1);
  });

  it('🔴 빈 answers 를 회차로 만들지 않는다 — 아직 안 푼 기록이 「최고 0%」가 된다', () => {
    /*
     * SQLite 는 옛 칸 `answers` 를 **언제나 `'[]'`** 로 적는다(`db/repo.ts`). 그래서
     * 「문제만 받아 둔 판」(`attempts: []`)이 여기로 떨어지면 0점짜리 1회차가 생기고,
     * 성적표가 *다 틀렸다*로 읽히는 「최고 0%」를 그린다. 2026-10-15 에뮬레이터에서 실제로 봤다.
     */
    const raw = JSON.stringify([
      {
        examId: 'unplayed', takenAt: '2026-10-15T00:00:00.000Z', language: 'ja',
        questions: [makeQuestion(0), makeQuestion(1)], attempts: [], answers: [], score: {},
      },
    ]);
    expect(parseRecords(raw)[0].attempts).toEqual([]);
  });

  it('회차도 answers 도 없으면 그 기록을 버린다', () => {
    const raw = JSON.stringify([
      { examId: 'x', takenAt: '2026-10-01T00:00:00.000Z', language: 'ja', questions: [makeQuestion(0)] },
    ]);
    // 회차가 0개면 성적표에 보여줄 것이 없다 — 기록 자체는 살리되 회차는 비어 있다
    const parsed = parseRecords(raw);
    expect(parsed[0].attempts).toEqual([]);
  });
});

// ── 🔴 통계는 1회차만 (소스 훑기) ───────────────────────────────────────────

describe('🔴 통계 쓰기는 한 곳에서만 일어난다', () => {
  const src = () => stripComments(readSource('src/services/examService.ts'));

  it('화면 셋은 통계를 안 쓴다', () => {
    for (const rel of ['src/screens/ExamSetupScreen.tsx', 'src/screens/ExamScreen.tsx', 'src/screens/ExamResultScreen.tsx']) {
      const s = stripComments(readSource(rel));
      for (const banned of ['saveQuizResults', 'recordAnswers', 'quizResultStorage']) {
        expect(s).not.toContain(banned);
      }
    }
  });

  it('🔴 examService 에서 통계 쓰기가 recordFirstAttempt 안에만 있다', () => {
    const s = src();
    const start = s.indexOf('async recordFirstAttempt');
    expect(start).toBeGreaterThan(-1);
    const end = s.indexOf('async addAttempt');
    expect(end).toBeGreaterThan(start);
    const inside = s.slice(start, end);
    const outside = s.slice(0, start) + s.slice(end);
    // 안에는 있고
    expect(inside).toContain('saveResults');
    expect(inside).toContain('recordAnswers');
    // 🔴 밖에는 없다
    expect(outside).not.toContain('saveResults');
    expect(outside).not.toContain('recordAnswers');
  });

  it('🔴 1회차가 아니면 바로 돌아간다 (재시험이 통계를 못 건드린다)', () => {
    const s = src();
    const start = s.indexOf('async recordFirstAttempt');
    const guard = s.slice(start, start + 300);
    expect(guard).toMatch(/attempts\.length\s*!==\s*1/);
  });

  /*
   * 🔴 **이 가드는 2026-10-15 에 좁아졌다. 전에는 「addAttempt 는 통계를 아예 안 부른다」였다.**
   *
   *    그날 「문제만 받아 두고 아직 안 푼 판」이 성적표에 들어오기 시작했다(`saveUnplayed`).
   *    그 판을 성적표에서 처음 푸는 길이 `addAttempt` 를 지나는데, 그것은 **재시험이 아니라
   *    1회차**다. 안 세면 정답률이 그 판만큼 빈다.
   *
   * 🚫 **그래서 가드를 지우지 않고 조건을 검사하게 바꿨다.** 지키려는 약속은 그대로다 —
   *    *2회차부터는 통계에 안 들어간다.* 조건이 빠지면 재시험이 정답률을 부풀리고,
   *    **크래시도 경고도 없이 숫자만 틀린다.**
   */
  it('🔴 addAttempt 의 통계 쓰기는 회차가 0 일 때뿐이다 (재시험은 못 건드린다)', () => {
    const s = src();
    const start = s.indexOf('async addAttempt');
    const end = s.indexOf('async saveRecord');
    const body = s.slice(start, end);
    expect(body).toMatch(/attempts\.length === 0/);
    expect(body).toMatch(/if \(firstPlay\) await this\.recordFirstAttempt\(/);
    // 🔴 조건 밖에서 한 번 더 부르면 두 번 세어진다
    expect(body.match(/recordFirstAttempt/g)).toHaveLength(1);
  });

  it('🔴 끝내는 화면은 저장 **전에** 「이미 셌나」를 묻는다', () => {
    /*
     * 저장한 뒤에 물으면 방금 넣은 회차가 보여서 구분이 사라진다. 그러면
     * 성적표에서 푼 판을 「풀던 시험」으로 또 끝내는 길에서 같은 판이 두 번 세어진다.
     */
    const s = stripComments(readSource('src/screens/ExamScreen.tsx'));
    const ask = s.indexOf('hasCountedAttempt');
    const save = s.indexOf('examService.saveRecord(record)');
    expect(ask).toBeGreaterThan(-1);
    expect(save).toBeGreaterThan(ask);
    expect(s).toMatch(/if \(!counted\) await examService\.recordFirstAttempt\(/);
  });

  it('🔴 재시험에는 빈 회차를 덮어쓰지 않는다 (지난 성적이 지워진다)', () => {
    const s = stripComments(readSource('src/screens/ExamScreen.tsx'));
    const at = s.indexOf('saveUnplayed');
    expect(at).toBeGreaterThan(-1);
    // 바로 앞에 재시험을 걸러내는 조건이 있어야 한다
    expect(s.slice(Math.max(0, at - 200), at)).toContain('!meta.isRetry');
  });

  it('🔴 가짜 wordId 를 쓰지 않는다 (없는 단어를 가리키는 통계를 안 만든다)', () => {
    expect(src()).not.toMatch(/wordId:\s*0\b/);
  });
});

// ── 🔴 recordFirstAttempt 의 **동작**을 잰다 ────────────────────────────────
//
// 위의 소스 훑기는 "어디서 부르나" 를 본다. 그것만으로는 **무엇을 쓰는가**를 못 본다 —
// 2026-10-07 변이 테스트에서 셋이 그대로 빠져나갔다(못 찾은 단어를 쓰기 · 넘긴 문제를 쓰기 ·
// 아예 안 부르기). 그래서 진짜 저장소에 써 보고 결과를 읽는다.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { examService } from '../src/services/examService';
import { quizResultStorage, wordStorage } from '../src/utils/storage';

async function seedWords(words: string[]): Promise<number[]> {
  const ids: number[] = [];
  for (const word of words) {
    const saved = await wordStorage.create({ categoryId: 1, word, meanings: ['뜻'], examples: [] });
    ids.push(saved.wordId);
  }
  return ids;
}

function recordWith(questions: ExamQuestion[], answers: ExamAnswer[]): ExamRecord {
  const now = '2026-10-07T00:00:00.000Z';
  return {
    examId: 'beh-' + Math.random(),
    language: 'ja',
    categoryId: 1,
    takenAt: now,
    questions,
    attempts: [{ answers, score: scoreExam(questions, answers), takenAt: now }],
  };
}

describe('🔴 recordFirstAttempt — 무엇을 쓰는가', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('내 단어의 답만 통계에 쓴다', async () => {
    const [id] = await seedWords(['機会']);
    const q = makeQuestion(0, { word: '機会' });
    await examService.recordFirstAttempt(recordWith([q], [0]));
    const saved = await quizResultStorage.getAll();
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ wordId: id, isCorrect: true, quizType: 'ai_exam' });
  });

  it('🔴 단어장에 없는 단어는 통계에 안 쓴다 (없는 단어를 가리키는 행을 안 만든다)', async () => {
    await seedWords(['機会']);
    const mine = makeQuestion(0, { word: '機会' });
    const notMine = makeQuestion(0, { word: '전혀_없는_단어' });
    await examService.recordFirstAttempt(recordWith([mine, notMine], [0, 0]));
    const saved = await quizResultStorage.getAll();
    expect(saved).toHaveLength(1);
    expect(saved[0].word).toBe('機会');
    // 🔴 가짜 번호가 섞이지 않았다
    expect(saved.every((r) => r.wordId > 0)).toBe(true);
  });

  it('🔴 넘긴 문제는 통계에 안 쓴다', async () => {
    await seedWords(['機会', '遠慮']);
    const a = makeQuestion(0, { word: '機会' });
    const b = makeQuestion(0, { word: '遠慮' });
    await examService.recordFirstAttempt(recordWith([a, b], [0, null]));
    const saved = await quizResultStorage.getAll();
    expect(saved).toHaveLength(1);
    expect(saved[0].word).toBe('機会');
  });

  it('틀린 답은 오답으로 쓴다', async () => {
    await seedWords(['機会']);
    const q = makeQuestion(2, { word: '機会' });
    await examService.recordFirstAttempt(recordWith([q], [0]));
    expect((await quizResultStorage.getAll())[0].isCorrect).toBe(false);
  });

  it('🔴 2회차 이상이면 아무것도 안 쓴다 (재시험이 정답률을 부풀리지 않는다)', async () => {
    await seedWords(['機会']);
    const q = makeQuestion(0, { word: '機会' });
    const rec = recordWith([q], [0]);
    rec.attempts.push({ answers: [0], score: scoreExam([q], [0]), takenAt: '2026-10-08T00:00:00.000Z' });
    await examService.recordFirstAttempt(rec);
    expect(await quizResultStorage.getAll()).toHaveLength(0);
  });

  it('회차가 없으면 아무것도 안 쓴다', async () => {
    await seedWords(['機会']);
    const rec = recordWith([makeQuestion(0, { word: '機会' })], [0]);
    rec.attempts = [];
    await examService.recordFirstAttempt(rec);
    expect(await quizResultStorage.getAll()).toHaveLength(0);
  });

  it('전부 넘겼으면 아무것도 안 쓴다', async () => {
    await seedWords(['機会']);
    const q = makeQuestion(0, { word: '機会' });
    await examService.recordFirstAttempt(recordWith([q], [null]));
    expect(await quizResultStorage.getAll()).toHaveLength(0);
  });

  it('앞뒤 공백이 있어도 내 단어로 알아본다', async () => {
    const [id] = await seedWords(['機会']);
    const q = makeQuestion(0, { word: '  機会  ' });
    await examService.recordFirstAttempt(recordWith([q], [0]));
    expect((await quizResultStorage.getAll())[0].wordId).toBe(id);
  });
});

describe('🔴 addAttempt — 재시험', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('회차가 쌓이고 통계는 안 움직인다', async () => {
    await seedWords(['機会']);
    const q = makeQuestion(0, { word: '機会' });
    const rec = recordWith([q], [0]);
    await examService.saveRecord(rec);
    await examService.recordFirstAttempt(rec);
    const before = (await quizResultStorage.getAll()).length;

    const after = await examService.addAttempt(rec.examId, [1]);
    expect(after?.attempts).toHaveLength(2);
    expect(after?.attempts[1].score.correct).toBe(0);
    // 🔴 재시험이 통계를 안 건드렸다
    expect((await quizResultStorage.getAll()).length).toBe(before);
  });

  it('없는 시험이면 null 이고 던지지 않는다', async () => {
    expect(await examService.addAttempt('없는id', [0])).toBeNull();
  });
});

describe('🔴 ExamScreen 이 1회차를 실제로 기록한다 (배선)', () => {
  it('recordFirstAttempt 를 부른다', () => {
    expect(stripComments(readSource('src/screens/ExamScreen.tsx'))).toContain('recordFirstAttempt');
  });
});

describe('🔴 점수가 쓸 만한지 따로 본다 (실기기가 Best NaN% 를 보여줬다)', () => {
  const questions = [makeQuestion(0)];
  const base = { examId: 'x', takenAt: '2026-10-07T00:00:00.000Z', language: 'ja', questions };

  it('빈 객체는 믿지 않고 다시 센다', () => {
    const raw = JSON.stringify([{ ...base, attempts: [{ answers: [0], score: {} }] }]);
    expect(parseRecords(raw)[0].attempts[0].score.accuracy).toBe(100);
  });

  it('accuracy 가 숫자가 아니면 다시 센다', () => {
    const raw = JSON.stringify([
      { ...base, attempts: [{ answers: [0], score: { correct: 1, total: 1, accuracy: 'x' } }] },
    ]);
    expect(parseRecords(raw)[0].attempts[0].score.accuracy).toBe(100);
  });

  it('🔴 NaN 은 유한수가 아니므로 다시 센다', () => {
    // JSON 에 NaN 은 못 담기므로 null 로 온다 — 그것도 숫자가 아니다
    const raw = JSON.stringify([
      { ...base, attempts: [{ answers: [0], score: { correct: null, total: null, accuracy: null } }] },
    ]);
    expect(Number.isFinite(parseRecords(raw)[0].attempts[0].score.accuracy)).toBe(true);
  });

  it('쓸 만한 점수는 그대로 쓴다', () => {
    const score = { correct: 1, wrong: 0, skipped: 0, total: 1, accuracy: 100 };
    const raw = JSON.stringify([{ ...base, attempts: [{ answers: [0], score }] }]);
    expect(parseRecords(raw)[0].attempts[0].score).toEqual(score);
  });
});

/*
 * ───────────────── 단어가 적을 때 몇 문제가 나오는가 (2026-10-13) ─────────────────
 *
 * 🔴 이 화면은 그때까지 *"문제 20개"* 를 **고정으로** 약속했다. 단어가 5개면 15문제가
 *    나오는데도 그랬고, **무료 1회는 그대로 차감**됐다. 사장님이
 *    *"단어 5개 정도로 적게 저장한 카테고리의 시험"* 을 물어서 드러났다.
 *
 * ⚠ 숫자를 박지 않는다. `EXAM_SIZE`·`QUESTIONS_PER_WORD` 로 계산해서 재므로,
 *   서버 쪽 값이 바뀌어 앱 상수를 같이 고치면 이 테스트가 따라 움직인다.
 */
describe('🔴 고른 언어의 단어만 센다 — 전체 단어 수로 약속하면 또 부풀어 오른다', () => {
  const w = (word: string, language?: string): Word =>
    ({ wordId: 1, word, meaning: 'm', categoryId: 1, language } as unknown as Word);

  it('저장된 언어가 있으면 그것을 센다', () => {
    const words = [w('apple', 'en'), w('apple2', 'en'), w('りんご', 'ja')];
    expect(countWordsInLanguage(words, 'en')).toBe(2);
    expect(countWordsInLanguage(words, 'ja')).toBe(1);
  });

  it('저장된 언어가 없으면 글자로 추정한다', () => {
    expect(countWordsInLanguage([w('apple'), w('りんご')], 'en')).toBe(1);
  });

  it('해당 언어가 하나도 없으면 0 이다', () => {
    expect(countWordsInLanguage([w('apple', 'en')], 'ja')).toBe(0);
  });

  it('빈 목록은 0 이다', () => {
    expect(countWordsInLanguage([], 'en')).toBe(0);
  });

  it('🔴 섞인 카테고리에서 전체 수보다 작다 — 이게 이 함수가 있는 이유다', () => {
    const words = [w('apple', 'en'), w('りんご', 'ja'), w('みかん', 'ja')];
    expect(countWordsInLanguage(words, 'en')).toBeLessThan(words.length);
  });
});

describe('🔴 들어가기 전에 약속하는 문제 수', () => {
  /** 화면이 쓰는 그 계산. 여기가 틀리면 화면이 거짓을 말한다 */
  const expected = (usable: number) => Math.min(EXAM_SIZE, usable * QUESTIONS_PER_WORD);

  it('단어가 넉넉하면 꽉 찬다', () => {
    expect(expected(WORDS_FOR_FULL_EXAM)).toBe(EXAM_SIZE);
    expect(expected(WORDS_FOR_FULL_EXAM + 50)).toBe(EXAM_SIZE);
  });

  it('🔴 단어가 적으면 줄어든다 — 사장님이 물은 그 경우', () => {
    expect(expected(5)).toBe(5 * QUESTIONS_PER_WORD);
    expect(expected(5)).toBeLessThan(EXAM_SIZE);
  });

  it('단어 1개로도 시험이 나온다 — 막지 않는 것이 결정이다', () => {
    expect(expected(1)).toBe(QUESTIONS_PER_WORD);
  });

  it('⚠ 경계 — 20문제가 채워지는 최소 단어 수가 상수와 맞는다', () => {
    expect(expected(WORDS_FOR_FULL_EXAM - 1)).toBeLessThan(EXAM_SIZE);
    expect(expected(WORDS_FOR_FULL_EXAM)).toBe(EXAM_SIZE);
  });

  it('🔴 앱 상수가 서버와 같은 모양이어야 한다', () => {
    // 서버: DEFAULT_EXAM_SIZE = 20 · QUESTIONS_PER_NEW_WORD = 3
    expect(EXAM_SIZE).toBe(20);
    expect(QUESTIONS_PER_WORD).toBe(3);
    // 🔴 경계는 계산값이다. 숫자를 박아 두면 위 둘을 고쳐도 안 따라온다
    expect(WORDS_FOR_FULL_EXAM).toBe(Math.ceil(EXAM_SIZE / QUESTIONS_PER_WORD));
  });
});

/**
 * 🔴 **풀던 시험 — 나갈 수 있게 한 대가** (2026-10-14).
 *
 * 2026-10-14 까지 푸는 중에는 나갈 수가 없었다(띠 하나를 띄우고 그 자리에 세워 뒀다).
 * 그 막기는 **지키지도 못했다** — 시험 내용은 마지막 문제를 풀어야 저장됐으므로 홈 버튼·앱
 * 종료로 나가면 똑같이 사라졌다. 막힌 길은 뒤로가기 하나뿐이었고, 갇힌 사람은 앱을 강제로
 * 끄므로 **막을수록 더 자주 잃는 구조**였다.
 *
 * 🔴 그래서 고친 방향은 「나가게 해 준다」가 아니라 **「나가도 안 사라지게 한다」**다.
 *    문만 열고 저장을 안 붙이면 **정말로 잃기 시작한다.** 아래가 그 저장을 지킨다.
 */
describe('🔴 풀던 시험 — 저장본 읽기', () => {
  const Q = [
    { id: 'q1', prompt: 'a', choices: ['1', '2'], answer: 0, explanation: '' },
    { id: 'q2', prompt: 'b', choices: ['1', '2'], answer: 1, explanation: '' },
    { id: 'q3', prompt: 'c', choices: ['1', '2'], answer: 0, explanation: '' },
  ];
  const make = (over: Record<string, unknown> = {}): string =>
    JSON.stringify({
      examId: 'e1',
      questions: Q,
      answers: [0, null, null],
      index: 1,
      isRetry: false,
      categoryId: 7,
      language: 'en',
      savedAt: '2026-10-14T01:00:00.000Z',
      ...over,
    });

  it('⚠ 가드가 실제로 읽는다 — 멀쩡한 값은 그대로 돌아온다', () => {
    const p = parseExamProgress(make());
    expect(p?.examId).toBe('e1');
    expect(p?.index).toBe(1);
    expect(p?.answers).toEqual([0, null, null]);
    expect(p?.categoryId).toBe(7);
    expect(p?.language).toBe('en');
  });

  it('🔴 어떤 쓰레기에도 던지지 않는다', () => {
    for (const raw of [null, '', 'null', '{', '[]', '{}', '"문자열"', '12', 'true']) {
      expect(() => parseExamProgress(raw)).not.toThrow();
    }
    expect(parseExamProgress('{')).toBeNull();
    expect(parseExamProgress('[]')).toBeNull();
  });

  it('🔴 문제가 0개면 없는 것으로 친다 — 눌러도 아무 일 없는 띠를 띄우지 않는다', () => {
    expect(parseExamProgress(make({ questions: [] }))).toBeNull();
    expect(parseExamProgress(make({ questions: '문제들' }))).toBeNull();
  });

  it('examId 가 없으면 없는 것으로 친다 — 어느 시험인지 모르면 저장할 수 없다', () => {
    expect(parseExamProgress(make({ examId: '' }))).toBeNull();
    expect(parseExamProgress(make({ examId: 3 }))).toBeNull();
  });

  it('🔴 index 가 범위 밖이면 끌어들인다 — 빈 문제를 그리지 않게', () => {
    expect(parseExamProgress(make({ index: -5 }))?.index).toBe(0);
    expect(parseExamProgress(make({ index: 99 }))?.index).toBe(Q.length - 1);
    expect(parseExamProgress(make({ index: 1.7 }))?.index).toBe(1);
    expect(parseExamProgress(make({ index: '둘' }))?.index).toBe(0);
  });

  it('🔴 답 길이를 문제 수에 맞춘다 — 채점이 길이를 믿는다', () => {
    expect(parseExamProgress(make({ answers: [0] }))?.answers).toEqual([0, null, null]);
    expect(parseExamProgress(make({ answers: [0, 1, 0, 1, 1] }))?.answers).toEqual([0, 1, 0]);
    expect(parseExamProgress(make({ answers: 'ㅁ' }))?.answers).toEqual([null, null, null]);
    expect(parseExamProgress(make({ answers: ['영', null, 1] }))?.answers).toEqual([null, null, 1]);
  });

  it('🔴 재시험이었다는 사실이 살아남는다 — 이어서 푼 뒤 회차로 끝나야 한다', () => {
    expect(parseExamProgress(make({ isRetry: true }))?.isRetry).toBe(true);
    // 값이 없거나 이상하면 **새 시험으로 친다**. 회차로 잘못 끝내면 성적표에 안 남는다
    expect(parseExamProgress(make({ isRetry: 'yes' }))?.isRetry).toBe(false);
    expect(parseExamProgress(make({ isRetry: undefined }))?.isRetry).toBe(false);
  });

  it('카테고리·언어가 없어도 읽힌다 — 옛 저장본이나 재시험이면 없을 수 있다', () => {
    const p = parseExamProgress(make({ categoryId: undefined, language: undefined }));
    expect(p).not.toBeNull();
    expect(p?.categoryId).toBeUndefined();
    expect(p?.language).toBeUndefined();
  });
});

describe('🔴 풀던 시험 — 화면이 저장을 빠뜨리지 않았나 (소스 훑기)', () => {
  const screen = (): string => stripComments(readSource('src/screens/ExamScreen.tsx'));

  it('⚠ 가드가 실제로 읽었다', () => {
    expect(screen()).toContain('ExamScreen');
  });

  it('🔴 세 자리에서 적는다 — 문제 도착 · 고를 때마다 · 나갈 때', () => {
    /*
     * 하나라도 빠지면 그 경로로 나간 사람이 시험을 잃는다:
     *   도착 직후   90초를 기다린 뒤라 전화·알림으로 가장 많이 나가는 자리
     *   고를 때마다 앱이 죽는 경로(홈 버튼·강제 종료)를 덮는다
     *   나갈 때     확인 시트에서 「나가기」를 고른 경우
     */
    const hits = screen().split('saveProgress(').length - 1;
    expect(hits).toBeGreaterThanOrEqual(3);
  });

  it('🔴 끝나면 비운다 — 안 비우면 끝난 시험이 「이어서 풀기」로 남는다', () => {
    expect(screen()).toContain('clearProgress');
  });

  it('🔴 저장이 끝난 뒤에 나간다 — 먼저 나가면 저장이 취소될 수 있다', () => {
    const s = screen();
    const at = s.indexOf('const leaveNow');
    expect(at).toBeGreaterThan(-1);
    const body = s.slice(at, at + 700);
    expect(body).toContain('saveProgress');
    expect(body.indexOf('saveProgress')).toBeLessThan(body.indexOf('onBack()'));
  });

  it('🔴 시트를 실수로 닫아도 나가지지 않는다 — 물러서는 자리에 「나가기」를 걸지 않는다', () => {
    /*
     * `ConfirmSheet` 의 `onCancel` 은 **바깥 눌림·끌어 내리기와 같은 자리**다.
     * 거기에 나가기를 걸면 시트를 실수로 닫은 사람이 시험에서 나가 버린다.
     * (2026-10-14 에 처음 그렇게 쓸 뻔했다 — 그래서 가드로 박아 둔다)
     */
    const s = screen();
    const at = s.indexOf('<ConfirmSheet');
    expect(at).toBeGreaterThan(-1);
    const block = s.slice(at, s.indexOf('/>', at));
    expect(block).toContain('onConfirm={leaveNow}');
    expect(block).not.toContain('onCancel={leaveNow}');
  });

  it('🔴 막던 문구가 되살아나지 않았다 — 되살아나면 다시 갇힌다', () => {
    expect(screen()).not.toContain('끝까지 풀어 주세요');
  });
});
