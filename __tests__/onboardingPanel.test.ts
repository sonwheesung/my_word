/**
 * 🔴 **첫 사용자 안내가 누구에게서 무엇을 숨기는가.**
 *
 * 시안(#2)은 *"단어가 0개면 버튼 7개 대신"* 이라고만 적었다. 그걸 "퀴즈를 풀 때까지"로
 * 늘려 읽으면 **단어 50개를 넣어 두고 아직 안 푼 사람이 단어장·통계에 못 들어간다** —
 * 크래시도 경고도 없이 길만 막힌다. 그래서 두 판정을 따로 두고 여기서 고정한다.
 */

import { shouldHideMenu, shouldShowOnboarding } from '../src/components/OnboardingPanel';

describe('shouldShowOnboarding — 아직 한 판도 안 풀었으면 보여준다', () => {
  it('아무것도 없으면 보여준다', () => {
    expect(shouldShowOnboarding(0, 0)).toBe(true);
  });

  it('🔴 단어는 있는데 아직 안 풀었으면 보여준다 (①에 ✓ 가 찍힌 상태가 여기 산다)', () => {
    expect(shouldShowOnboarding(1, 0)).toBe(true);
    expect(shouldShowOnboarding(50, 0)).toBe(true);
  });

  it('한 판이라도 풀었으면 사라진다', () => {
    expect(shouldShowOnboarding(0, 1)).toBe(false);
    expect(shouldShowOnboarding(50, 3)).toBe(false);
  });

  it('⚠ 단어를 다 지워도 푼 적이 있으면 다시 안 뜬다 — 처음 쓰는 사람이 아니다', () => {
    expect(shouldShowOnboarding(0, 7)).toBe(false);
  });
});

describe('🔴 shouldHideMenu — 담을 것이 없는 사람에게만 길을 좁힌다', () => {
  it('아무것도 없으면 숨긴다', () => {
    expect(shouldHideMenu(0, 0)).toBe(true);
  });

  it('🔴 단어가 하나라도 있으면 절대 숨기지 않는다', () => {
    expect(shouldHideMenu(1, 0)).toBe(false);
    expect(shouldHideMenu(50, 0)).toBe(false);
  });

  it('퀴즈를 푼 적이 있으면 숨기지 않는다 (단어를 다 지웠더라도)', () => {
    expect(shouldHideMenu(0, 1)).toBe(false);
  });

  it('🔴 숨기는 조건이 보여주는 조건보다 좁다 — 넓어지면 메뉴를 빼앗는다', () => {
    const cases: Array<[number, number]> = [
      [0, 0], [1, 0], [50, 0], [0, 1], [3, 2], [0, 9],
    ];
    for (const [w, q] of cases) {
      if (shouldHideMenu(w, q)) expect(shouldShowOnboarding(w, q)).toBe(true);
    }
  });
});
