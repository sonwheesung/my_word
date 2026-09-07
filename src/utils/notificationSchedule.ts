/**
 * 학습 리마인더의 **시각 계산**만 담는다. 네이티브 모듈을 하나도 import 하지 않는다.
 *
 * 🔴 일부러 notificationService 와 갈라 놨다. 예약 규칙은 이 앱에서 가장 틀리기 쉬운 로직인데
 *    (자정 경계·"내일부터"·시각 파싱), 그 검증이 expo-notifications 목에 딸려 죽는 일이 없어야 한다.
 *    2026-09-01 에 목이 빠져 스위트 7개가 통째로 죽고도 "26/26 통과"로 보였던 적이 있다.
 */

/** "HH:mm" 24시간 표기 */
export interface TimeOfDay {
  hour: number;
  minute: number;
}

/**
 * "HH:mm" 를 파싱한다. 형식이 아니거나 범위를 벗어나면 null.
 *
 * 저장소에서 읽은 값이라 **믿지 않는다** — 예전 버전이 쓴 값, 손으로 고친 값, 잘린 값이 올 수 있고
 * 여기서 NaN 이 새어 나가면 `setHours(NaN)` 이 되어 Invalid Date 로 예약이 통째로 실패한다.
 */
export function parseTime(value: string | null | undefined): TimeOfDay | null {
  if (!value) return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;

  return { hour, minute };
}

/** TimeOfDay → "HH:mm". 저장·표시 양쪽에서 같은 함수를 쓴다 */
export function formatTime({ hour, minute }: TimeOfDay): string {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

/**
 * 알림을 걸 시각들을 만든다 — **내일부터** `days` 일치, 매일 같은 시각.
 *
 * 왜 "내일부터"인가:
 *   앱이 안 켜져 있으면 "오늘 썼나?"를 검사할 코드가 **돌지 않는다.** 그래서 조건을 트리거 시점에
 *   판단할 수 없고, **예약하는 순간에 미리 반영**하는 수밖에 없다. 앱을 열 때마다 전부 취소하고
 *   다시 걸므로, 열면 열수록 첫 알림이 뒤로 밀린다 = "하루 안 쓰면 온다".
 *
 * ⚠ 최소 간격이 정확히 24시간은 아니다. 23:00 에 열고 시각이 20:00 이면 내일 20:00 은 21시간
 *   뒤다. 그 한 경우를 맞추려고 "24시간 이상"을 넣으면 반대로 첫 알림이 45시간 뒤가 되는 날이
 *   생긴다. 사용자가 느끼는 "하루"에는 21시간도 하루라, 규칙을 단순하게 두는 쪽을 골랐다.
 *
 * 반환값은 전부 `now` 보다 미래다(내일 이후이므로 자정 직전에 불려도 뒤집히지 않는다).
 */
export function computeSlots(now: Date, time: TimeOfDay, days: number): Date[] {
  if (days <= 0) return [];

  const slots: Date[] = [];
  for (let i = 1; i <= days; i++) {
    const slot = new Date(now.getTime());
    // setDate 는 월/연을 알아서 넘긴다(1월 31일 + 1일 = 2월 1일).
    // 순서가 중요하다 — 날짜를 먼저 옮기고 시/분을 덮어써야 한다.
    slot.setDate(slot.getDate() + i);
    slot.setHours(time.hour, time.minute, 0, 0);
    slots.push(slot);
  }
  return slots;
}
