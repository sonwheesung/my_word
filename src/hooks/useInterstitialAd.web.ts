import { useCallback } from 'react';

export function useInterstitialAd() {
  const showAd = useCallback(() => {
    // 웹에서는 광고 미표시
  }, []);

  return { showAd };
}
