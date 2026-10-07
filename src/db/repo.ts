/**
 * SQLite 위의 읽기 · 쓰기. **`utils/storage.ts` 의 함수와 시그니처가 같다.**
 *
 * 🔴 **순수하다**(드라이버만 받는다) — 가드가 `node:sqlite` 로 전수 검증한다.
 *    `expo-sqlite` 를 아는 곳은 `db/index.ts` 하나뿐이다.
 *
 * 🔴 **동작을 바꾸지 않는다. 저장 엔진만 바꾼다.**
 *    이번 전환의 목표는 엔진 교체이지 모델 재설계가 아니다. 한 번에 둘을 바꾸면 깨졌을 때
 *    어느 쪽인지 모른다. 그래서:
 *    - 삭제는 지금처럼 **진짜 지운다**(soft delete 아님). `deleted_at` 칸은 동기화가 쓸 자리로 비워 둔다
 *    - id 는 여전히 `@my_word_next_id`(AsyncStorage) 가 발급한다 — 백업의 `repairNextId` 가
 *      그 값을 고쳐 주는 구조라 건드리면 그쪽이 같이 흔들린다
 *    - 뜻 · 예문 · 태그는 JSON 문자열 그대로 둔다
 */
import type { SqlDriver } from './migrate';
import type { Category, CategoryRequest, Word, WordRequest } from '../types/word';
import type { StoredQuizResult } from '../utils/storage';

const arr = (raw: unknown): any[] => {
  if (typeof raw !== 'string') return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
};

const json = (v: unknown): string => {
  try {
    return JSON.stringify(Array.isArray(v) ? v : []);
  } catch {
    return '[]';
  }
};

interface CategoryRow {
  category_id: number;
  category_name: string;
  description: string | null;
  display_order: number;
  created_at: string;
  updated_at: string;
}

interface WordRow {
  word_id: number;
  category_id: number;
  word: string;
  meanings: string;
  examples: string;
  tags: string;
  memo: string | null;
  language: string | null;
  created_at: string;
  updated_at: string;
}

interface ResultRow {
  result_id: number;
  word_id: number;
  is_correct: number;
  quiz_type: string;
  answer_type: string | null;
  word: string | null;
  correct_answer: string | null;
  user_answer: string | null;
  taken_at: string;
}

