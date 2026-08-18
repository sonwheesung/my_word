import { Platform } from 'react-native';

// 현재 앱 버전 (app.json과 동기화)
export const APP_VERSION = '1.3.1';

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
// 광고 제거를 구매했는가.
// ⚠ 이 값은 캐시일 뿐 진실이 아니다 — 진실은 Google Play 의 구매 이력이다.
//   부팅 직후 Play 조회가 끝나기 전까지 광고가 번쩍이는 것을 막으려고 둔다.
export const AD_FREE_KEY = '@my_word_ad_free';

// --- 인앱 상품 ---
// Play Console 의 관리형 상품(비소비성) ID 와 반드시 같아야 한다.
// 한 번 사면 영구다. 구독이 아니므로 갱신·만료가 없다.
export const REMOVE_ADS_PRODUCT_ID = 'remove_ads';

// --- 공통 서버 ---
// 공지사항 · 문의하기 · 버전 게이트를 담당하는 서버(Vercel).
// EXPO_PUBLIC_* 는 빌드 시점에 번들로 인라인되므로 값을 바꾸면 반드시 재빌드해야 반영된다.
// 비어 있으면 서버 연동 기능 전체가 조용히 비활성으로 동작한다(앱 사용에는 지장 없음).
export const SERVER_URL = (process.env.EXPO_PUBLIC_SERVER_URL ?? '').replace(/\/$/, '');

// 서버가 여러 앱을 한 곳에서 받으므로, 어느 앱인지 알리는 코드.
// 서버 `apps` 테이블에 이 코드가 등록·활성 상태여야 한다(아니면 404).
export const APP_CODE = 'myword';

// --- 법적 고지 문서 ---
// GitHub Pages(`docs/`)로 게시된다. 푸시하면 즉시 반영된다.
// ⚠ 처리방침 URL 은 Play Console 에도 등록돼 있다. 주소를 바꾸면 콘솔도 함께 바꿔야 한다.
const LEGAL_BASE_URL = 'https://sonwheesung.github.io/my_word';
export const PRIVACY_POLICY_URL = `${LEGAL_BASE_URL}/privacy-policy.html`;
export const TERMS_OF_SERVICE_URL = `${LEGAL_BASE_URL}/terms-of-service.html`;
export const OPEN_SOURCE_LICENSES_URL = `${LEGAL_BASE_URL}/open-source-licenses.html`;

// 문의 본문 상한 (서버는 2000자에서 자르므로 그보다 크게 두지 않는다)
export const SUPPORT_CONTENT_MAX = 2000;
// 서버가 요구하는 최소 길이
export const SUPPORT_CONTENT_MIN = 5;
