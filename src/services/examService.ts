import {
  EXAM_HISTORY_MAX,
  EXAM_PREFS_KEY,
  EXAM_SEED_COUNT,
  EXAMS_KEY,
} from '../constants/appConfig';
import { readRaw, writeRaw } from '../utils/storage';
import { quizService } from './quizService';
import { srsService } from './srsService';
import { wordService } from './wordService';
import type { ExamQuestion } from './commonServer/types';
import type { Word } from '../types/word';

/**
 * AI 단어 시험 — **씨앗 고르기 · 언어 판정 · 채점 · 기록.**
 *
 * 🔴 **이 파일은 퀴즈 결과를 쓰지 않는다**(`quizService.saveQuizResults` · `srsService.recordAnswers`).
 *
 *    기획은 *"내 단어 문제만 통계에 반영하고 **재시험은 반영하지 않는다**"* 로 정했는데,
 *    **재시험을 구분하는 코드가 아직 없다**(다음 단계다). 구분 못 하는 상태에서 통계에 쓰면
 *    같은 문제를 다시 풀어 맞힌 것이 정답률을 부풀린다 — 플래시카드가 *"뒤집어 보고 넘긴 것을
 *    정답으로 세면 정답률이 조용히 부푼다"* 로 막아 둔 것과 **똑같은 사고**다.
 *    정답률·스트릭·통계·간격 복습 만기가 전부 `@my_word_quiz_results` 에서 파생되므로
 *    여기서 한 번 잘못 쓰면 그 넷이 동시에 흔들린다.
 *
 *    ⚠ 이건 "아직 안 만든 기능"이 맞다(플래시카드와 달리 결정이 아니다).
 *      재시험 구분이 들어오면 **그때** 통계 연결을 켠다. 순서를 지키는 것이 요점이다.
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

// ── 기록 ────────────────────────────────────────────────────────────────────

/**
 * 친 시험 한 판.
 *
 * ⚠ 문제 본문을 그대로 담는다. 재시험과 성적표가 이걸 읽어야 하고, 서버에 다시 묻는 것은
 *   **돈이 든다**(그리고 구독을 끊으면 물을 수도 없다).
 */
export interface ExamRecord {
  /** 서버가 준 시험 id. 없으면 로컬에서 만든 값 */
  examId: string;
  language: string;
  takenAt: string;
  questions: ExamQuestion[];
  answers: ExamAnswer[];
  score: ExamScore;
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
    if (!Array.isArray(obj.questions) || !Array.isArray(obj.answers)) continue;
    if (typeof obj.examId !== 'string' || typeof obj.takenAt !== 'string') continue;
    out.push({
      examId: obj.examId,
      language: typeof obj.language === 'string' ? obj.language : '',
      takenAt: obj.takenAt,
      questions: obj.questions as ExamQuestion[],
      answers: obj.answers as ExamAnswer[],
      score:
        typeof obj.score === 'object' && obj.score !== null
          ? (obj.score as ExamScore)
          : scoreExam(obj.questions as ExamQuestion[], obj.answers as ExamAnswer[]),
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
    return trimRecords(parseRecords(await readRaw(EXAMS_KEY)));
  },

  /**
   * 친 시험을 남긴다.
   *
   * 🔴 **퀴즈 결과에는 쓰지 않는다**(파일 머리 주석). 여기 쓰는 것은 이 키 하나뿐이다.
   * ⚠ 저장이 실패하면 **삼키지 않고 알린다** — 성적표가 비면 사용자가 알아야 한다.
   */
  async saveRecord(record: ExamRecord): Promise<void> {
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
