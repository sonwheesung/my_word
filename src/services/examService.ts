import {
  EXAM_HISTORY_MAX,
  EXAM_PREFS_KEY,
  EXAM_SEED_COUNT,
  EXAMS_KEY,
} from '../constants/appConfig';
import { readRaw, writeRaw } from '../utils/storage';
import { getDb } from '../db';
import { examRepo } from '../db/repo';
import { quizService } from './quizService';
import { quizResultStorage } from '../utils/storage';
import { srsService } from './srsService';
import { wordService } from './wordService';
import type { ExamQuestion } from './commonServer/types';
import type { Word } from '../types/word';

/**
 * AI 단어 시험 — **씨앗 고르기 · 언어 판정 · 채점 · 기록.**
 *
 * 🔴 **통계에는 1회차만 쓴다. 재시험은 절대 안 쓴다**(2026-10-07 Phase 5 에서 켰다).
 *
 *    기획: *"내 단어 문제만 통계에 반영하고 **재시험은 반영하지 않는다**"*.
 *    같은 문제를 다시 풀면 **외워서 맞힌다** — 그걸 정답률에 넣으면 숫자가 조용히 부푼다.
 *    플래시카드가 *"뒤집어 보고 넘긴 것을 정답으로 세면 정답률이 조용히 부푼다"* 로 막아 둔 것과
 *    같은 사고다. 정답률·스트릭·통계·간격 복습 만기가 전부 `@my_word_quiz_results` 에서
 *    파생되므로 여기서 한 번 잘못 쓰면 **그 넷이 동시에 흔들린다.**
 *
 *    그래서 통계 쓰기는 **`recordFirstAttempt` 한 곳에서만** 일어나고, 그 함수는
 *    `attempts.length === 1` 일 때만 쓴다. `__tests__/examService.test.ts` 가 소스를 읽어
 *    **다른 어디에서도 통계를 쓰지 않는 것**을 지킨다.
 *
 * ⚠ 만기·취약 조회는 `srsService`·`quizService` 를 **읽기만** 한다. 읽기라서 위 규칙과 어긋나지 않는다.
 *
 * 순서 계산을 화면에 두지 않고 여기 둔 이유는 `flashcardService` 와 같다: 1.6.0 의 SRS 버그가
 * **순수 함수는 각각 옳았고 조합이 틀렸던** 것이었다. 조합을 화면 밖에 둬야 단위 테스트가 붙는다.
 */

// ── 언어 ────────────────────────────────────────────────────────────────────

/** 서버가 받는 언어 코드. 🔴 모르는 값을 보내면 400 이다 — 창고 키의 일부라 오타가 창고를 쪼갠다 */
export const EXAM_LANGUAGES = ['ja', 'en', 'ko', 'zh'] as const;
export type ExamLanguage = (typeof EXAM_LANGUAGES)[number];

export function isExamLanguage(value: unknown): value is ExamLanguage {
  return typeof value === 'string' && (EXAM_LANGUAGES as readonly string[]).includes(value);
}

/**
 * 글자를 보고 언어를 추정한다.
 *
 * 🔴 **한자만 있는 단어는 원리적으로 구분할 수 없다**(`学校` 는 일본어이기도 중국어이기도 하다).
 *    그래서 추정을 **기본값으로만** 쓰고 사용자가 고를 수 있게 둔다(기획 탭 결정 ②:
 *    *"어떤 언어인지 선택하세요를 놔두는게 좋은 것 같아"*).
 *
 * ⚠ `utils/text.ts` 의 `detectSpeechLanguage` 와 **일부러 따로 둔다.** 그쪽은 발음 재생용
 *   BCP-47(`ja-JP`)이고 여기는 서버가 받는 짧은 코드다. 그리고 그쪽은 한자를 중국어로 떨어뜨리는데,
 *   이 앱 사용자의 단어장은 일본어가 압도적이라 **여기서는 한자를 일본어로 본다.**
 *   섞어 쓰면 한쪽을 고칠 때 다른 쪽이 조용히 틀어진다.
 */
