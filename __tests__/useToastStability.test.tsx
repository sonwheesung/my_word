/**
 * `useToast` 가 돌려주는 함수가 **렌더를 건너 같은 함수인가.**
 *
 * 🔴 이 테스트가 지키는 것은 토스트가 아니라 **화면의 effect 다**(2026-10-15).
 *
 * `showToast` 는 여러 화면의 `useEffect` 의존성 배열에 들어간다. 매 렌더 새로 만들어지면
 * 그 effect 가 **매 렌더 다시 돈다.** 사장님 폰(SM-S921N)에서 실제로 그렇게 났다:
 *
 * ```
 * AI 시험 설정 · 플래시카드 설정   CPU 120~158%   (가만히 두고 잰 값)
 * 퀴즈 설정 · 홈 · 통계            CPU  10~16%
 * ```
 *
 * 그리고 그 effect 끝이 `setSelectedCategoryId(첫 번째)` 였기 때문에 **고른 카테고리가
 * 곧바로 되돌려졌다** — 두 번째 카테고리로는 시험을 볼 수 없었다.
 *
 * ⚠ **타입 체크로도, 화면을 보는 것으로도 안 잡힌다.** 크래시도 경고도 없고 화면은 멀쩡하다.
 *   되돌아가기도 쉬운 자리다(`useCallback` 을 "불필요한 최적화"로 보고 지우면 그대로 재발한다).
 *   그래서 **동작으로** 못 박는다.
 */
import React, { useState } from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { Text } from 'react-native';
import { useToast } from '../src/hooks/useToast';

describe('useToast 의 함수 정체성', () => {
  it('렌더가 여러 번 돌아도 showToast · hideToast 는 같은 함수다', () => {
    const shows: unknown[] = [];
    const hides: unknown[] = [];
    let rerender: (n: number) => void = () => {};

    function Probe() {
      const { showToast, hideToast } = useToast();
      const [, setTick] = useState(0);
      rerender = (n) => setTick(n);
      shows.push(showToast);
      hides.push(hideToast);
      return <Text>probe</Text>;
    }

    let tree!: ReactTestRenderer.ReactTestRenderer;
    ReactTestRenderer.act(() => {
      tree = ReactTestRenderer.create(<Probe />);
    });
    ReactTestRenderer.act(() => rerender(1));
    ReactTestRenderer.act(() => rerender(2));
    // ⚠ 반드시 내린다 — 띄워 둔 채 끝내면 jest 워커가 곱게 안 죽는다
    ReactTestRenderer.act(() => tree.unmount());

    // 렌더가 실제로 여러 번 돌았는지부터 본다 — 안 돌았으면 이 테스트는 아무것도 안 지킨다
    expect(shows.length).toBeGreaterThanOrEqual(3);
    expect(new Set(shows).size).toBe(1);
    expect(new Set(hides).size).toBe(1);
  });

  it('정체성을 고정해도 토스트는 여전히 뜨고 내린다', () => {
    let api: ReturnType<typeof useToast> | null = null;

    function Probe() {
      api = useToast();
      return <Text>probe</Text>;
    }

    let tree!: ReactTestRenderer.ReactTestRenderer;
    ReactTestRenderer.act(() => {
      tree = ReactTestRenderer.create(<Probe />);
    });
    expect(api!.toast.visible).toBe(false);

    ReactTestRenderer.act(() => api!.showToast('저장했습니다', 'success'));
    expect(api!.toast).toMatchObject({ visible: true, message: '저장했습니다', type: 'success' });

    ReactTestRenderer.act(() => api!.hideToast());
    expect(api!.toast.visible).toBe(false);
    // 내려도 문구는 남는다 — 사라지는 애니메이션 동안 글자가 비면 안 된다
    expect(api!.toast.message).toBe('저장했습니다');

    ReactTestRenderer.act(() => tree.unmount());
  });
});
