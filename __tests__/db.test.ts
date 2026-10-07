/**
 * 로컬 SQLite 스키마 · 러너 · **이사** 검증.
 *
 * 🔴 `node:sqlite` 에 **진짜 DB 를 세워서** 돌린다. 모의가 아니라 실제 SQL 이 실행된다 —
 *    스키마 오타 · 제약 위반 · 트랜잭션 되돌림이 전부 여기서 걸린다.
 *    앱(`expo-sqlite`)과 **같은 러너·같은 스키마**를 쓰므로 이게 유효하다(`db/migrate.ts` 의 SqlDriver).
 *
 * 🔴 이 파일이 지키는 가장 무거운 약속: **이사가 단어를 잃지 않는다.**
 *    운영 중인 앱이고 돌아오는 사용자가 9명 실재한다(2026-10-07 서버 실측).
 *    단어는 이 앱의 가치 전부라, 하나라도 잃으면 그 사용자에게는 앱이 망가진 것이다.
 */

declare const require: (id: string) => any;

import {
  CODE_SCHEMA_VERSION,
  readSchemaVersion,
  runMigrations,
  type SqlDriver,
} from '../src/db/migrate';
import { META_TABLE_SQL, MIGRATIONS, TABLE_NAMES } from '../src/db/schema';
import {
  IMPORTED_KEY,
  alreadyImported,
  importFromLegacy,
  parseArray,
  type LegacySnapshot,
} from '../src/db/importFromLegacy';

const { DatabaseSync } = require('node:sqlite') as {
  DatabaseSync: new (path: string) => any;
};

/** `expo-sqlite` 래퍼와 **같은 모양**으로 node:sqlite 를 감싼다(`src/db/index.ts` 와 짝) */
function makeDb(): SqlDriver {
  const database = new DatabaseSync(':memory:');
  return {
    exec: (sql) => database.exec(sql),
    get: <T>(sql: string, params: readonly unknown[] = []) =>
      (database.prepare(sql).get(...params) as T | undefined) ?? undefined,
    all: <T>(sql: string, params: readonly unknown[] = []) =>
      database.prepare(sql).all(...params) as T[],
    run: (sql, params = []) => {
      database.prepare(sql).run(...params);
    },
    tx: (fn) => {
      database.exec('BEGIN');
      try {
        fn();
        database.exec('COMMIT');
      } catch (error) {
        database.exec('ROLLBACK');
        throw error;
      }
    },
  };
}

function fresh(): SqlDriver {
  const db = makeDb();
  runMigrations(db);
  return db;
}

// ── 러너 ────────────────────────────────────────────────────────────────────

describe('마이그레이션 러너', () => {
  it('빈 DB 에 최신 버전까지 올린다', () => {
    const db = makeDb();
    expect(runMigrations(db)).toBe(CODE_SCHEMA_VERSION);
    expect(readSchemaVersion(db)).toBe(CODE_SCHEMA_VERSION);
  });

  it('🔴 멱등이다 — 두 번 돌려도 같다', () => {
    const db = makeDb();
    runMigrations(db);
    expect(() => runMigrations(db)).not.toThrow();
    expect(readSchemaVersion(db)).toBe(CODE_SCHEMA_VERSION);
  });

  it('선언한 표가 전부 만들어진다', () => {
    const db = fresh();
    const rows = db.all<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
    );
    const names = new Set(rows.map((r) => r.name));
    for (const t of TABLE_NAMES) expect(names.has(t)).toBe(true);
  });

  it('🔴 표 목록이 실제와 같다 — 늘리고 TABLE_NAMES 를 안 고치면 걸린다', () => {
    const db = fresh();
    const rows = db.all<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
    );
    expect(new Set(rows.map((r) => r.name))).toEqual(new Set(TABLE_NAMES));
  });

  it('🔴 앱을 다운그레이드하면 멈춘다 (조용히 진행하지 않는다)', () => {
    const db = fresh();
    db.run('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [
      'schema_version',
      String(CODE_SCHEMA_VERSION + 5),
    ]);
    expect(() => runMigrations(db)).toThrow(/다운그레이드/);
  });

  it('버전이 숫자가 아니면 멈춘다', () => {
    const db = fresh();
    db.run('UPDATE meta SET value = ? WHERE key = ?', ['쓰레기', 'schema_version']);
    expect(() => readSchemaVersion(db)).toThrow();
  });

  it('MIGRATIONS 는 비어 있지 않고 길이가 곧 버전이다', () => {
    expect(MIGRATIONS.length).toBeGreaterThan(0);
    expect(CODE_SCHEMA_VERSION).toBe(MIGRATIONS.length);
  });
});

// ── 이사 ────────────────────────────────────────────────────────────────────

const NOW = '2026-10-07T00:00:00.000Z';