export function detectLanguage(text: string): ExamLanguage | null {
  let kana = false;
  let hangul = false;
  let han = false;
  let latin = false;
  for (const char of text) {
    const code = char.codePointAt(0);
    if (code === undefined) continue;
    if ((code >= 0x3040 && code <= 0x30ff) || (code >= 0xff66 && code <= 0xff9f)) kana = true;
    else if (code >= 0xac00 && code <= 0xd7a3) hangul = true;
    else if ((code >= 0x1100 && code <= 0x11ff) || (code >= 0x3130 && code <= 0x318f)) hangul = true;
    else if (code >= 0x4e00 && code <= 0x9fff) han = true;
    else if ((code >= 0x41 && code <= 0x5a) || (code >= 0x61 && code <= 0x7a)) latin = true;
  }
  // 가나가 하나라도 있으면 일본어다 — 가장 강한 신호다.
  if (kana) return 'ja';
  if (hangul) return 'ko';
  // 🔴 한자 단독은 일본어로 본다(위 주석). 중국어 사용자는 선택을 바꾸면 된다.
  if (han) return 'ja';
  if (latin) return 'en';
  return null;
}

/**
 * 카테고리 전체를 보고 언어를 추정한다 — **다수결**이다.
 *
 * 🔴 기획의 엣지 케이스가 이것이다: *"하나의 카테고리에 무작위 단어(일본어, 중국어, 영어 등)를
 *    저장해서 시험을 보는 경우"*. 섞여 있어도 **가장 많은 쪽**을 기본값으로 내놓고 사용자가 고친다.
 *    못 고르면 `null` 을 주고 화면이 고르라고 한다 — **추측으로 보내지 않는다.**
 *
 * ⚠ 저장된 `language` 가 있으면 그것을 먼저 센다. 글자 추정은 없는 단어에만 쓴다.
 */
export function detectCategoryLanguage(words: Word[]): ExamLanguage | null {
  const tally = new Map<ExamLanguage, number>();
  for (const word of words) {
    const saved = isExamLanguage(word.language) ? word.language : null;
    const guess = saved ?? detectLanguage(word.word);
    if (guess === null) continue;
    tally.set(guess, (tally.get(guess) ?? 0) + 1);
  }
  if (tally.size === 0) return null;
  let best: ExamLanguage | null = null;
  let bestCount = 0;
  // 같은 수면 EXAM_LANGUAGES 순서로 갈라 **같은 입력에 항상 같은 답**이 나오게 한다.
  for (const language of EXAM_LANGUAGES) {
    const count = tally.get(language) ?? 0;
    if (count > bestCount) {
      best = language;
      bestCount = count;
    }
  }
  return best;
}

/** 그 카테고리에 언어가 몇 가지 섞여 있나 — 화면이 "섞여 있다" 안내를 띄울지 판단한다 */
export function countLanguages(words: Word[]): number {
  const seen = new Set<ExamLanguage>();
  for (const word of words) {
    const saved = isExamLanguage(word.language) ? word.language : null;
    const guess = saved ?? detectLanguage(word.word);
    if (guess !== null) seen.add(guess);
  }
  return seen.size;
}

// ── 씨앗 고르기 ─────────────────────────────────────────────────────────────

/** 씨앗을 어디서 가져왔나. 화면에 비율을 보여주는 데 쓴다 */
export interface SeedPlan {
  due: Word[];
  weak: Word[];
  random: Word[];
}

/** 만기 4 · 취약 3 · 무작위 3 = 10. 🔴 합이 `EXAM_SEED_COUNT` 와 같아야 한다 */
export const SEED_QUOTA = { due: 4, weak: 3, random: 3 } as const;

