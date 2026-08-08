import { Platform } from 'react-native';

// 현재 앱 버전 (app.json과 동기화)
export const APP_VERSION = '1.2.0';

// Google Play Store 링크
// 공통 서버가 version.androidUrl 을 내려주면 그 값을 우선하고, 없을 때 이 상수로 폴백한다.
export const STORE_URL = Platform.select({
  android: 'https://play.google.com/store/apps/details?id=com.myword.front',
  default: '',
});

// AsyncStorage 키
export const VERSION_SKIP_KEY = '@my_word_skipped_version';
// 읽은 공지 id 목록 (서버에 읽음을 보내지 않는다 — 익명 유지)
export const NOTICE_READ_KEY = '@my_word_read_notices';
// 사용자가 고른 앱 언어. 없으면 기기 언어를 따른다
export const LANGUAGE_KEY = '@my_word_language';

// --- 공통 서버 ---
// 공지사항 · 문의하기 · 버전 게이트를 담당하는 서버(Vercel).
// EXPO_PUBLIC_* 는 빌드 시점에 번들로 인라인되므로 값을 바꾸면 반드시 재빌드해야 반영된다.
// 비어 있으면 서버 연동 기능 전체가 조용히 비활성으로 동작한다(앱 사용에는 지장 없음).
export const SERVER_URL = (process.env.EXPO_PUBLIC_SERVER_URL ?? '').replace(/\/$/, '');

// 서버가 여러 앱을 한 곳에서 받으므로, 어느 앱인지 알리는 코드.
// 서버 `apps` 테이블에 이 코드가 등록·활성 상태여야 한다(아니면 404).
export const APP_CODE = 'myword';

// 문의 본문 상한 (서버는 2000자에서 자르므로 그보다 크게 두지 않는다)
export const SUPPORT_CONTENT_MAX = 2000;
// 서버가 요구하는 최소 길이
export const SUPPORT_CONTENT_MIN = 5;
