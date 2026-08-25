import React from 'react';
import { View, StyleSheet, Platform } from 'react-native';

import { usePurchase } from '../contexts/PurchaseContext';
import { useTheme } from '../contexts/ThemeContext';
import { AD_BANNER_HEIGHT } from '../constants/design';

let BannerAd: any = null;
let BannerAdSize: any = null;
let TestIds: any = null;
let adsAvailable = false;

try {
  const ads = require('react-native-google-mobile-ads');
  BannerAd = ads.BannerAd;
  BannerAdSize = ads.BannerAdSize;
  TestIds = ads.TestIds;
  adsAvailable = true;
} catch {
  // 네이티브 모듈 없음 (Expo Go 또는 웹)
}

const { ADMOB_BANNER_ID } = require('../constants/adConfig');

/**
 * 배너가 실제로 그려지는 높이. 안 그려지면 0.
 * 토스트처럼 화면 하단에 절대 배치되는 요소가 광고를 덮지 않도록 비켜설 때 쓴다.
 * (광고를 콘텐츠로 가리는 것은 AdMob 정책 위반이다)
 */
export function useAdBannerHeight(): number {
  const { adFree } = usePurchase();
  if (adFree || Platform.OS === 'web' || !adsAvailable || !BannerAd) {
    return 0;
  }
  return AD_BANNER_HEIGHT;
}

export default function AdBanner() {
  // 평생 광고 제거를 산 사람에게는 아무것도 그리지 않는다
  const { adFree } = usePurchase();
  const { colors } = useTheme();

  if (adFree || Platform.OS === 'web' || !adsAvailable || !BannerAd) {
    return null;
  }

  const adUnitId = __DEV__ ? TestIds.ADAPTIVE_BANNER : ADMOB_BANNER_ID;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <BannerAd
        unitId={adUnitId}
        size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  /*
   * ⚠ 배경색을 여기 박지 않는다. 원래 `#F8F9FA` 가 하드코딩돼 있었는데 그건 인디고 테마의
   *   배경색이라, 나머지 5개 테마에서는 어긋나고 다크(`#121212`)에서는 화면 아래에
   *   밝은 회색 띠가 생겼다. 배너는 화면 하단에 고정되므로 항상 보인다.
   */
  container: {
    alignItems: 'center',
  },
});