function shuffled<T>(items: T[], rng: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * 씨앗 단어를 고른다. **순수 함수다.**
 *
 * 🔴 **앞이 비면 뒤가 채운다.** 만기가 0개인 사용자(이제 시작한 사람)에게 시험이 4문제만
 *    나오면 안 된다. 그래서 할당을 못 채운 몫은 다음 통이 가져간다.
 *
 * ⚠ 중복을 허용하지 않는다 — 만기이면서 취약인 단어가 흔하다. 두 번 세면 씨앗이 모자라진다.
 * ⚠ `rng` 를 받는 이유는 테스트에서 순서를 고정해 재기 위함이다(`flashcardService` 와 같다).
 */
export function pickSeeds(
  words: Word[],
  dueIds: readonly number[],
  weakIds: readonly number[],
  limit: number = EXAM_SEED_COUNT,
  rng: () => number = Math.random,
): SeedPlan {
  const byId = new Map(words.map((w) => [w.wordId, w]));
  const used = new Set<number>();
  const take = (ids: readonly number[], quota: number): Word[] => {
    const out: Word[] = [];
    for (const id of ids) {
      if (out.length >= quota) break;
      if (used.has(id)) continue;
      const word = byId.get(id);
      if (word === undefined) continue; // 지워진 단어의 이력이 남아 있을 수 있다
      used.add(id);
      out.push(word);
    }
    return out;
  };

  const due = take(dueIds, Math.min(SEED_QUOTA.due, limit));
  // 🔴 만기가 할당을 못 채웠으면 그 몫이 취약으로 넘어간다.
  const weakQuota = Math.min(SEED_QUOTA.weak + (SEED_QUOTA.due - due.length), limit - due.length);
  const weak = take(weakIds, Math.max(0, weakQuota));
  // 남은 전부를 무작위가 채운다.
  const restIds = shuffled(
    words.filter((w) => !used.has(w.wordId)).map((w) => w.wordId),
    rng,
  );
  const random = take(restIds, Math.max(0, limit - due.length - weak.length));
  return { due, weak, random };
}

/** 씨앗 계획을 서버가 받는 모양으로 편다. 뜻은 첫 번째만 보낸다 — 여러 개 보낼 이유가 없다 */
export function toSeedPayload(plan: SeedPlan): { word: string; meaning?: string }[] {
  const all = [...plan.due, ...plan.weak, ...plan.random];
  return all.map((w) => {
    const meaning = (w.meanings?.[0] ?? '').trim();
    return meaning ? { word: w.word, meaning } : { word: w.word };
  });
}

// ── 채점 ────────────────────────────────────────────────────────────────────

/** 사용자가 고른 보기. `null` 은 안 풀고 넘긴 것이다 */
export type ExamAnswer = number | null;

export interface ExamScore {
  correct: number;
  wrong: number;
  skipped: number;
  total: number;
  /** 0~100. 🔴 **총 문제 수로 나눈다** — 넘긴 문제를 분모에서 빼면 다 넘긴 사람이 100점이 된다 */
  accuracy: number;
}

/**
 * 채점. **순수 함수이고 서버를 부르지 않는다.**
 *
 * 🔴 객관식 채점이 기기에서 일어나는 것이 설계다 — 그래서 **구독을 끊어도 재시험을 칠 수 있고**
 *    오프라인에서 이어 풀 수 있다(기획 탭).
 */
export function scoreExam(questions: ExamQuestion[], answers: readonly ExamAnswer[]): ExamScore {
  let correct = 0;
  let wrong = 0;
  let skipped = 0;
  questions.forEach((question, index) => {
    const answer = answers[index];
    if (answer === null || answer === undefined) skipped += 1;
    else if (answer === question.answerIndex) correct += 1;
    else wrong += 1;
  });
  const total = questions.length;
  return {
    correct,
    wrong,
    skipped,
    total,
    accuracy: total === 0 ? 0 : Math.round((correct / total) * 1000) / 10,
  };
}

// ── 단어 담기 ───────────────────────────────────────────────────────────────

/**
 * 🔴 **이 기능이 AI 시험의 정체다.**
 *
 * 기획: *"시험에 나온 없는 단어들 목록 보여주고 하나씩 선택해서 저장"*.
 * 시험을 볼수록 단어장이 자란다 — 그게 구독의 진짜 값이고, 문제를 내 주는 것이 아니다.
 *
 * ## 후보는 **오답 보기**다
 *
 * 문제가 묻는 단어(`question.word`)는 **이미 사용자 단어장에 있다** — 그 단어로 시험을 만들었으니까.
 * 값은 오답 보기에 있다. 그래서 서버 프롬프트가 *"오답 보기는 반드시 실재하는 단어"* 를
 * 요구한다(`lib/ai.ts`) — 지어낸 단어를 담으면 **거짓을 외우게 된다.**
 *
 * ⚠ 정답 보기도 후보에서 뺀다. 정답은 곧 그 문제의 단어이고 이미 갖고 있다.
 * ⚠ 중복을 걷고 **나온 순서**를 지킨다. 무작위로 섞으면 "아까 본 그 단어"를 찾기 어렵다.
 */
export function collectNewWords(
  questions: readonly ExamQuestion[],
  ownedWords: readonly string[],
): string[] {
  const owned = new Set(ownedWords.map((w) => w.trim()));
  // 시험이 물은 단어도 뺀다 — 내 단어장에서 왔다
  for (const q of questions) owned.add(q.word.trim());

  const seen = new Set<string>();
  const out: string[] = [];
  for (const q of questions) {
    q.choices.forEach((choice, index) => {
      // 정답은 그 문제의 단어다. 후보가 아니다
      if (index === q.answerIndex) return;
      const text = choice.trim();
      if (!text || owned.has(text) || seen.has(text)) return;
      seen.add(text);
      out.push(text);
    });
  }
  return out;
}

// ── 기록 ────────────────────────────────────────────────────────────────────

/**
 * 친 시험 한 판.
 *
 * ⚠ 문제 본문을 그대로 담는다. 재시험과 성적표가 이걸 읽어야 하고, 서버에 다시 묻는 것은
 *   **돈이 든다**(그리고 구독을 끊으면 물을 수도 없다).
 */
/** 한 회차. 🔴 **문제는 회차 밖에 있다** — 같은 문제를 다시 푸는 것이 재시험이다 */
export interface ExamAttempt {
  answers: ExamAnswer[];
  score: ExamScore;
  takenAt: string;
}

export interface ExamRecord {
  /** 서버가 준 시험 id. 없으면 로컬에서 만든 값 */
  examId: string;
  language: string;
  /**
   * 어느 카테고리로 쳤나. **단어 담기가 여기에 넣는다.**
   * ⚠ 옵셔널이다 — 이 필드가 생기기 전에 친 시험에는 없다(`parseRecords` 가 없으면 넘긴다).
   */
  categoryId?: number;
  takenAt: string;
  questions: ExamQuestion[];
  /**
   * 회차 목록. **1회차가 `[0]`** 이고 뒤로 쌓인다.
   *
   * 🔴 통계에 들어가는 것은 `[0]` 뿐이다(머리 주석). 성적표는 전부 보여준다.
   * ⚠ 옛 기록은 `answers`·`score` 를 직접 들고 있었다. `parseRecords` 가 그것을 1회차로 옮긴다 —
   *   **마이그레이션을 따로 돌리지 않는다**(저장본은 읽을 때 고친다).
   */
  attempts: ExamAttempt[];
}

/**
 * 회차를 읽는다. **옛 모양(`answers`·`score` 가 기록에 직접 있는 것)을 1회차로 옮긴다.**
 *
 * 🔴 저장본을 고치는 마이그레이션을 돌리지 않는다 — 읽을 때 고친다. 운영 중인 앱이라
 *    저장본을 건드리는 쪽이 늘 더 위험하다(SRS·백업이 같은 규율이다).
 */
/**
 * 저장된 점수가 **쓸 만한가**. 아니면 `null` 을 주고 부르는 쪽이 다시 센다.
 *
 * 🔴 **실기기에서 `Best NaN%` 를 보고 생겼다**(2026-10-07). 저장 경로가 점수를 `{}` 로 쓴
 *    기록이 있었는데, 그걸 그대로 믿으니 화면에 NaN 이 나왔다. **숫자인지 확인하지 않고
 *    객체라는 이유로 믿은 것**이 원인이다. 모양이 맞아도 값이 쓸 만한지는 따로 봐야 한다.
 */
function usableScore(raw: unknown): ExamScore | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const o = raw as Record<string, unknown>;
  const ok = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
  if (!ok(o.correct) || !ok(o.total) || !ok(o.accuracy)) return null;
  return raw as ExamScore;
}