function legacy(over: Partial<LegacySnapshot> = {}): LegacySnapshot {
  return {
    categories: [
      { categoryId: 1, categoryName: '토익 필수', displayOrder: 0, createdAt: '2026-09-01T01:00:00.000Z', updatedAt: '2026-09-01T01:00:00.000Z' },
      { categoryId: 2, categoryName: '여행', displayOrder: 1, createdAt: '2026-09-02T01:00:00.000Z', updatedAt: '2026-09-02T01:00:00.000Z' },
    ],
    words: [
      { wordId: 101, categoryId: 1, word: 'meticulous', meanings: ['꼼꼼한', '세심한'], examples: [{ example: 'e', translation: 't' }], tags: [], memo: '', createdAt: '2026-09-01T02:00:00.000Z', updatedAt: '2026-09-01T02:00:00.000Z' },
      { wordId: 102, categoryId: 1, word: '機会', meanings: ['기회'], examples: [], createdAt: '2026-09-03T02:00:00.000Z', updatedAt: '2026-09-03T02:00:00.000Z', language: 'ja' },
    ],
    quizResults: [
      { resultId: 500, wordId: 101, isCorrect: true, quizType: 'multiple_choice', takenAt: '2026-09-05T00:00:00.000Z' },
      { resultId: 501, wordId: 102, isCorrect: false, quizType: 'multiple_choice', takenAt: '2026-09-06T00:00:00.000Z' },
    ],
    exams: [
      { examId: 'e1', language: 'ja', takenAt: '2026-10-01T00:00:00.000Z', questions: [{ id: 'q' }], answers: [0], score: { correct: 1, total: 1 } },
    ],
    ...over,
  };
}

describe('🔴 이사 — 단어를 잃지 않는다', () => {
  it('전부 옮겨진다', () => {
    const db = fresh();
    const r = importFromLegacy(db, legacy(), { now: NOW });
    expect(r).toMatchObject({ skipped: false, categories: 2, words: 2, quizResults: 2, exams: 1, dropped: 0 });
  });

  it('🔴 wordId 를 새로 매기지 않는다 (정답률이 엉뚱한 단어에 붙는 사고)', () => {
    const db = fresh();
    importFromLegacy(db, legacy(), { now: NOW });
    const ids = db.all<{ word_id: number }>('SELECT word_id FROM words ORDER BY word_id').map((r) => r.word_id);
    expect(ids).toEqual([101, 102]);
    // 결과가 가리키는 단어가 그대로다
    const joined = db.all<{ word: string; is_correct: number }>(
      'SELECT w.word, r.is_correct FROM quiz_results r JOIN words w ON w.word_id = r.word_id ORDER BY r.result_id',
    );
    expect(joined).toEqual([
      { word: 'meticulous', is_correct: 1 },
      { word: '機会', is_correct: 0 },
    ]);
  });

  it('뜻 · 예문 · 태그가 왕복한다', () => {
    const db = fresh();
    importFromLegacy(db, legacy(), { now: NOW });
    const row = db.get<{ meanings: string; examples: string }>('SELECT meanings, examples FROM words WHERE word_id = 101');
    expect(parseArray(row?.meanings ?? null)).toEqual(['꼼꼼한', '세심한']);
    expect(parseArray(row?.examples ?? null)).toEqual([{ example: 'e', translation: 't' }]);
  });

  it('language 가 있으면 보존되고 없으면 null 이다', () => {
    const db = fresh();
    importFromLegacy(db, legacy(), { now: NOW });
    expect(db.get<{ language: string | null }>('SELECT language FROM words WHERE word_id = 102')?.language).toBe('ja');
    expect(db.get<{ language: string | null }>('SELECT language FROM words WHERE word_id = 101')?.language).toBeNull();
  });

  it('🔴 멱등이다 — 두 번 돌려도 행이 안 늘어난다', () => {
    const db = fresh();
    importFromLegacy(db, legacy(), { now: NOW });
    importFromLegacy(db, legacy(), { now: NOW, force: true });
    expect(db.get<{ n: number }>('SELECT count(*) n FROM words')?.n).toBe(2);
    expect(db.get<{ n: number }>('SELECT count(*) n FROM quiz_results')?.n).toBe(2);
  });

  it('표식이 있으면 건너뛴다 (부팅마다 다시 하지 않는다)', () => {
    const db = fresh();
    importFromLegacy(db, legacy(), { now: NOW });
    expect(alreadyImported(db)).toBe(true);
    const again = importFromLegacy(db, legacy(), { now: NOW });
    expect(again.skipped).toBe(true);
    expect(again.words).toBe(0);
  });

  it('🔴 표식을 **맨 마지막에** 쓴다 (쓰기 순서를 직접 본다)', () => {
    /*
     * 🔴 이 검사는 변이 테스트가 **빠져나가서** 생겼다(2026-10-07).
     *    「표식을 맨 먼저 찍는다」로 깨뜨렸는데 30개가 전부 초록이었다 —
     *    트랜잭션이 있는 한 순서가 **관측되지 않기** 때문이다(되돌리면 둘 다 사라진다).
     *    그런데 파일 주석은 "맨 마지막에 찍는다"를 보장처럼 적고 있었다.
     *    주장을 했으면 재야 한다. 그래서 쓰기 순서를 직접 본다 —
     *    트랜잭션이 언젠가 약해져도(드라이버 교체 · tx 가 no-op) 이 성질이 혼자 선다.
     */
    const db = fresh();
    const original = db.run.bind(db);
    const order: string[] = [];
    const spy: SqlDriver = {
      ...db,
      run: (sql, params) => {
        order.push(String(sql));
        original(sql, params);
      },
    };
    importFromLegacy(spy, legacy(), { now: NOW });
    const markerAt = order.findIndex((sql) => sql.includes('meta'));
    expect(markerAt).toBe(order.length - 1);
    expect(order.length).toBeGreaterThan(1);
  });

  it('🔴 쓰다가 죽으면 표식도 데이터도 안 남는다', () => {
    const db = fresh();
    const broken = { ...legacy(), words: [{ wordId: 1, categoryId: 1, word: 'ok' }] } as LegacySnapshot;
    const original = db.run.bind(db);
    let calls = 0;
    const flaky: SqlDriver = {
      ...db,
      run: (sql, params) => {
        calls += 1;
        if (calls === 3) throw new Error('디스크가 죽었다');
        original(sql, params);
      },
    };
    expect(() => importFromLegacy(flaky, broken, { now: NOW })).toThrow();
    expect(alreadyImported(db)).toBe(false);
    expect(db.get<{ n: number }>('SELECT count(*) n FROM categories')?.n).toBe(0);
  });

  it('🔴 한 트랜잭션이다 — 반쯤 옮겨진 상태로 끝나지 않는다', () => {
    const db = fresh();
    const original = db.run.bind(db);
    let calls = 0;
    const flaky: SqlDriver = {
      ...db,
      run: (sql, params) => {
        calls += 1;
        if (calls === 4) throw new Error('중간에 죽었다');
        original(sql, params);
      },
    };
    expect(() => importFromLegacy(flaky, legacy(), { now: NOW })).toThrow();
    expect(db.get<{ n: number }>('SELECT count(*) n FROM categories')?.n).toBe(0);
    expect(db.get<{ n: number }>('SELECT count(*) n FROM words')?.n).toBe(0);
  });
});

