import { useEffect, useCallback, useRef } from 'react';
import { Platform } from 'react-native';

import { usePurchase } from '../contexts/PurchaseContext';

let InterstitialAd: any = null;
let AdEventType: any = null;
let TestIds: any = null;
let adsAvailable = false;

try {
  const ads = require('react-native-google-mobile-ads');
  InterstitialAd = ads.InterstitialAd;
  AdEventType = ads.AdEventType;
  TestIds = ads.TestIds;
  adsAvailable = true;
} catch {
  // 네이티브 모듈 없음 (Expo Go 또는 웹)
}

const { ADMOB_INTERSTITIAL_ID } = require('../constants/adConfig');

export function useInterstitialAd() {
  const adRef = useRef<any>(null);
  const loadedRef = useRef(false);
  const { adFree } = usePurchase();

  useEffect(() => {
    /*
     * ⚠ 광고 제거를 샀으면 **미리 불러오는 것부터 하지 않는다.**
     *   show 만 막으면 보이지 않을 뿐 트래픽은 그대로 나가고, 노출되지 않을 광고를
     *   계속 요청하는 것은 AdMob 정책상으로도 좋지 않다.
     */
    if (adFree || Platform.OS === 'web' || !adsAvailable || !InterstitialAd) return;

    const adUnitId = __DEV__ ? TestIds.INTERSTITIAL : ADMOB_INTERSTITIAL_ID;
    const interstitial = InterstitialAd.createForAdRequest(adUnitId);

    const unsubscribeLoaded = interstitial.addAdEventListener(
      AdEventType.LOADED,
      () => {
        loadedRef.current = true;
      },
    );

    const unsubscribeClosed = interstitial.addAdEventListener(
      AdEventType.CLOSED,
      () => {
        loadedRef.current = false;
        interstitial.load();
      },
    );

    adRef.current = interstitial;
    interstitial.load();

    return () => {
      unsubscribeLoaded();
      unsubscribeClosed();
      // 구매 직후 이 훅이 다시 돌면 이미 실린 광고가 남아 있다. 참조를 끊어 둔다
      adRef.current = null;
      loadedRef.current = false;
    };
  }, [adFree]);

  const showAd = useCallback(() => {
    if (adFree || Platform.OS === 'web' || !adsAvailable) return;
    if (adRef.current && loadedRef.current) {
      adRef.current.show();
    }
  }, [adFree]);

  return { showAd };
}