function parseAttempts(obj: Record<string, unknown>, questions: ExamQuestion[]): ExamAttempt[] {
  const out: ExamAttempt[] = [];
  const raw = obj.attempts;
  if (Array.isArray(raw)) {
    for (const entry of raw) {
      if (typeof entry !== 'object' || entry === null) continue;
      const a = entry as Record<string, unknown>;
      if (!Array.isArray(a.answers)) continue;
      const answers = a.answers as ExamAnswer[];
      out.push({
        answers,
        score: usableScore(a.score) ?? scoreExam(questions, answers),
        takenAt: typeof a.takenAt === 'string' ? a.takenAt : String(obj.takenAt ?? ''),
      });
    }
  }
  // 옛 모양: 기록이 answers·score 를 직접 들고 있다
  if (out.length === 0 && Array.isArray(obj.answers)) {
    const answers = obj.answers as ExamAnswer[];
    out.push({
      answers,
      score: usableScore(obj.score) ?? scoreExam(questions, answers),
      takenAt: String(obj.takenAt ?? ''),
    });
  }
  return out;
}

/** 🔴 어떤 입력에도 던지지 않는다. 기록 하나가 깨졌다고 시험을 못 치면 안 된다 */
export function parseRecords(raw: string | null): ExamRecord[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const out: ExamRecord[] = [];
  for (const entry of parsed) {
    if (typeof entry !== 'object' || entry === null) continue;
    const obj = entry as Record<string, unknown>;
    if (!Array.isArray(obj.questions)) continue;
    if (typeof obj.examId !== 'string' || typeof obj.takenAt !== 'string') continue;
    out.push({
      examId: obj.examId,
      language: typeof obj.language === 'string' ? obj.language : '',
      ...(typeof obj.categoryId === 'number' && Number.isFinite(obj.categoryId)
        ? { categoryId: obj.categoryId }
        : {}),
      takenAt: obj.takenAt,
      questions: obj.questions as ExamQuestion[],
      attempts: parseAttempts(obj, obj.questions as ExamQuestion[]),
    });
  }
  return out;
}

