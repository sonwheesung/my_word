/**
 * 로컬 SQLite 스키마. **정본은 `docs/data-model.md` 이고 표 이름이 어긋나면 가드가 FAIL 한다.**
 *
 * 승계: `C:\project\mission` 의 `db/schema.ts` · `db/migrate.ts` 구조를 가져왔다
 * (그쪽은 Re:Read 에서 승계했다). 바퀴를 다시 만들지 않는다.
 *
 * 🔴 **순수하다.** expo 모듈을 import 하지 않는다 — 가드가 `node:sqlite` 에 그대로 세운다.
 *    그래서 스키마와 쿼리를 **에뮬레이터 없이** 검증할 수 있다.
 *
 * 🔴 **Expand-only.** `MIGRATIONS` 에 덧붙이기만 한다. 컬럼을 바꾸거나 지우지 않고 down 이 없다.
 *    운영 중인 앱이라 다운그레이드가 실재하고, 그때 러너가 **조용히 진행하지 않고 멈춘다.**
 *
 * ## 왜 AsyncStorage 에서 옮기나
 *
 * 지금은 단어 전체가 `@my_word_words` 키 하나에 **JSON 한 덩어리**로 들어 있다.
 * 단어 하나를 고쳐도 전체를 다시 쓰고, 검색은 전부 JS 로 훑는다. 수천 개가 되면 느려진다.
 *
 * ⚠ **그러나 사용자에게 보이는 변화는 0 이어야 한다.** 이 전환의 성패는 기능이 아니라
 *   **이사(`importFromLegacy`)** 에 있다 — 40명의 단어가 걸려 있고 단어는 이 앱의 가치 전부다.
 */

/** 표 이름. 🔴 늘리면 `docs/data-model.md` 와 가드를 같이 고친다 */
export const TABLE_NAMES = ['categories', 'words', 'quiz_results', 'exams', 'meta'] as const;
export type TableName = (typeof TABLE_NAMES)[number];

/** 러너가 버전을 읽으려면 이 표가 먼저 있어야 한다. 그래서 마이그레이션 밖이다 */
export const META_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);`;

/*
 * v1 — AsyncStorage 의 모양을 **그대로** 옮긴다.
 *
 * 🔴 **id 를 새로 매기지 않는다.** `wordId` 는 `quiz_results.word_id` 와 `@my_word_srs` 가
 *    참조하는 값이다. 여기서 번호를 다시 매기면 **정답률이 엉뚱한 단어에 붙는다** —
 *    `backupService` 의 `repairNextId` 주석이 같은 사고를 적고 있다.
 *
 * ⚠ 배열(뜻 · 예문 · 태그)은 JSON 문자열로 둔다. 정규화해서 표를 더 만들 수도 있지만,
 *   이번 전환의 목표는 **저장 엔진 교체**이지 모델 재설계가 아니다. 한 번에 둘을 바꾸면
 *   깨졌을 때 어느 쪽인지 모른다(플래시카드 때 배운 것과 같은 규율).
 *
 * ⚠ `updated_at` · `deleted_at` 은 **지금 안 쓴다.** 서버 동기화(다음 단계)가 쓸 칸이고,
 *   나중에 ALTER 하는 것보다 지금 넣어 두는 쪽이 싸다(mission 이 같은 이유로 미리 뒀다).
 */
const V1 = `
CREATE TABLE categories (
  category_id   INTEGER PRIMARY KEY,
  category_name TEXT    NOT NULL,
  description   TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT    NOT NULL,
  updated_at    TEXT    NOT NULL,
  deleted_at    TEXT
);

CREATE TABLE words (
  word_id     INTEGER PRIMARY KEY,
  category_id INTEGER NOT NULL,
  word        TEXT    NOT NULL,
  -- JSON 배열. 뜻은 여러 개일 수 있다
  meanings    TEXT    NOT NULL DEFAULT '[]',
  -- JSON 배열 [{example, translation}]
  examples    TEXT    NOT NULL DEFAULT '[]',
  tags        TEXT    NOT NULL DEFAULT '[]',
  memo        TEXT,
  -- 'ja' | 'en' | 'ko' | 'zh'. 없을 수 있다(기존 단어)
  language    TEXT,
  created_at  TEXT    NOT NULL,
  updated_at  TEXT    NOT NULL,
  deleted_at  TEXT
);
-- 단어장은 카테고리로 거르고 등록순으로 본다
CREATE INDEX ix_words_category ON words(category_id, created_at);
-- 🔴 검색이 이 전환의 이유 중 하나다. AsyncStorage 에서는 전부 JS 로 훑었다
CREATE INDEX ix_words_word ON words(word);

CREATE TABLE quiz_results (
  result_id      INTEGER PRIMARY KEY,
  word_id        INTEGER NOT NULL,
  is_correct     INTEGER NOT NULL CHECK (is_correct IN (0, 1)),
  quiz_type      TEXT    NOT NULL,
  answer_type    TEXT,
  word           TEXT,
  correct_answer TEXT,
  user_answer    TEXT,
  taken_at       TEXT    NOT NULL
);
-- 통계 · SRS 가 읽는 축
CREATE INDEX ix_results_word ON quiz_results(word_id);
CREATE INDEX ix_results_taken ON quiz_results(taken_at);

-- AI 시험 기록. 문제 본문을 그대로 담는다(재시험 · 성적표가 읽는다)
CREATE TABLE exams (
  exam_id   TEXT PRIMARY KEY,
  language  TEXT NOT NULL,
  taken_at  TEXT NOT NULL,
  questions TEXT NOT NULL,
  answers   TEXT NOT NULL,
  score     TEXT NOT NULL
);
CREATE INDEX ix_exams_taken ON exams(taken_at);
`;

/*
 * v2 — 시험 기록에 카테고리(2026-10-07).
 *
 * 🔴 V1 을 고치지 않고 **덧붙인다.** 이미 v1 을 지나간 기기가 있고(오늘 에뮬레이터가 그랬다),
 *    V1 을 고치면 그 기기는 이 변경을 영원히 못 받는다. 그게 Expand-only 의 이유다.
 *
 * ⚠ 단어 담기가 이 값을 쓴다 — 담을 단어장이 어디인지. 없으면 화면이 "모르겠다"고 말한다.
 *   옛 기록에는 없으므로 NULL 을 허용한다.
 */
const V2 = `
ALTER TABLE exams ADD COLUMN category_id INTEGER;
`;

/**
 * 🔴 **덧붙이기만 한다.** 배열의 길이가 곧 스키마 버전이다.
 *    기존 항목을 고치면 이미 그 버전을 지나간 기기가 그 변경을 영원히 못 받는다.
 */
export const MIGRATIONS: readonly string[] = [V1, V2];
