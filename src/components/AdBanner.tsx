import React from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { BannerAd, BannerAdSize, TestIds } from 'react-native-google-mobile-ads';
import { ADMOB_BANNER_ID } from '../constants/adConfig';

const adUnitId = __DEV__ ? TestIds.ADAPTIVE_BANNER : ADMOB_BANNER_ID;

export default function AdBanner() {
  // 웹에서는 광고 미표시
  if (Platform.OS === 'web') {
    return null;
  }

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
