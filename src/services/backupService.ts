import { APP_VERSION, LANGUAGE_KEY, NOTICE_READ_KEY, NOTIFY_ENABLED_KEY, NOTIFY_PROMPTED_KEY, NOTIFY_TIME_KEY, THEME_KEY } from '../constants/appConfig';
import { BACKUP_KEYS, readRaw, writeRaw } from '../utils/storage';
import type { Category, Word } from '../types/word';
import type { StoredQuizResult } from '../utils/storage';

/**
 * 전체 백업 / 복원.
 *
 * 기존 CSV 내보내기(`shareService`)와 **역할이 다르다**:
 *
 * | | 담는 것 | 동작 |
 * |---|---|---|
 * | CSV 가져오기 | 단어만 | **추가** — 중복은 정규화 비교로 걸러 낸다 |
 * | 백업 복원(여기) | 단어+카테고리+**퀴즈기록** | **교체** — 기록의 정합성이 목적이라 섞지 않는다 |
 *
 * 🔴 **왜 병합하지 않는가.** ID 재매핑은 할 수 있지만, 퀴즈 기록을 합칠 때 답이 없는 질문이
 *    생긴다 — 같은 단어가 양쪽에 있고 정답률이 80% / 20% 면 합친 값은 무엇인가. 더 나쁜 것은
 *    **스트릭**이다. 두 기기의 활동일을 합치면 **실제로 하지 않은 연속 학습이 만들어진다.**
 *    통계가 거짓이 되느니 교체가 낫다. 부분 추가는 이미 CSV 가져오기가 한다.
 */

/** 파일 포맷 버전. 구조를 바꾸면 올리고, 옛 버전을 읽는 분기를 `parse` 에 넣는다 */
export const BACKUP_SCHEMA_VERSION = 1;

export interface BackupSettings {
  theme?: string;
  language?: string;
  readNotices?: string;
  notifyEnabled?: string;
  notifyTime?: string;
  notifyPrompted?: string;
}

export interface BackupFile {
  schemaVersion: number;
  /** 어느 앱 버전이 만들었나. 문제가 생겼을 때 추적용이고 복원 판정에는 안 쓴다 */
  appVersion: string;
  exportedAt: string;
  categories: Category[];
  words: Word[];
  quizResults: StoredQuizResult[];
  /**
   * 🔴 이것을 빼면 조용히 망가진다.
   *    `getNextId()` 는 전역 카운터 **하나**를 단어와 퀴즈결과가 함께 쓴다(`resultId` 도 여기서 난다).
   *    단어 500개를 복원했는데 카운터가 1이면 다음에 추가하는 단어가 `wordId=1` 을 받고,
   *    **기존 퀴즈 결과가 그 새 단어에 붙는다.** 정답률이 엉뚱한 단어에 표시되고 오류는 안 난다.
   */
  nextId: number;
  settings: BackupSettings;
}

export type BackupError =
  | 'invalid-json'
  | 'not-a-backup'
  | 'newer-schema'
  | 'corrupt';

export type ParseBackupResult =
  | { ok: true; data: BackupFile }
  | { ok: false; reason: BackupError };

export interface BackupSummary {
  words: number;
  categories: number;
  quizResults: number;
  exportedAt: string;
  appVersion: string;
}

// --- 내부 헬퍼 ---

