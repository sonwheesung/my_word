import { Platform } from 'react-native';

// 현재 앱 버전 (app.json과 동기화)
export const APP_VERSION = '0.0.1';

// 최신 버전 (배포 시 이 값을 업데이트)
// 이 값보다 APP_VERSION이 낮으면 업데이트 안내 표시
export const LATEST_VERSION = '0.0.1';

// Google Play Store 링크
export const STORE_URL = Platform.select({
  android: 'https://play.google.com/store/apps/details?id=com.myword.front',
  default: '',
});

// AsyncStorage 키
export const VERSION_SKIP_KEY = '@my_word_skipped_version';
