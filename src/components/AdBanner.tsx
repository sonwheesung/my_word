import React from 'react';
import { View, StyleSheet, Platform } from 'react-native';

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

export default function AdBanner() {
  if (Platform.OS === 'web' || !adsAvailable || !BannerAd) {
    return null;
  }

  const adUnitId = __DEV__ ? TestIds.ADAPTIVE_BANNER : ADMOB_BANNER_ID;

  return (
    <View style={styles.container}>
      <BannerAd
        unitId={adUnitId}
        size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    backgroundColor: '#F8F9FA',
  },
});