async function readJsonArray<T>(key: string): Promise<T[]> {
  const raw = await readRaw(key);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** 백업 파일에 담긴 배열이 "그 모양인지"만 본다. 값의 의미까지 검사하지 않는다 */
function looksLikeWord(v: unknown): boolean {
  return (
    isObject(v) &&
    typeof v.wordId === 'number' &&
    typeof v.categoryId === 'number' &&
    typeof v.word === 'string' &&
    Array.isArray(v.meanings) &&
    typeof v.createdAt === 'string'
  );
}

function looksLikeCategory(v: unknown): boolean {
  return isObject(v) && typeof v.categoryId === 'number' && typeof v.categoryName === 'string';
}

function looksLikeResult(v: unknown): boolean {
  return (
    isObject(v) &&
    typeof v.wordId === 'number' &&
    typeof v.isCorrect === 'boolean' &&
    typeof v.takenAt === 'string'
  );
}

/**
 * 데이터 안의 가장 큰 id 보다 카운터가 작으면 고쳐 준다.
 *
 * 손으로 고친 파일이나 옛 버그로 어긋난 백업이 들어와도 **다음에 만드는 id 가 기존 것과
 * 겹치지 않게** 한다. 겹치면 퀴즈 기록이 엉뚱한 단어에 붙는데, 그건 눈에 안 보인다.
 */
function repairNextId(nextId: number, words: Word[], results: StoredQuizResult[]): number {
  let max = 0;
  for (const w of words) if (w.wordId > max) max = w.wordId;
  for (const r of results) if (r.resultId > max) max = r.resultId;
  const safe = Number.isFinite(nextId) && nextId > 0 ? Math.floor(nextId) : 0;
  return Math.max(safe, max);
}

export const backupService = {
  /** 지금 기기의 상태를 백업 객체로 만든다. 날짜·id 를 **손대지 않고 그대로** 담는다 */
  async create(): Promise<BackupFile> {
    const [categories, words, quizResults, nextIdRaw] = await Promise.all([
      readJsonArray<Category>(BACKUP_KEYS.categories),
      readJsonArray<Word>(BACKUP_KEYS.words),
      readJsonArray<StoredQuizResult>(BACKUP_KEYS.quizResults),
      readRaw(BACKUP_KEYS.nextId),
    ]);

    const [theme, language, readNotices, notifyEnabled, notifyTime, notifyPrompted] =
      await Promise.all([
        readRaw(THEME_KEY),
        readRaw(LANGUAGE_KEY),
        readRaw(NOTICE_READ_KEY),
        readRaw(NOTIFY_ENABLED_KEY),
        readRaw(NOTIFY_TIME_KEY),
        readRaw(NOTIFY_PROMPTED_KEY),
      ]);

    const settings: BackupSettings = {};
    if (theme) settings.theme = theme;
    if (language) settings.language = language;
    if (readNotices) settings.readNotices = readNotices;
    if (notifyEnabled) settings.notifyEnabled = notifyEnabled;
    if (notifyTime) settings.notifyTime = notifyTime;
    if (notifyPrompted) settings.notifyPrompted = notifyPrompted;

    return {
      schemaVersion: BACKUP_SCHEMA_VERSION,
      appVersion: APP_VERSION,
      exportedAt: new Date().toISOString(),
      categories,
      words,
      quizResults,
      nextId: repairNextId(Number(nextIdRaw ?? 0), words, quizResults),
      settings,
    };
  },

  /** 파일에 쓸 문자열. 사람이 열어 볼 수 있게 들여쓰기를 준다(용량보다 신뢰가 중요하다) */
  serialize(backup: BackupFile): string {
    return JSON.stringify(backup, null, 2);
  },

  /**
   * 파일 내용을 검사한다. **어떤 입력에도 throw 하지 않는다** —
   * 사용자가 아무 파일이나 고를 수 있고, 거기서 예외가 새면 복원 화면이 통째로 죽는다.
   */
  parse(text: string): ParseBackupResult {
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      return { ok: false, reason: 'invalid-json' };
    }

    if (!isObject(raw)) return { ok: false, reason: 'not-a-backup' };
    if (typeof raw.schemaVersion !== 'number') return { ok: false, reason: 'not-a-backup' };
    // 미래 버전은 **읽으려 시도조차 하지 않는다.** 모르는 구조를 반쯤 읽어 복원하는 것이
    // 가장 나쁜 결과다 — 사용자는 복원됐다고 믿는데 데이터가 일부만 들어온다.
    if (raw.schemaVersion > BACKUP_SCHEMA_VERSION) return { ok: false, reason: 'newer-schema' };

    const { categories, words, quizResults } = raw;
    if (!Array.isArray(categories) || !Array.isArray(words) || !Array.isArray(quizResults)) {
      return { ok: false, reason: 'not-a-backup' };
    }
    if (
      !categories.every(looksLikeCategory) ||
      !words.every(looksLikeWord) ||
      !quizResults.every(looksLikeResult)
    ) {
      return { ok: false, reason: 'corrupt' };
    }

    const typedWords = words as Word[];
    const typedResults = quizResults as StoredQuizResult[];

    return {
      ok: true,
      data: {
        schemaVersion: raw.schemaVersion,
        appVersion: typeof raw.appVersion === 'string' ? raw.appVersion : '',
        exportedAt: typeof raw.exportedAt === 'string' ? raw.exportedAt : '',
        categories: categories as Category[],
        words: typedWords,
        quizResults: typedResults,
        nextId: repairNextId(
          typeof raw.nextId === 'number' ? raw.nextId : 0,
          typedWords,
          typedResults,
        ),
        settings: isObject(raw.settings) ? (raw.settings as BackupSettings) : {},
      },
    };
  },

  /** 확인 화면에 보여줄 숫자. "무엇을 잃고 무엇을 얻는지"를 사용자가 보고 판단해야 한다 */
  summarize(backup: BackupFile): BackupSummary {
    return {
      words: backup.words.length,
      categories: backup.categories.length,
      quizResults: backup.quizResults.length,
      exportedAt: backup.exportedAt,
      appVersion: backup.appVersion,
    };
  },

  /**
   * **전체 교체.** 호출 전에 반드시 `parse` 를 통과시키고 사용자 확인을 받는다.
   *
   * 🔴 날짜(`createdAt`·`takenAt`)를 다시 쓰지 않는다. 그 두 값이 곧 히트맵과 스트릭이라,
   *    "지금"으로 찍으면 몇 달치 활동이 복원한 날 하루로 뭉친다.
   * 🔴 "삭제된 단어"의 고아 결과도 그대로 옮긴다. 정리해 버리면 총 퀴즈 수와 전체 정답률이
   *    백업 시점과 달라진다 — 통계를 되살리는 것이 목적인데 그 목적이 깨진다.
   *
   * ⚠ 키를 하나씩 쓰므로 원자적이지 않다. 그래서 **검증을 전부 끝낸 뒤에** 쓰기 시작하고,
   *   본체(카테고리·단어·결과)를 먼저, 카운터를 마지막에 쓴다 — 도중에 죽어도 카운터가
   *   옛값이면 다음 id 가 겹칠 뿐 데이터가 사라지지는 않는다.
   */
  async restore(backup: BackupFile): Promise<void> {
    await writeRaw(BACKUP_KEYS.categories, JSON.stringify(backup.categories));
    await writeRaw(BACKUP_KEYS.words, JSON.stringify(backup.words));
    await writeRaw(BACKUP_KEYS.quizResults, JSON.stringify(backup.quizResults));
    await writeRaw(BACKUP_KEYS.nextId, String(backup.nextId));

    // 설정은 없으면 건드리지 않는다 — 옛 백업에 없는 항목 때문에 현재 설정이 지워지면 안 된다.
    const s = backup.settings;
    if (s.theme) await writeRaw(THEME_KEY, s.theme);
    if (s.language) await writeRaw(LANGUAGE_KEY, s.language);
    if (s.readNotices) await writeRaw(NOTICE_READ_KEY, s.readNotices);
    if (s.notifyEnabled) await writeRaw(NOTIFY_ENABLED_KEY, s.notifyEnabled);
    if (s.notifyTime) await writeRaw(NOTIFY_TIME_KEY, s.notifyTime);
    if (s.notifyPrompted) await writeRaw(NOTIFY_PROMPTED_KEY, s.notifyPrompted);
  },
};
