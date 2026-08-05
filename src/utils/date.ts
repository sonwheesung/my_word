/**
 * 날짜 유틸 — 활동 기록/스트릭 집계 전용
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