describe('🔴 이사 — 깨진 입력에 던지지 않는다', () => {
  it('전부 비어 있어도 된다 (단어가 없는 기기)', () => {
    const db = fresh();
    const r = importFromLegacy(db, { categories: [], words: [], quizResults: [], exams: [] }, { now: NOW });
    expect(r.words).toBe(0);
    expect(alreadyImported(db)).toBe(true);
  });

  it('배열이 아니면 없는 것으로 본다', () => {
    const db = fresh();
    const r = importFromLegacy(
      db,
      { categories: null, words: 'nope', quizResults: 42, exams: undefined } as unknown as LegacySnapshot,
      { now: NOW },
    );
    expect(r).toMatchObject({ categories: 0, words: 0, quizResults: 0, exams: 0 });
  });

  it('🔴 반쪽짜리 단어는 버리고 나머지는 살린다', () => {
    const db = fresh();
    const r = importFromLegacy(
      db,
      legacy({
        words: [
          { wordId: 1, categoryId: 1, word: 'good' },
          { wordId: 2, categoryId: 1 }, // 단어 없음
          { categoryId: 1, word: 'no id' }, // id 없음
          { wordId: 3, word: 'no category' }, // 카테고리 없음
          null,
        ],
      }),
      { now: NOW },
    );
    expect(r.words).toBe(1);
    expect(r.dropped).toBe(4);
    expect(db.get<{ word: string }>('SELECT word FROM words')?.word).toBe('good');
  });

  it('뜻이 배열이 아니면 빈 배열로 둔다 (던지지 않는다)', () => {
    const db = fresh();
    importFromLegacy(db, legacy({ words: [{ wordId: 1, categoryId: 1, word: 'x', meanings: 'nope' }] }), { now: NOW });
    expect(parseArray(db.get<{ meanings: string }>('SELECT meanings FROM words')?.meanings ?? null)).toEqual([]);
  });

  it('날짜가 없으면 지금으로 채운다', () => {
    const db = fresh();
    importFromLegacy(db, legacy({ words: [{ wordId: 1, categoryId: 1, word: 'x' }] }), { now: NOW });
    expect(db.get<{ created_at: string }>('SELECT created_at FROM words')?.created_at).toBe(NOW);
  });

  it('isCorrect 가 true 가 아니면 전부 오답으로 센다', () => {
    const db = fresh();
    importFromLegacy(
      db,
      legacy({
        quizResults: [
          { resultId: 1, wordId: 1, isCorrect: true, quizType: 'x', takenAt: NOW },
          { resultId: 2, wordId: 1, isCorrect: 'true', quizType: 'x', takenAt: NOW },
          { resultId: 3, wordId: 1, quizType: 'x', takenAt: NOW },
        ],
      }),
      { now: NOW },
    );
    const rows = db.all<{ is_correct: number }>('SELECT is_correct FROM quiz_results ORDER BY result_id');
    expect(rows.map((r) => r.is_correct)).toEqual([1, 0, 0]);
  });
});