const toCategory = (r: CategoryRow): Category => ({
  categoryId: r.category_id,
  categoryName: r.category_name,
  ...(r.description === null ? {} : { description: r.description }),
  displayOrder: r.display_order,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

const toWord = (r: WordRow): Word => ({
  wordId: r.word_id,
  categoryId: r.category_id,
  word: r.word,
  meanings: arr(r.meanings),
  examples: arr(r.examples),
  tags: arr(r.tags),
  memo: r.memo ?? '',
  ...(r.language === null ? {} : { language: r.language }),
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

const toResult = (r: ResultRow): StoredQuizResult => ({
  resultId: r.result_id,
  wordId: r.word_id,
  isCorrect: r.is_correct === 1,
  quizType: r.quiz_type,
  ...(r.answer_type === null ? {} : { answerType: r.answer_type }),
  ...(r.word === null ? {} : { word: r.word }),
  ...(r.correct_answer === null ? {} : { correctAnswer: r.correct_answer }),
  ...(r.user_answer === null ? {} : { userAnswer: r.user_answer }),
  takenAt: r.taken_at,
});

// ── 카테고리 ────────────────────────────────────────────────────────────────

export const categoryRepo = {
  getAll(db: SqlDriver): Category[] {
    return db
      .all<CategoryRow>('SELECT * FROM categories WHERE deleted_at IS NULL ORDER BY display_order, category_id')
      .map(toCategory);
  },

  getById(db: SqlDriver, id: number): Category | undefined {
    const row = db.get<CategoryRow>('SELECT * FROM categories WHERE category_id = ? AND deleted_at IS NULL', [id]);
    return row === undefined ? undefined : toCategory(row);
  },

  create(db: SqlDriver, id: number, data: CategoryRequest, now: string): Category {
    db.run(
      `INSERT INTO categories (category_id, category_name, description, display_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, data.categoryName, data.description ?? null, data.displayOrder ?? 0, now, now],
    );
    return categoryRepo.getById(db, id)!;
  },

  update(db: SqlDriver, id: number, data: CategoryRequest, now: string): Category | undefined {
    db.run(
      `UPDATE categories SET category_name = ?, description = ?, display_order = ?, updated_at = ?
       WHERE category_id = ? AND deleted_at IS NULL`,
      [data.categoryName, data.description ?? null, data.displayOrder ?? 0, now, id],
    );
    return categoryRepo.getById(db, id);
  },

  /**
   * 🔴 카테고리를 지우면 그 안의 단어도 같이 지운다 — 지금 동작과 같다.
   *    한 트랜잭션으로 묶어 **카테고리만 사라지고 단어가 떠도는 상태**를 만들지 않는다.
   */
  delete(db: SqlDriver, id: number): void {
    db.tx(() => {
      db.run('DELETE FROM words WHERE category_id = ?', [id]);
      db.run('DELETE FROM categories WHERE category_id = ?', [id]);
    });
  },

  reorder(db: SqlDriver, orders: ReadonlyArray<{ categoryId: number; displayOrder: number }>, now: string): void {
    db.tx(() => {
      for (const o of orders) {
        db.run('UPDATE categories SET display_order = ?, updated_at = ? WHERE category_id = ?', [
          o.displayOrder,
          now,
          o.categoryId,
        ]);
      }
    });
  },
};

// ── 단어 ────────────────────────────────────────────────────────────────────

export const wordRepo = {
  getAll(db: SqlDriver): Word[] {
    return db
      .all<WordRow>('SELECT * FROM words WHERE deleted_at IS NULL ORDER BY created_at, word_id')
      .map(toWord);
  },

  /** 🔴 전체를 읽어 JS 로 거르지 않는다. 그게 이 전환의 이유다(`ix_words_category`) */
  getByCategoryId(db: SqlDriver, categoryId: number): Word[] {
    return db
      .all<WordRow>(
        'SELECT * FROM words WHERE category_id = ? AND deleted_at IS NULL ORDER BY created_at, word_id',
        [categoryId],
      )
      .map(toWord);
  },

  getById(db: SqlDriver, id: number): Word | undefined {
    const row = db.get<WordRow>('SELECT * FROM words WHERE word_id = ? AND deleted_at IS NULL', [id]);
    return row === undefined ? undefined : toWord(row);
  },

  create(db: SqlDriver, id: number, data: WordRequest, now: string): Word {
    db.run(
      `INSERT INTO words (word_id, category_id, word, meanings, examples, tags, memo, language, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        data.categoryId,
        data.word,
        json(data.meanings),
        json(data.examples),
        json(data.tags ?? []),
        data.memo ?? '',
        data.language ?? null,
        now,
        now,
      ],
    );
    return wordRepo.getById(db, id)!;
  },

  update(db: SqlDriver, id: number, data: WordRequest, now: string): Word | undefined {
    db.run(
      `UPDATE words SET category_id = ?, word = ?, meanings = ?, examples = ?, tags = ?, memo = ?, updated_at = ?
       WHERE word_id = ? AND deleted_at IS NULL`,
      [
        data.categoryId,
        data.word,
        json(data.meanings),
        json(data.examples),
        json(data.tags ?? []),
        data.memo ?? '',
        now,
        id,
      ],
    );
    return wordRepo.getById(db, id);
  },

  delete(db: SqlDriver, id: number): void {
    db.run('DELETE FROM words WHERE word_id = ?', [id]);
  },
};

// ── 퀴즈 결과 ───────────────────────────────────────────────────────────────

export const resultRepo = {
  getAll(db: SqlDriver): StoredQuizResult[] {
    return db.all<ResultRow>('SELECT * FROM quiz_results ORDER BY result_id').map(toResult);
  },

  /**
   * 한 판의 답을 **한 트랜잭션으로** 넣는다.
   * ⚠ 지금(AsyncStorage)은 배열을 통째로 다시 쓰므로 사실상 원자적이었다. 그 성질을 지킨다 —
   *   반쯤 저장된 퀴즈 결과는 정답률을 조용히 틀리게 만든다.
   */
  saveResults(
    db: SqlDriver,
    rows: ReadonlyArray<StoredQuizResult>,
  ): void {
    db.tx(() => {
      for (const r of rows) {
        db.run(
          `INSERT OR REPLACE INTO quiz_results
             (result_id, word_id, is_correct, quiz_type, answer_type, word, correct_answer, user_answer, taken_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            r.resultId,
            r.wordId,
            r.isCorrect ? 1 : 0,
            r.quizType,
            r.answerType ?? null,
            r.word ?? null,
            r.correctAnswer ?? null,
            r.userAnswer ?? null,
            r.takenAt,
          ],
        );
      }
    });
  },
};

// ── AI 시험 기록 ────────────────────────────────────────────────────────────

/**
 * 🔴 **`exams` 표를 만들어 놓고 안 쓰면 백업이 새 시험을 놓친다**(2026-10-07 실기기에서 잡았다).
 *    이사는 옛 기록을 옮기는데 새 기록이 계속 AsyncStorage 로 가면, 표에는 옛것만 남고
 *    `backupRepo.exams()` 가 그걸 읽는다. **반쯤 옮긴 상태가 가장 나쁘다.**
 */
export const examRepo = {
  getAll(db: SqlDriver): unknown[] {
    return backupRepo.exams(db);
  },

  /** 한 판을 넣고 상한을 넘으면 오래된 것을 버린다(백업이 끝없이 커지지 않게) */
  save(db: SqlDriver, record: Record<string, unknown>, max: number): void {
    db.tx(() => {
      db.run(
        `INSERT OR REPLACE INTO exams (exam_id, language, category_id, taken_at, questions, answers, score)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          String(record.examId ?? ''),
          String(record.language ?? ''),
          typeof record.categoryId === 'number' ? record.categoryId : null,
          String(record.takenAt ?? ''),
          json(record.questions),
          json(record.answers),
          (() => {
            try {
              return JSON.stringify(record.score ?? {});
            } catch {
              return '{}';
            }
          })(),
        ],
      );
      db.run(
        `DELETE FROM exams WHERE exam_id NOT IN (
           SELECT exam_id FROM exams ORDER BY taken_at DESC LIMIT ?
         )`,
        [Math.max(1, max)],
      );
    });
  },
};

// ── 백업 ────────────────────────────────────────────────────────────────────

/**
 * 백업이 읽는 모양. 🔴 **지금 백업 파일 포맷과 똑같아야 한다** —
 * 운영 중이고 1.7.0 사용자가 이 파일을 복원할 수 있어야 한다(`backupService` 의 schemaVersion 주석).
 */
export const backupRepo = {
  categories: (db: SqlDriver): Category[] => categoryRepo.getAll(db),
  words: (db: SqlDriver): Word[] => wordRepo.getAll(db),
  quizResults: (db: SqlDriver): StoredQuizResult[] => resultRepo.getAll(db),
  exams: (db: SqlDriver): unknown[] =>
    db
      .all<{
        exam_id: string;
        language: string;
        category_id: number | null;
        taken_at: string;
        questions: string;
        answers: string;
        score: string;
      }>('SELECT * FROM exams ORDER BY taken_at DESC')
      .map((r) => ({
        examId: r.exam_id,
        language: r.language,
        // ⚠ 옛 기록에는 없다. 없으면 키를 아예 안 넣는다(화면이 undefined 로 판단한다)
        ...(r.category_id === null ? {} : { categoryId: r.category_id }),
        takenAt: r.taken_at,
        questions: arr(r.questions),
        answers: arr(r.answers),
        score: (() => {
          try {
            return JSON.parse(r.score);
          } catch {
            return {};
          }
        })(),
      })),

  /**
   * 복원. 🔴 **전부 지우고 다시 넣는다 — 한 트랜잭션으로.**
   *    지금 동작(키를 통째로 덮어쓰기)과 같다. 반쯤 복원된 상태가 가장 나쁘다.
   */
  restore(
    db: SqlDriver,
    data: { categories: unknown[]; words: unknown[]; quizResults: unknown[]; exams?: unknown[] },
    now: string,
  ): void {
    db.tx(() => {
      db.run('DELETE FROM quiz_results', []);
      db.run('DELETE FROM words', []);
      db.run('DELETE FROM categories', []);
      if (Array.isArray(data.exams)) db.run('DELETE FROM exams', []);

      for (const raw of data.categories) {
        const o = raw as Record<string, unknown>;
        if (typeof o?.categoryId !== 'number') continue;
        db.run(
          `INSERT OR REPLACE INTO categories
             (category_id, category_name, description, display_order, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [
            o.categoryId,
            String(o.categoryName ?? ''),
            typeof o.description === 'string' ? o.description : null,
            typeof o.displayOrder === 'number' ? o.displayOrder : 0,
            String(o.createdAt ?? now),
            String(o.updatedAt ?? o.createdAt ?? now),
          ],
        );
      }
      for (const raw of data.words) {
        const o = raw as Record<string, unknown>;
        if (typeof o?.wordId !== 'number' || typeof o?.categoryId !== 'number') continue;
        db.run(
          `INSERT OR REPLACE INTO words
             (word_id, category_id, word, meanings, examples, tags, memo, language, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            o.wordId,
            o.categoryId,
            String(o.word ?? ''),
            json(o.meanings),
            json(o.examples),
            json(o.tags),
            typeof o.memo === 'string' ? o.memo : null,
            typeof o.language === 'string' ? o.language : null,
            String(o.createdAt ?? now),
            String(o.updatedAt ?? o.createdAt ?? now),
          ],
        );
      }
      for (const raw of data.quizResults) {
        const o = raw as Record<string, unknown>;
        if (typeof o?.resultId !== 'number' || typeof o?.wordId !== 'number') continue;
        db.run(
          `INSERT OR REPLACE INTO quiz_results
             (result_id, word_id, is_correct, quiz_type, answer_type, word, correct_answer, user_answer, taken_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            o.resultId,
            o.wordId,
            o.isCorrect === true ? 1 : 0,
            String(o.quizType ?? 'unknown'),
            typeof o.answerType === 'string' ? o.answerType : null,
            typeof o.word === 'string' ? o.word : null,
            typeof o.correctAnswer === 'string' ? o.correctAnswer : null,
            typeof o.userAnswer === 'string' ? o.userAnswer : null,
            String(o.takenAt ?? now),
          ],
        );
      }
      if (Array.isArray(data.exams)) {
        for (const raw of data.exams) {
          const o = raw as Record<string, unknown>;
          if (typeof o?.examId !== 'string') continue;
          db.run(
            `INSERT OR REPLACE INTO exams (exam_id, language, category_id, taken_at, questions, answers, score)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
              o.examId,
              String(o.language ?? ''),
              typeof o.categoryId === 'number' ? o.categoryId : null,
              String(o.takenAt ?? now),
              json(o.questions),
              json(o.answers),
              (() => {
                try {
                  return JSON.stringify(o.score ?? {});
                } catch {
                  return '{}';
                }
              })(),
            ],
          );
        }
      }
    });
  },
};
