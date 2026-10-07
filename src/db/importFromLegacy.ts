/**
 * 🔴 **AsyncStorage → SQLite 이사. 이 전환의 성패가 전부 이 파일에 있다.**
 *
 * 운영 중인 앱이고 돌아오는 사용자가 실재한다(2026-10-07 서버 실측: 활성일 2일 이상 **9명**).
 * 단어는 이 앱의 가치 전부다 — **하나라도 잃으면 그 사용자에게는 앱이 망가진 것**이다.
 *
 * ## 지키는 것 넷
 *
 * 1. 🔴 **옛 데이터를 지우지 않는다.** 이사한 뒤에도 `@my_word_*` 는 그대로 둔다.
 *    되돌릴 길을 남기는 비용은 몇 KB 이고, 안 남겼을 때의 비용은 사용자의 단어다.
 * 2. 🔴 **멱등이다.** 여러 번 돌려도 같은 결과다(`INSERT OR REPLACE` + 같은 id).
 *    부팅마다 불러도 안전해야 한다 — 중간에 죽은 이사를 다음 부팅이 이어서 끝낸다.
 * 3. 🔴 **id 를 새로 매기지 않는다.** `wordId` 는 `quiz_results.word_id` 와 `@my_word_srs` 가
 *    참조한다. 다시 매기면 **정답률이 엉뚱한 단어에 붙고 오류는 안 난다.**
 * 4. 🔴 **한 트랜잭션이다.** 반쯤 옮겨진 상태로 끝나지 않는다.
 *
 * ## 실패하면
 *
 * 던진다. 부르는 쪽(`db/index.ts`)이 받아서 **AsyncStorage 로 계속 돌게** 한다 —
 * 이사에 실패했다고 앱을 못 쓰게 만들지 않는다. 이 앱의 규율이 *"서버가 죽어도 화면은 멀쩡히"*
 * 인데, 그 정신은 저장소에도 같이 적용된다.
 */
import type { SqlDriver } from './migrate';

/** 이사 완료 표식. `meta` 에 둔다 — 한 번 끝난 이사를 부팅마다 다시 하지 않기 위해 */
export const IMPORTED_KEY = 'legacy_imported_at';

export interface LegacySnapshot {
  categories: unknown;
  words: unknown;
  quizResults: unknown;
  exams: unknown;
}

export interface ImportReport {
  /** 이미 끝나 있었나 */
  skipped: boolean;
  categories: number;
  words: number;
  quizResults: number;
  exams: number;
  /** 모양이 깨져 건너뛴 행 수. 🔴 0 이 아니면 로그에 남긴다 */
  dropped: number;
}

const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback);
const num = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? Math.floor(v) : null;

/** 배열이면 JSON 문자열로, 아니면 빈 배열. 🔴 던지지 않는다 */
const jsonArray = (v: unknown): string => {
  if (!Array.isArray(v)) return '[]';
  try {
    return JSON.stringify(v);
  } catch {
    return '[]';
  }
};

