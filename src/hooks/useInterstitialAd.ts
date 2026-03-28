import { useEffect, useCallback, useRef } from 'react';
import { Platform } from 'react-native';

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

  useEffect(() => {
    if (Platform.OS === 'web' || !adsAvailable || !InterstitialAd) return;

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
    };
  }, []);

  const showAd = useCallback(() => {
    if (Platform.OS === 'web' || !adsAvailable) return;
    if (adRef.current && loadedRef.current) {
      adRef.current.show();
    }
  }, []);

  return { showAd };
}
