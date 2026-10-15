import { useCallback, useState } from 'react';
import type { ToastType } from '../components/Toast';

interface ToastState {
  visible: boolean;
  message: string;
  type: ToastType;
}

/**
 * 토스트 한 개를 띄우고 내린다.
 *
 * 🔴 **`showToast` · `hideToast` 는 반드시 렌더를 건너 같은 함수여야 한다**(2026-10-15).
 *
 * 이 둘은 화면들의 `useEffect`·`useCallback` 의존성에 들어간다. 매 렌더 새로 만들면
 * **그 effect 가 매 렌더 다시 돈다.** 2026-10-15 사장님 폰에서 실제로 그렇게 났다:
 * AI 시험 설정과 플래시카드 설정이 가만히 있는데도 CPU 를 **120~158%** 먹고 있었고
 * (정상 화면은 10~16%), 목록을 다시 불러오는 effect 가 끝없이 돌면서
 * **고른 카테고리를 첫 번째로 되돌려** 두 번째 카테고리로는 시험을 볼 수 없었다.
 *
 * ⚠ 증상이 「누르면 시트가 닫히는데 안 바뀐다」였던 탓에 **시트(BottomSheet)를 두 번 의심했다.**
 *   시트는 결백했다 — 같은 시트를 쓰는 퀴즈 설정은 멀쩡했다. 범인은 이 파일이었다.
 *   화면 쪽 의존성 배열을 손대는 것으로는 다음 화면에서 또 난다. **주인을 여기로 둔다.**
 */
export const useToast = () => {
  const [toast, setToast] = useState<ToastState>({
    visible: false,
    message: '',
    type: 'info',
  });

  // setToast 는 React 가 보장하는 고정값이라 의존성이 비어도 낡지 않는다
  const showToast = useCallback((message: string, type: ToastType = 'info') => {
    setToast({ visible: true, message, type });
  }, []);

  const hideToast = useCallback(() => {
    setToast((prev) => ({ ...prev, visible: false }));
  }, []);

  return {
    toast,
    showToast,
    hideToast,
  };
};
