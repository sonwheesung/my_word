/**
 * 마이그레이션 러너. 승계: `C:\project\mission` 의 `db/migrate.ts`(그쪽은 Re:Read 에서 승계).
 *
 * 🔴 **순수하다.** 드라이버 인터페이스만 받으므로 `expo-sqlite`(앱)와 `node:sqlite`(가드)가
 *    **같은 러너**를 돈다. 그래서 스키마를 에뮬레이터 없이 검증할 수 있다.
 */
import { META_TABLE_SQL, MIGRATIONS } from './schema';

/** 앱과 가드가 같은 모양으로 감싸는 최소 드라이버 */
export interface SqlDriver {
  exec(sql: string): void;
  get<T>(sql: string, params?: readonly unknown[]): T | undefined;
  all<T>(sql: string, params?: readonly unknown[]): T[];
  run(sql: string, params?: readonly unknown[]): void;
  /** 한 묶음을 원자적으로. 안에서 던지면 전부 되돌린다 */
  tx(fn: () => void): void;
}

const VERSION_KEY = 'schema_version';

/** 코드가 아는 최신 버전 = 마이그레이션 개수 */
export const CODE_SCHEMA_VERSION = MIGRATIONS.length;

export function readSchemaVersion(db: SqlDriver): number {
  const row = db.get<{ value: string }>('SELECT value FROM meta WHERE key = ?', [VERSION_KEY]);
  if (row === undefined) return 0;
  const n = Number(row.value);
  if (!Number.isInteger(n) || n < 0) {
    throw new Error(`meta.schema_version 이 정수가 아니다: ${row.value}`);
  }
  return n;
}

/**
 * 밀린 마이그레이션을 전부 적용하고 최종 버전을 돌려준다. **멱등이다.**
 *
 * 🔴 **앱을 다운그레이드한 상황에서 조용히 진행하지 않는다.** down 이 없으므로 그대로 두면
 *    새 스키마를 옛 코드가 읽다가 **엉뚱한 데이터를 쓴다.** 멈추는 쪽이 낫다.
 */
export function runMigrations(db: SqlDriver): number {
  db.exec(META_TABLE_SQL);
  const from = readSchemaVersion(db);
  if (from > CODE_SCHEMA_VERSION) {
    throw new Error(`DB v${from} > 코드 v${CODE_SCHEMA_VERSION}: 앱을 다운그레이드했다`);
  }
  for (let v = from; v < MIGRATIONS.length; v += 1) {
    const sql = MIGRATIONS[v];
    if (sql === undefined) {
      throw new Error(`마이그레이션 v${v + 1} 이 비어 있다`);
    }
    // 🔴 한 버전을 한 트랜잭션으로. 중간에 죽으면 그 버전은 통째로 안 올라간다
    db.tx(() => {
      db.exec(sql);
      db.run(
        'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
        [VERSION_KEY, String(v + 1)],
      );
    });
  }
  return CODE_SCHEMA_VERSION;
}
