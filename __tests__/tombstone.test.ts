/**
 * 🔴 **지우면 묘비를 세운다. 행을 없애지 않는다.**
 *
 * 2026-10-12 사장님 지시로 서버 복구를 만들면서 바꾼 것이다(`docs/SERVER_RESTORE_PLAN.md` §4).
 *
 * ```
 * 묘비 전   지움 → 기기에서 사라짐 · 서버엔 남음        밀기만 하니 아무도 안 다친다
 * 묘비 후   지움 → 묘비 · 밀기가 "지웠다"를 서버에 전한다
 * 안 바꿨다면  🔴 당기기를 켠 날 **복구가 지운 단어를 되살린다**
 * ```
 *
 * `node:sqlite` 에 **진짜 DB 를 세워서** 본다(`db.test.ts` 와 같은 러너·같은 스키마).
 * 묘비는 "행이 남는가"가 아니라 **"읽는 쪽이 안 보는가"** 로 판정해야 하므로 실제 SQL 이 필요하다.
 */

declare const require: (id: string) => any;
declare const __dirname: string;

const fs = require('fs') as { readFileSync(p: string, enc: string): string };
const path = require('path') as { join(...parts: string[]): string };

import { runMigrations, type SqlDriver } from '../src/db/migrate';
import { categoryRepo, syncRepo, wordRepo } from '../src/db/repo';

const { DatabaseSync } = require('node:sqlite') as { DatabaseSync: new (p: string) => any };

function fresh(): SqlDriver {
  const database = new DatabaseSync(':memory:');
  const db: SqlDriver = {
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
  // ⚠ `runMigrations` 가 meta 표를 스스로 만든다(`db.test.ts` 와 같은 모양)
  runMigrations(db);
  return db;
}

const T0 = '2026-10-01T00:00:00.000Z';
const T1 = '2026-10-12T09:00:00.000Z';

function seed(db: SqlDriver): void {
  categoryRepo.create(db, 1, { categoryName: '영어', displayOrder: 1 }, T0);
  categoryRepo.create(db, 2, { categoryName: '일본어', displayOrder: 2 }, T0);
  wordRepo.create(db, 101, { categoryId: 1, word: 'apple', meanings: ['사과'], examples: [] }, T0);
  wordRepo.create(db, 102, { categoryId: 1, word: 'book', meanings: ['책'], examples: [] }, T0);
  wordRepo.create(db, 201, { categoryId: 2, word: '水', meanings: ['물'], examples: [] }, T0);
}

const rowCount = (db: SqlDriver, table: string): number =>
  db.get<{ n: number }>(`SELECT count(*) AS n FROM ${table}`)?.n ?? 0;

describe('🔴 단어 삭제 — 묘비', () => {
  it('화면에서는 사라지고 행은 남는다', () => {
    const db = fresh();
    seed(db);
    wordRepo.delete(db, 102, T1);

    expect(wordRepo.getAll(db).map((w) => w.wordId)).toEqual([101, 201]);
    expect(wordRepo.getById(db, 102)).toBeUndefined();
    expect(wordRepo.getByCategoryId(db, 1).map((w) => w.wordId)).toEqual([101]);
    // 🔴 행은 남아 있어야 한다 — 그게 밀 수 있는 유일한 근거다
    expect(rowCount(db, 'words')).toBe(3);
  });

  it('🔴 밀기는 묘비를 본다 — deletedAt 이 들어 있다', () => {
    const db = fresh();
    seed(db);
    wordRepo.delete(db, 102, T1);

    const rows = syncRepo.words(db);
    expect(rows).toHaveLength(3);
    const dead = rows.find((r) => r.wordId === 102);
    expect(dead?.deletedAt).toBe(T1);
    expect(rows.filter((r) => r.deletedAt === null)).toHaveLength(2);
  });

  it('🔴 updated_at 이 같이 올라간다 — 안 올리면 묘비가 영원히 안 밀린다', () => {
    /*
     * 밀기는 `lastUpdatedAt` 이후에 바뀐 것만 보낸다(`pickChanged`). `updated_at` 을 그대로
     * 두면 묘비는 **이미 밀어 보낸 시각**을 달고 있어 다시 뽑히지 않는다 —
     * 기기에서는 지워졌는데 서버에는 영원히 살아 있고, **오류는 안 난다.**
     */
    const db = fresh();
    seed(db);
    wordRepo.delete(db, 102, T1);
    expect(syncRepo.words(db).find((r) => r.wordId === 102)?.updatedAt).toBe(T1);
  });

  it('이미 지운 것을 또 지워도 시각이 덮이지 않는다', () => {
    const db = fresh();
    seed(db);
    wordRepo.delete(db, 102, T1);
    wordRepo.delete(db, 102, '2026-12-25T00:00:00.000Z');
    expect(syncRepo.words(db).find((r) => r.wordId === 102)?.deletedAt).toBe(T1);
  });

  it('살아 있는 개수만 센다 — 되감기 판정의 근거다', () => {
    const db = fresh();
    seed(db);
    wordRepo.delete(db, 102, T1);
    expect(syncRepo.aliveCounts(db)).toMatchObject({ words: 2, categories: 2 });
  });
});

describe('🔴 카테고리 삭제 — 그 안의 단어까지 한 트랜잭션으로', () => {
  it('카테고리와 단어가 함께 묘비가 된다', () => {
    const db = fresh();
    seed(db);
    categoryRepo.delete(db, 1, T1);

    expect(categoryRepo.getAll(db).map((c) => c.categoryId)).toEqual([2]);
    expect(wordRepo.getAll(db).map((w) => w.wordId)).toEqual([201]);
    // 행은 전부 남는다
    expect(rowCount(db, 'categories')).toBe(2);
    expect(rowCount(db, 'words')).toBe(3);

    const dead = syncRepo.words(db).filter((r) => r.deletedAt !== null);
    expect(dead.map((r) => r.wordId).sort()).toEqual([101, 102]);
    expect(syncRepo.categories(db).find((c) => c.categoryId === 1)?.deletedAt).toBe(T1);
  });

  it('🔴 다른 카테고리의 단어는 건드리지 않는다', () => {
    const db = fresh();
    seed(db);
    categoryRepo.delete(db, 1, T1);
    expect(syncRepo.words(db).find((r) => r.wordId === 201)?.deletedAt).toBeNull();
  });

  it('지운 카테고리에 다시 같은 이름을 만들 수 있다', () => {
    // ⚠ 묘비가 이름을 붙들고 있으면 사용자는 "지웠는데 못 만든다"를 겪는다
    const db = fresh();
    seed(db);
    categoryRepo.delete(db, 1, T1);
    const made = categoryRepo.create(db, 3, { categoryName: '영어', displayOrder: 1 }, T1);
    expect(made.categoryId).toBe(3);
    expect(categoryRepo.getAll(db).map((c) => c.categoryName).sort()).toEqual(['영어', '일본어']);
  });
});

// ── 🔴 소스를 훑어 규칙을 기계로 지킨다 ─────────────────────────────────────

const read = (rel: string): string => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');

/** 주석을 **같은 길이 공백**으로 바꾼다 — 줄 번호가 밀리지 않는다(형제 사냥에서 배운 것) */
const stripComments = (src: string): string =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/\/\/[^\n]*/g, (m) => ' '.repeat(m.length));