/** 저장된 JSON 문자열을 배열로. 어떤 입력에도 던지지 않는다 */
export function parseArray(raw: string | null): unknown[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function alreadyImported(db: SqlDriver): boolean {
  return db.get<{ value: string }>('SELECT value FROM meta WHERE key = ?', [IMPORTED_KEY]) !== undefined;
}

/**
 * 이사. **순수하다**(드라이버와 읽어 온 값만 받는다) — 가드가 `node:sqlite` 로 전수 검증한다.
 *
 * ⚠ `force` 는 테스트용이다. 운영에서는 표식이 있으면 건너뛴다.
 */
export function importFromLegacy(
  db: SqlDriver,
  snapshot: LegacySnapshot,
  opts: { force?: boolean; now?: string } = {},
): ImportReport {
  const report: ImportReport = {
    skipped: false,
    categories: 0,
    words: 0,
    quizResults: 0,
    exams: 0,
    dropped: 0,
  };

  if (opts.force !== true && alreadyImported(db)) {
    report.skipped = true;
    return report;
  }

  const now = opts.now ?? new Date().toISOString();
  const categories = Array.isArray(snapshot.categories) ? snapshot.categories : [];
  const words = Array.isArray(snapshot.words) ? snapshot.words : [];
  const results = Array.isArray(snapshot.quizResults) ? snapshot.quizResults : [];
  const exams = Array.isArray(snapshot.exams) ? snapshot.exams : [];

  // 🔴 전부 한 트랜잭션. 반쯤 옮겨진 상태로 끝나지 않는다
  db.tx(() => {
    for (const raw of categories) {
      const o = raw as Record<string, unknown>;
      const id = num(o?.categoryId);
      const name = str(o?.categoryName);
      // id 나 이름이 없는 카테고리는 복원해도 못 쓴다
      if (id === null || !name) {
        report.dropped += 1;
        continue;
      }
      db.run(
        `INSERT OR REPLACE INTO categories
           (category_id, category_name, description, display_order, created_at, updated_at, deleted_at)
         VALUES (?, ?, ?, ?, ?, ?, NULL)`,
        [
          id,
          name,
          typeof o.description === 'string' ? o.description : null,
          num(o.displayOrder) ?? 0,
          str(o.createdAt, now),
          str(o.updatedAt, str(o.createdAt, now)),
        ],
      );
      report.categories += 1;
    }

    for (const raw of words) {
      const o = raw as Record<string, unknown>;
      const id = num(o?.wordId);
      const categoryId = num(o?.categoryId);
      const text = str(o?.word);
      // 🔴 셋 중 하나라도 없으면 **버린다.** 반쪽짜리 단어를 넣으면 화면에서 터진다
      if (id === null || categoryId === null || !text) {
        report.dropped += 1;
        continue;
      }
      db.run(
        `INSERT OR REPLACE INTO words
           (word_id, category_id, word, meanings, examples, tags, memo, language,
            created_at, updated_at, deleted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
        [
          id,
          categoryId,
          text,
          jsonArray(o.meanings),
          jsonArray(o.examples),
          jsonArray(o.tags),
          typeof o.memo === 'string' ? o.memo : null,
          typeof o.language === 'string' ? o.language : null,
          str(o.createdAt, now),
          str(o.updatedAt, str(o.createdAt, now)),
        ],
      );
      report.words += 1;
    }

    for (const raw of results) {
      const o = raw as Record<string, unknown>;
      const id = num(o?.resultId);
      const wordId = num(o?.wordId);
      if (id === null || wordId === null) {
        report.dropped += 1;
        continue;
      }
      db.run(
        `INSERT OR REPLACE INTO quiz_results
           (result_id, word_id, is_correct, quiz_type, answer_type, word,
            correct_answer, user_answer, taken_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          wordId,
          o.isCorrect === true ? 1 : 0,
          str(o.quizType, 'unknown'),
          typeof o.answerType === 'string' ? o.answerType : null,
          typeof o.word === 'string' ? o.word : null,
          typeof o.correctAnswer === 'string' ? o.correctAnswer : null,
          typeof o.userAnswer === 'string' ? o.userAnswer : null,
          str(o.takenAt, now),
        ],
      );
      report.quizResults += 1;
    }

    for (const raw of exams) {
      const o = raw as Record<string, unknown>;
      const id = str(o?.examId);
      if (!id || !Array.isArray(o.questions) || !Array.isArray(o.answers)) {
        report.dropped += 1;
        continue;
      }
      db.run(
        `INSERT OR REPLACE INTO exams (exam_id, language, category_id, taken_at, questions, answers, score)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          str(o.language),
          num(o.categoryId),
          str(o.takenAt, now),
          jsonArray(o.questions),
          jsonArray(o.answers),
          (() => {
            try {
              return JSON.stringify(o.score ?? {});
            } catch {
              return '{}';
            }
          })(),
        ],
      );
      report.exams += 1;
    }

    // 🔴 표식은 **맨 마지막**에 찍는다. 중간에 죽으면 표식이 없으므로 다음 부팅이 다시 한다
    db.run(
      'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      [IMPORTED_KEY, now],
    );
  });

  return report;
}
