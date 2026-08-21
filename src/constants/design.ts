/**
 * 디자인 토큰.
 *
 * 화면마다 흩어져 있던 치수를 한곳에 모은다. 값을 바꾸려면 여기만 고친다.
 * 4pt 그리드를 쓴다 — 안드로이드·iOS 양쪽의 기본 리듬이다.
 */

/** 여백. 4의 배수만 쓴다 */
export const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
} as const;

/**
 * 모서리.
 *
 * ⚠ 입력 필드에 `lg` 이상을 쓰지 않는다. 높이 40 짜리에 16 을 주면
 *   알약처럼 보여서 "여기 입력하세요" 신호가 죽는다.
 */
export const RADIUS = {
  sm: 6,
  md: 8,   // 입력 필드·버튼 기본값
  lg: 12,
  xl: 16,  // 카드
  sheet: 20,
  pill: 999,
} as const;

/**
 * 글자 크기.
 *
 * ⚠ 기존 화면의 fontSize 는 아직 숫자로 박혀 있다(14·15·16 이 뒤섞여 있다).
 *   같은 숫자를 토큰 이름으로 바꾸기만 하면 간접 참조만 늘고 얻는 게 없고,
 *   14 와 15 를 하나로 합치면 전 화면 글자 크기가 눈에 띄게 바뀐다.
 *   그래서 새로 쓰는 곳만 이 토큰을 쓰고, 스케일 통합은 별도 판단으로 남겨 둔다.
 */
export const FONT = {
  micro: 11,
  caption: 12,
  label: 13,
  body: 15,
  title: 18,
  display: 22,
} as const;

/**
 * 입력 필드 세로 패딩.
 *
 * body(15) 한 줄 높이 ≈ 20 이므로 10 * 2 + 20 = 40dp 가 된다.
 * 손가락 최소 타깃 44dp 보다 작지만 가로가 화면 폭 전체라 실제 터치 면적은 충분하다.
 * 대신 아이콘 버튼처럼 작은 타깃에는 반드시 HIT_SLOP 을 준다.
 */
export const INPUT_PADDING_V = 10;
export const INPUT_PADDING_H = 12;

/** 작은 아이콘 버튼의 터치 영역 보정 */
export const HIT_SLOP = { top: 8, bottom: 8, left: 8, right: 8 } as const;

/** 입력 개수 상한. 넘으면 추가 버튼을 감춘다(눌러보고 나서 막힌 걸 알면 답답하다) */
export const LIMITS = {
  meanings: 10,
  examples: 5,
  tags: 10,
} as const;

/** 글자수 표시를 켜는 기준. 이보다 짧은 필드는 굳이 세지 않는다 */
export const COUNTER_THRESHOLD = 100;

/**
 * 검색 입력 debounce.
 *
 * 한 글자마다 전체 배열을 다시 거르면 목록이 커질수록 입력이 밀린다.
 * 400ms 는 타이핑이 끊긴 것을 사람이 느끼기 시작하는 지점보다 짧다.
 */
export const SEARCH_DEBOUNCE_MS = 400;
