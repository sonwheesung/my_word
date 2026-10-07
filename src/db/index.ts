/**
 * 로컬 DB 연결 — **단어의 정본.**
 *
 * 🔴 **여기만 `expo-sqlite` 를 안다.** 스키마 · 러너 · 이사는 드라이버만 받는 순수 모듈이라
 *    가드가 `node:sqlite` 로 같은 코드를 돈다(`__tests__/db.test.ts`). mission 승계.
 *
 * ## 🔴 웹에서는 SQLite 를 쓰지 않는다
 *
 * `expo-sqlite` 의 웹 지원은 WASM 설정을 따로 요구한다. 이 앱의 웹 실행은 **Puppeteer UI 검증
 * 전용이고 배포 대상이 아니다**(`services/commonServer/client.ts` 가 SecureStore 에 대해 같은
 * 판단을 적고 있다). 그래서 웹은 기존 localStorage 경로를 그대로 쓴다 —
 * 검증 수단을 지키는 값이 웹 SQLite 를 켜는 값보다 크다.
 *
 * ## 🔴 전환의 대가 (적어 둔다)
 *
 * 이사한 뒤 새 단어는 **SQLite 에만** 들어간다. 옛 `@my_word_*` 키는 지우지 않지만
 * **이사 시점의 스냅샷으로 멈춘다.** 그래서 앱을 이 버전보다 **낮은 버전으로 되돌리면**
 * 그 뒤에 추가한 단어가 안 보인다. 어떤 마이그레이션이든 치르는 값이고, 되돌리지 않는 한 문제가 없다.
 * ⚠ 그래서 이 버전은 **되돌릴 수 없는 릴리스**다. 스토어에 올리기 전에 실기기로 반드시 본다.
 */
import { Platform } from 'react-native';

import { runMigrations, type SqlDriver } from './migrate';
import { importFromLegacy, type ImportReport, type LegacySnapshot } from './importFromLegacy';

const DB_NAME = 'myword.db';

/** 네이티브가 아니면 SQLite 를 쓰지 않는다(위 주석) */
export const sqliteAvailable = Platform.OS !== 'web';

let cached: SqlDriver | null = null;
let bootError: string | null = null;

function wrap(database: any): SqlDriver {
  return {
    exec: (sql) => database.execSync(sql),
    get: <T>(sql: string, params: readonly unknown[] = []) =>
      (database.getFirstSync(sql, params) as T | null) ?? undefined,
    all: <T>(sql: string, params: readonly unknown[] = []) => database.getAllSync(sql, params) as T[],
    run: (sql, params = []) => {
      database.runSync(sql, params as any);
    },
    tx: (fn) => database.withTransactionSync(fn),
  };
}

/**
 * DB 를 연다. **실패하면 `null`** — 던지지 않는다.
 *
 * 🔴 부르는 쪽이 `null` 을 받으면 **옛 저장소로 계속 돈다.** DB 를 못 열었다고 앱을 못 쓰게
 *    만들지 않는다. 이 앱의 규율이 *"서버가 죽어도 화면은 멀쩡히"* 인데 저장소에도 같이 적용한다.
 */
export function getDb(): SqlDriver | null {
  if (cached !== null) return cached;
  if (!sqliteAvailable || bootError !== null) return null;
  try {
    // ⚠ 최상위 import 를 하지 않는다 — 웹 번들에 WASM 경로가 끌려 들어온다
    const SQLite = require('expo-sqlite');
    const database = SQLite.openDatabaseSync(DB_NAME);
    const driver = wrap(database);
    runMigrations(driver);
    cached = driver;
    return driver;
  } catch (error: any) {
    bootError = String(error?.message ?? error);
    console.warn('[db] 로컬 DB 를 열지 못했다. 옛 저장소로 계속한다:', bootError);
    return null;
  }
}

/** 부팅 진단. 설정 화면이나 로그가 "왜 옛 저장소를 쓰고 있나"를 말할 수 있어야 한다 */
export const dbBootError = (): string | null => bootError;

/**
 * 부팅 때 1회: 마이그레이션 + 이사.
 *
 * 🔴 **던지지 않는다.** 이사가 실패하면 `null` 을 주고 앱은 옛 저장소로 계속 돈다.
 * ⚠ 멱등이라 매 부팅 불러도 된다 — 표식이 있으면 이사는 건너뛴다.
 */
export function bootLocalDb(readLegacy: () => LegacySnapshot): ImportReport | null {
  const db = getDb();
  if (db === null) return null;
  try {
    const report = importFromLegacy(db, readLegacy());
    if (!report.skipped) {
      console.log(
        `[db] 이사 완료: 카테고리 ${report.categories} · 단어 ${report.words} · 결과 ${report.quizResults} · 시험 ${report.exams}` +
          (report.dropped > 0 ? ` · 버린 행 ${report.dropped}` : ''),
      );
    }
    return report;
  } catch (error: any) {
    // 🔴 이사 실패를 삼키되 **남긴다.** 조용히 옛 저장소로 돌면 왜 그런지 아무도 모른다
    bootError = `이사 실패: ${String(error?.message ?? error)}`;
    console.warn('[db]', bootError);
    cached = null;
    return null;
  }
}

export type { SqlDriver, ImportReport, LegacySnapshot };
