/**
 * 학습 리마인더의 **시각 계산** 회귀 테스트 (jest.setup.js 가 TZ=Asia/Seoul 로 고정).
 *
 * 여기서만 검증할 수 있는 것들이라 따로 뒀다 — 예약 자체는 OS 가 하고, 우리가 틀릴 수 있는 것은
 * "언제로 잡았나"뿐이다. 자정·월말·연말 경계와, 저장소에서 온 깨진 시각 문자열이 표적이다.
 */

import { computeSlots, formatTime, parseTime } from '../src/utils/notificationSchedule';

describe('parseTime', () => {
  it('정상적인 HH:mm 을 파싱한다', () => {
    expect(parseTime('20:00')).toEqual({ hour: 20, minute: 0 });
    expect(parseTime('00:00')).toEqual({ hour: 0, minute: 0 });
    expect(parseTime('23:59')).toEqual({ hour: 23, minute: 59 });
  });

  it('한 자리 시각과 앞뒤 공백을 받아 준다', () => {
    expect(parseTime('9:05')).toEqual({ hour: 9, minute: 5 });
    expect(parseTime('  20:30  ')).toEqual({ hour: 20, minute: 30 });
  });

  it('빈 값은 null 이다', () => {
    expect(parseTime(null)).toBeNull();
    expect(parseTime(undefined)).toBeNull();
    expect(parseTime('')).toBeNull();
  });

  it('범위를 벗어난 값은 null 이다 — 여기서 새면 setHours(NaN) 으로 예약이 통째로 실패한다', () => {
    expect(parseTime('24:00')).toBeNull();
    expect(parseTime('20:60')).toBeNull();
    expect(parseTime('-1:00')).toBeNull();
  });

  it('형식이 아닌 문자열은 null 이다', () => {
    expect(parseTime('abc')).toBeNull();
    expect(parseTime('2000')).toBeNull();
    expect(parseTime('20:0')).toBeNull();
    expect(parseTime('20:00:00')).toBeNull();
  });
});

describe('formatTime', () => {
  it('두 자리로 채운다', () => {
    expect(formatTime({ hour: 9, minute: 5 })).toBe('09:05');
    expect(formatTime({ hour: 20, minute: 0 })).toBe('20:00');
    expect(formatTime({ hour: 0, minute: 0 })).toBe('00:00');
  });

  it('parseTime 과 왕복해도 같다', () => {
    for (const value of ['00:00', '09:05', '20:00', '23:59']) {
      const parsed = parseTime(value);
      expect(parsed).not.toBeNull();
      expect(formatTime(parsed!)).toBe(value);
    }
  });
});

describe('computeSlots', () => {
  const TIME = { hour: 20, minute: 0 };

  it('요청한 개수만큼 만든다', () => {
    const slots = computeSlots(new Date(2026, 8, 7, 10, 0), TIME, 7);
    expect(slots).toHaveLength(7);
  });

  it('0 이하면 빈 배열이다', () => {
    expect(computeSlots(new Date(2026, 8, 7, 10, 0), TIME, 0)).toEqual([]);
    expect(computeSlots(new Date(2026, 8, 7, 10, 0), TIME, -1)).toEqual([]);
  });

  it('첫 알림은 **오늘이 아니라 내일**이다 — 오늘 앱을 썼으므로', () => {
    // 오늘 10:00 에 앱을 열었다. 오늘 20:00 은 아직 오지 않았지만 걸지 않는다.
    const slots = computeSlots(new Date(2026, 8, 7, 10, 0), TIME, 3);
    expect(slots[0].getDate()).toBe(8);
    expect(slots[0].getHours()).toBe(20);
    expect(slots[0].getMinutes()).toBe(0);
  });

  it('하루 간격으로 이어진다', () => {
    const slots = computeSlots(new Date(2026, 8, 7, 10, 0), TIME, 3);
    expect(slots.map((d) => d.getDate())).toEqual([8, 9, 10]);
    for (const slot of slots) {
      expect(slot.getHours()).toBe(20);
      expect(slot.getSeconds()).toBe(0);
      expect(slot.getMilliseconds()).toBe(0);
    }
  });

  it('전부 현재보다 미래다 — 자정 직전에 불려도', () => {
    const now = new Date(2026, 8, 7, 23, 59, 59);
    const slots = computeSlots(now, TIME, 7);
    for (const slot of slots) {
      expect(slot.getTime()).toBeGreaterThan(now.getTime());
    }
  });

  it('알림 시각이 이미 지난 뒤에 열어도 내일로 간다', () => {
    // 21:00 에 열었고 알림은 20:00 — 오늘 20:00 은 지났다. 내일 20:00 이어야 한다.
    const slots = computeSlots(new Date(2026, 8, 7, 21, 0), TIME, 1);
    expect(slots[0].getDate()).toBe(8);
    expect(slots[0].getHours()).toBe(20);
  });

  it('월말을 넘는다', () => {
    // 1월 31일 → 2월 1일. setDate 가 월을 알아서 넘기는지 확인한다.
    const slots = computeSlots(new Date(2026, 0, 31, 10, 0), TIME, 2);
    expect(slots[0].getMonth()).toBe(1);
    expect(slots[0].getDate()).toBe(1);
    expect(slots[1].getDate()).toBe(2);
  });

  it('연말을 넘는다', () => {
    const slots = computeSlots(new Date(2026, 11, 31, 10, 0), TIME, 1);
    expect(slots[0].getFullYear()).toBe(2027);
    expect(slots[0].getMonth()).toBe(0);
    expect(slots[0].getDate()).toBe(1);
  });

  it('윤년 2월을 넘는다', () => {
    // 2028 은 윤년 — 2월 28일 다음이 29일이어야 한다
    const slots = computeSlots(new Date(2028, 1, 28, 10, 0), TIME, 2);
    expect(slots[0].getDate()).toBe(29);
    expect(slots[1].getMonth()).toBe(2);
    expect(slots[1].getDate()).toBe(1);
  });

  it('자정 알림도 날짜가 밀리지 않는다', () => {
    // 시/분을 덮어쓰기 전에 날짜를 옮기지 않으면 00:00 에서 하루가 어긋난다
    const slots = computeSlots(new Date(2026, 8, 7, 23, 30), { hour: 0, minute: 0 }, 2);
    expect(slots.map((d) => d.getDate())).toEqual([8, 9]);
    expect(slots[0].getHours()).toBe(0);
  });
});
