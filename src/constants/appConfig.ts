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

// --- 문의하기 ---
// 문의 접수 서버(Vercel). EXPO_PUBLIC_* 는 빌드 시점에 번들로 인라인되므로
// 값을 바꾸면 반드시 재빌드해야 반영된다. 비어 있으면 문의 기능은 비활성 안내로 동작한다.
export const SUPPORT_API_URL = (process.env.EXPO_PUBLIC_SERVER_URL ?? '').replace(/\/$/, '');

// 서버가 여러 앱의 문의를 한 곳에서 받으므로, 어느 앱인지 알리는 코드.
// 서버의 ANON_TICKET_PROJECTS allowlist 에 이 값이 있어야 접수된다.
export const SUPPORT_PROJ = 'myword';

// 문의 본문 상한 (서버는 2000자에서 자르므로 그보다 크게 두지 않는다)
export const SUPPORT_CONTENT_MAX = 2000;
// 서버가 요구하는 최소 길이
export const SUPPORT_CONTENT_MIN = 5;