/** 최신이 앞. `EXAM_HISTORY_MAX` 를 넘으면 오래된 것을 버린다(백업이 끝없이 커지지 않게) */
export function trimRecords(records: ExamRecord[], max: number = EXAM_HISTORY_MAX): ExamRecord[] {
  return [...records]
    .sort((a, b) => b.takenAt.localeCompare(a.takenAt))
    .slice(0, Math.max(1, max));
}

// ── 취향 ────────────────────────────────────────────────────────────────────

export interface ExamPrefs {
  /** 카테고리별로 고른 언어. 글자 추정보다 **사용자의 선택이 우선**이다 */
  languageByCategory: Record<string, ExamLanguage>;
  lastCategoryId: number | null;
}

export const DEFAULT_EXAM_PREFS: ExamPrefs = { languageByCategory: {}, lastCategoryId: null };

/** 🔴 어떤 입력에도 던지지 않는다 — `flashcardService.parsePrefs` 와 같은 규율 */
export function parseExamPrefs(raw: string | null): ExamPrefs {
  if (!raw) return { languageByCategory: {}, lastCategoryId: null };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { languageByCategory: {}, lastCategoryId: null };
  }
  if (typeof parsed !== 'object' || parsed === null) {
    return { languageByCategory: {}, lastCategoryId: null };
  }
  const obj = parsed as Record<string, unknown>;
  const byCategory: Record<string, ExamLanguage> = {};
  if (typeof obj.languageByCategory === 'object' && obj.languageByCategory !== null) {
    for (const [key, value] of Object.entries(obj.languageByCategory)) {
      if (isExamLanguage(value)) byCategory[key] = value;
    }
  }
  const last = obj.lastCategoryId;
  return {
    languageByCategory: byCategory,
    lastCategoryId: typeof last === 'number' && Number.isFinite(last) ? last : null,
  };
}

