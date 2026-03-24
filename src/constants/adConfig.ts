import { Platform } from 'react-native';

// AdMob 앱 ID
export const ADMOB_APP_ID = 'ca-app-pub-2731473780180274~9707608518';

// 배너 광고 단위 ID (하단 배너)
export const ADMOB_BANNER_ID = Platform.select({
  android: 'ca-app-pub-2731473780180274/7376958646',
  ios: '', // iOS 광고 단위 ID (추후 추가)
}) as string;

// 전면 광고 단위 ID (퀴즈 완료 후)
export const ADMOB_INTERSTITIAL_ID = Platform.select({
  android: 'ca-app-pub-2731473780180274/9157077629',
  ios: '', // iOS 광고 단위 ID (추후 추가)
}) as string;

// 테스트 광고 ID (개발 시 사용)
export const TEST_BANNER_ID = 'ca-app-pub-3940256099942544/6300978111';
export const TEST_INTERSTITIAL_ID = 'ca-app-pub-3940256099942544/1033173712';
