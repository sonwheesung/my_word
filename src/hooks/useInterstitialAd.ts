import { useEffect, useCallback, useRef } from 'react';
import { Platform } from 'react-native';
import { InterstitialAd, AdEventType, TestIds } from 'react-native-google-mobile-ads';
import { ADMOB_INTERSTITIAL_ID } from '../constants/adConfig';

const adUnitId = __DEV__ ? TestIds.INTERSTITIAL : ADMOB_INTERSTITIAL_ID;

export function useInterstitialAd() {
  const adRef = useRef<InterstitialAd | null>(null);
  const loadedRef = useRef(false);

  useEffect(() => {
    if (Platform.OS === 'web') return;

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
    if (Platform.OS === 'web') return;
    if (adRef.current && loadedRef.current) {
      adRef.current.show();
    }
  }, []);

  return { showAd };
}
