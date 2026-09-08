/**
 * 날짜 유틸 — 로컬 달력 기준의 날짜 키와 그 산술
 *
 * ⚠ 원래 "활동 기록/스트릭 집계 전용"이었다. 간격 반복(srs)이 만기일을 같은 규칙으로
 *   다뤄야 해서 범위를 넓혔다 — 사본을 하나 더 만들면 언젠가 한쪽만 고쳐진다.
 *
 * 저장소에는 시각을 ISO-8601(UTC) 문자열로 보관한다(포맷 변경 없음).
 * 다만 "며칠에 활동했는가"는 사용자의 로컬 달력 기준이어야 하므로
 * 집계 시점에만 로컬 시간대로 환산한다.
 *
 * 예) KST 08-05 08:30 에 저장 → ISO 는 2026-08-04T23:30Z.
 *     UTC 로 자르면 08-04 로 집계되어 히트맵이 하루 밀리고 스트릭이 끊긴다.
 */

/** Date 객체를 로컬 시간대 기준 YYYY-MM-DD 로 포맷 */
export function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * 저장된 ISO 타임스탬프를 로컬 시간대 기준 YYYY-MM-DD 키로 변환
 * 파싱 불가한 값은 문자열 앞부분으로 폴백하여, 손상된 레코드가 있어도
 * 전체 집계가 중단되지 않도록 한다.
 */
export function toLocalDateKey(isoString: string): string {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) {
    return isoString.split('T')[0];
  }
  return formatLocalDate(date);
}

// --- 날짜 키 산술 (간격 반복의 만기일 계산에 쓴다) ---
//
// 만기는 **시각이 아니라 날짜**로 다룬다("오늘 복습할 단어"이지 "14시 32분에 복습할 단어"가
// 아니다). 로컬 자정 기준 'YYYY-MM-DD' 를 쓰면 사전순 비교가 곧 날짜 비교가 된다.

const DATE_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86400000;

/** 'YYYY-MM-DD' 형식인가. toLocalDateKey 는 파싱 실패 시 원본 앞부분을 돌려주므로 한 번 거른다 */
export function isDateKey(value: unknown): value is string {
  return typeof value === 'string' && DATE_KEY.test(value);
}

/**
 * 날짜 키를 UTC 정오의 밀리초로. 정오로 두는 이유는 서머타임 전환일에도 하루가
 * 밀리지 않게 하기 위해서다(자정 기준이면 ±1시간에 날짜가 바뀐다).
 */
function keyToUtcNoon(key: string): number | null {
  const m = DATE_KEY.exec(key);
  if (!m) return null;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12);
}

/** 두 날짜 키 사이의 일수. 형식이 깨졌으면 0 — 같은 날로 보는 쪽이 안전하다 */
export function daysBetween(fromKey: string, toKey: string): number {
  const a = keyToUtcNoon(fromKey);
  const b = keyToUtcNoon(toKey);
  if (a === null || b === null) return 0;
  return Math.round((b - a) / DAY_MS);
}

/** 날짜 키에 일수를 더한다. 월·연·윤년 경계를 알아서 넘는다 */
export function addDays(key: string, days: number): string {
  const base = keyToUtcNoon(key);
  if (base === null || !Number.isFinite(days)) return key;
  const moved = new Date(base + Math.round(days) * DAY_MS);
  // UTC 정오에서 만든 값이라 UTC 성분을 그대로 읽어야 날짜가 안 밀린다
  const y = moved.getUTCFullYear();
  const m = String(moved.getUTCMonth() + 1).padStart(2, '0');
  const d = String(moved.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