export const examService = {
  async loadPrefs(): Promise<ExamPrefs> {
    return parseExamPrefs(await readRaw(EXAM_PREFS_KEY));
  },

  /** 취향 저장이 실패해도 화면은 굴러가야 하므로 삼킨다 */
  async savePrefs(prefs: ExamPrefs): Promise<void> {
    try {
      await writeRaw(EXAM_PREFS_KEY, JSON.stringify(prefs));
    } catch (error: any) {
      console.warn('시험 설정 저장 실패:', error);
    }
  },

  async getRecords(): Promise<ExamRecord[]> {
    const db = getDb();
    // 🔴 SQLite 가 정본이면 거기서 읽는다. 안 그러면 백업(표를 읽는다)과 화면이 다른 것을 본다
    if (db !== null) return trimRecords(parseRecords(JSON.stringify(examRepo.getAll(db))));
    return trimRecords(parseRecords(await readRaw(EXAMS_KEY)));
  },

  /**
   * 친 시험을 남긴다.
   *
   * 🔴 **퀴즈 결과에는 쓰지 않는다**(파일 머리 주석). 여기 쓰는 것은 이 키 하나뿐이다.
   * ⚠ 저장이 실패하면 **삼키지 않고 알린다** — 성적표가 비면 사용자가 알아야 한다.
   */
  /**
   * 🔴 **1회차만 통계에 쓴다. 여기가 이 파일에서 통계를 쓰는 유일한 곳이다.**
   *
   * 쓰는 것은 둘이다 — 퀴즈 결과(정답률·스트릭의 원천)와 간격 복습 만기.
   * 넘긴 문제(`null`)는 **쓰지 않는다**: 모르겠다고 넘긴 것을 오답으로 세면 만기가 당겨지고,
   * 정답으로 셀 수는 더더욱 없다. 퀴즈 화면도 안 푼 문제를 저장하지 않는다.
   *
   * ⚠ 실패해도 던지지 않는다. 통계가 한 판 빠지는 것보다 성적이 안 남는 쪽이 나쁘다.
   */
  async recordFirstAttempt(record: ExamRecord): Promise<void> {
    if (record.attempts.length !== 1) return;
    const attempt = record.attempts[0];
    if (attempt === undefined) return;

    try {
      /*
       * 🔴 **`wordId` 를 반드시 내 단어장에서 찾아 쓴다.**
       *
       *    문제는 단어를 **글자로만** 들고 있다(서버의 창고가 공용이라 사용자의 번호를 모른다).
       *    여기서 못 찾은 것을 0 같은 가짜 번호로 넣으면 **없는 단어를 가리키는 통계**가 생기고,
       *    정답률 화면이 그걸 조용히 섞어 보여준다. 크래시도 경고도 없다.
       *    → **못 찾으면 그 문제는 통계에 안 쓴다.** 기획의 *"내 단어 문제만 반영한다"* 가 이것이다.
       */
      const owned = new Map((await wordService.getWords()).map((w) => [w.word.trim(), w.wordId]));

      const rows = record.questions
        .map((q, i) => ({ q, answer: attempt.answers[i], wordId: owned.get(q.word.trim()) }))
        // 넘긴 문제는 쓰지 않는다 — 오답으로 세면 만기가 당겨지고 정답으로는 더더욱 못 센다
        .filter((x) => x.answer !== null && x.answer !== undefined && x.wordId !== undefined)
        .map(({ q, answer, wordId }) => ({
          wordId: wordId as number,
          isCorrect: answer === q.answerIndex,
          quizType: 'ai_exam',
          answerType: 'multiple_choice',
          word: q.word,
          correctAnswer: q.choices[q.answerIndex],
          userAnswer: typeof answer === 'number' ? q.choices[answer] : undefined,
        }));

      if (rows.length === 0) return;

      await quizResultStorage.saveResults(rows);
      // 간격 복습 만기도 같이 움직인다. 🔴 결과를 먼저 저장한 뒤에 부른다 —
      //    srsService 가 "결과 개수"로 증분 가능 여부를 판정하기 때문이다
      await srsService.recordAnswers(rows.map((r) => ({ wordId: r.wordId, isCorrect: r.isCorrect })));
    } catch (error: any) {
      // 통계가 한 판 빠지는 것보다 성적이 안 남는 쪽이 나쁘다. 삼키되 남긴다
      console.warn('시험 결과 통계 반영 실패:', error);
    }
  },

  /**
   * 재시험 한 회차를 더한다.
   *
   * 🔴 **통계를 건드리지 않는다.** 같은 문제를 다시 풀면 외워서 맞히므로, 넣으면 정답률이 부푼다.
   *    이 함수가 `recordFirstAttempt` 를 부르지 않는 것이 그 규칙의 전부다.
   *
   * ⚠ 없는 시험이면 아무것도 하지 않는다(던지지 않는다).
   */
  async addAttempt(examId: string, answers: ExamAnswer[]): Promise<ExamRecord | null> {
    const records = await this.getRecords();
    const target = records.find((r) => r.examId === examId);
    if (target === undefined) return null;
    const next: ExamRecord = {
      ...target,
      attempts: [
        ...target.attempts,
        { answers, score: scoreExam(target.questions, answers), takenAt: new Date().toISOString() },
      ],
    };
    await this.saveRecord(next);
    return next;
  },

  async saveRecord(record: ExamRecord): Promise<void> {
    const db = getDb();
    if (db !== null) {
      examRepo.save(db, record as unknown as Record<string, unknown>, EXAM_HISTORY_MAX);
      return;
    }
    const existing = parseRecords(await readRaw(EXAMS_KEY));
    const merged = trimRecords([record, ...existing.filter((r) => r.examId !== record.examId)]);
    await writeRaw(EXAMS_KEY, JSON.stringify(merged));
  },

  /**
   * 씨앗을 고른다.
   *
   * ⚠ 만기·취약을 못 읽어도 시험은 나와야 한다. 실패하면 무작위로 조용히 내려앉는다
   *   (`flashcardService.getCards` 와 같은 규율).
   */
  async buildSeeds(categoryId: number, limit: number = EXAM_SEED_COUNT): Promise<SeedPlan> {
    const words = await wordService.getWords(categoryId);
    if (words.length === 0) return { due: [], weak: [], random: [] };

    let dueIds: number[] = [];
    let weakIds: number[] = [];
    try {
      dueIds = await srsService.getDueWordIds(words.length, categoryId);
    } catch (error: any) {
      console.warn('만기 조회 실패, 무작위로 채운다:', error);
    }
    try {
      const inCategory = new Set(words.map((w) => w.wordId));
      weakIds = (await quizService.getWeakWordIds(words.length)).filter((id) => inCategory.has(id));
    } catch (error: any) {
      console.warn('취약 단어 조회 실패, 무작위로 채운다:', error);
    }
    return pickSeeds(words, dueIds, weakIds, limit);
  },
};