describe('parseArray — 어떤 입력에도 던지지 않는다', () => {
  it.each([
    [null, []],
    ['', []],
    ['{{{', []],
    ['{"a":1}', []],
    ['42', []],
    ['[1,2]', [1, 2]],
  ])('%s → %s', (raw, expected) => {
    expect(parseArray(raw as string | null)).toEqual(expected);
  });
});

describe('스키마가 실제로 지키는 것', () => {
  it('is_correct 는 0 또는 1 만 받는다', () => {
    const db = fresh();
    expect(() =>
      db.run('INSERT INTO quiz_results (result_id, word_id, is_correct, quiz_type, taken_at) VALUES (1,1,7,?,?)', ['x', NOW]),
    ).toThrow();
  });

  it('단어는 word_id 가 PK 라 같은 id 가 두 줄이 안 된다', () => {
    const db = fresh();
    db.run('INSERT INTO words (word_id, category_id, word, created_at, updated_at) VALUES (1,1,?,?,?)', ['a', NOW, NOW]);
    expect(() =>
      db.run('INSERT INTO words (word_id, category_id, word, created_at, updated_at) VALUES (1,1,?,?,?)', ['b', NOW, NOW]),
    ).toThrow();
  });

  it('검색 인덱스가 실재한다 (이 전환의 이유 중 하나다)', () => {
    const db = fresh();
    const idx = db.all<{ name: string }>("SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'ix_%'");
    const names = new Set(idx.map((r) => r.name));
    // 🔴 선언한 인덱스를 **전부** 센다. 둘만 보면 나머지가 지워져도 초록이다
    //    (2026-10-07 변이 테스트에서 ix_exams_taken 을 지웠는데 안 걸렸다)
    expect(names).toEqual(
      new Set(['ix_words_category', 'ix_words_word', 'ix_results_word', 'ix_results_taken', 'ix_exams_taken']),
    );
  });
});

describe('🔴 v2 — 시험 기록의 카테고리 (Expand-only)', () => {
  it('스키마 버전이 2다', () => {
    expect(CODE_SCHEMA_VERSION).toBe(2);
    expect(MIGRATIONS).toHaveLength(2);
  });

  it('category_id 칸이 생겼다', () => {
    const db = fresh();
    const cols = db.all<{ name: string }>('PRAGMA table_info(exams)').map((r) => r.name);
    expect(cols).toContain('category_id');
  });

  it('🔴 v1 기기가 v2 로 올라간다 (덧붙이기만 했으므로)', () => {
    // v1 만 적용된 DB 를 만든 뒤 러너를 돌린다
    const db = makeDb();
    db.exec(META_TABLE_SQL);
    db.exec(MIGRATIONS[0]!);
    db.run('INSERT INTO meta (key, value) VALUES (?, ?)', ['schema_version', '1']);
    db.run('INSERT INTO exams (exam_id, language, taken_at, questions, answers, score) VALUES (?,?,?,?,?,?)', [
      'old', 'ja', NOW, '[]', '[]', '{}',
    ]);
    expect(runMigrations(db)).toBe(2);
    // 🔴 올리면서 옛 행이 살아 있어야 한다
    expect(db.get<{ n: number }>('SELECT count(*) n FROM exams')?.n).toBe(1);
    expect(db.get<{ category_id: number | null }>('SELECT category_id FROM exams')?.category_id).toBeNull();
  });

  it('이사가 categoryId 를 담는다', () => {
    const db = fresh();
    importFromLegacy(db, legacy({ exams: [{ examId: 'e', language: 'ja', takenAt: NOW, questions: [], answers: [], categoryId: 3 }] }), { now: NOW });
    expect(db.get<{ category_id: number }>('SELECT category_id FROM exams')?.category_id).toBe(3);
  });

  it('옛 기록(카테고리 없음)도 들어간다', () => {
    const db = fresh();
    importFromLegacy(db, legacy(), { now: NOW });
    expect(db.get<{ category_id: number | null }>('SELECT category_id FROM exams')?.category_id).toBeNull();
  });
});