describe('🔴 하드 삭제가 돌아오지 않는다 (소스 훑기)', () => {
  const src = stripComments(read('src/db/repo.ts'));

  it('⚠ 가드가 실제로 읽었다', () => {
    expect(src).toContain('export const wordRepo');
    expect(src).toContain('export const backupRepo');
  });

  it('🔴 DELETE FROM words|categories 는 backupRepo 안에만 있다', () => {
    /*
     * `backupRepo.restore` 는 **전부 지우고 다시 넣는** 자리라 하드 삭제가 맞다.
     * 그 밖에서 나오면 묘비를 건너뛰는 길이 생긴 것이다.
     */
    const at = src.indexOf('export const backupRepo');
    expect(at).toBeGreaterThan(0);
    const before = src.slice(0, at);
    expect(before).not.toMatch(/DELETE\s+FROM\s+(words|categories)/i);
  });

  it('🔴 지우는 두 함수가 deleted_at 을 쓴다', () => {
    for (const name of ['export const categoryRepo', 'export const wordRepo']) {
      const start = src.indexOf(name);
      const body = src.slice(start, src.indexOf('export const', start + 10));
      const del = body.slice(body.indexOf('delete(db: SqlDriver'));
      expect(del).toContain('deleted_at = ?');
      // 🔴 updated_at 을 같이 올리지 않으면 묘비가 안 밀린다(위 단위 검사와 같은 이유)
      expect(del).toContain('updated_at = ?');
    }
  });

  it('🔴 읽는 함수는 전부 deleted_at IS NULL 을 건다', () => {
    /*
     * ⚠ **`syncRepo` 보다 앞만 본다.** `syncRepo` 는 일부러 묘비를 읽는 유일한 곳이다.
     *
     * 🔴 처음에는 `ORDER BY` 로 예외를 가렸는데, 그 조건이 `categoryRepo.getAll` 까지
     *    걸러내 **카테고리 쿼리를 하나도 검사하지 않고 초록**이 됐다. 위치로 가르는 쪽이 맞다 —
     *    쿼리 문구는 바뀌지만 "어느 객체의 것인가"는 바뀌지 않는다.
     */
    const upTo = src.indexOf('export const syncRepo');
    expect(upTo).toBeGreaterThan(0);
    const selects = src.slice(0, upTo).match(/SELECT \* FROM (words|categories)[^']*/g) ?? [];
    expect(selects.length).toBeGreaterThan(4);
    for (const q of selects) expect(q).toContain('deleted_at IS NULL');
  });
});
