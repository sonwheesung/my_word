import Constants from 'expo-constants';
import { Platform } from 'react-native';

// 현재 앱 버전 — app.json 의 값을 그대로 읽는다.
// ⚠ 손으로 적어 두면 반드시 어긋난다. 실제로 app.json 이 1.3.2 인데 여기가 1.3.1 로 남아
//   설정 화면에 틀린 버전이 보이고 강제 업데이트 판정도 한 버전 뒤처져 있었다(2026-09-01 정정).
//   이 값은 공통 서버에도 그대로 전송된다.
export const APP_VERSION = Constants.expoConfig?.version ?? '0.0.0';

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
// 사용자가 고른 색상 테마.
// ⚠ 원래 ThemeContext 안에 혼자 있었다 — 백업이 이 키를 읽어야 해서 다른 키들과 같은 자리로 옮겼다.
//   값은 그대로다(`@my_word_theme`). 운영 중인 앱이라 키 문자열은 바꾸지 않는다.
export const THEME_KEY = '@my_word_theme';

// 사용자가 고른 앱 언어. 없으면 기기 언어를 따른다
export const LANGUAGE_KEY = '@my_word_language';
// 광고 제거를 구매했는가.
// ⚠ 이 값은 캐시일 뿐 진실이 아니다 — 진실은 Google Play 의 구매 이력이다.
//   부팅 직후 Play 조회가 끝나기 전까지 광고가 번쩍이는 것을 막으려고 둔다.
export const AD_FREE_KEY = '@my_word_ad_free';

// --- 학습 리마인더 알림 ---
// 하루 동안 앱을 안 쓰면 정해진 시각에 알려 준다. **전부 기기 안에서 예약되는 로컬 알림**이고
// 서버·FCM·푸시토큰을 쓰지 않는다(앱의 "백엔드 없음" 구조를 그대로 둔다).
export const NOTIFY_ENABLED_KEY = '@my_word_notify_enabled';
/** "HH:mm" 24시간 표기. 숫자 두 개로 나눠 두면 한쪽만 저장되는 상태가 생긴다 */
export const NOTIFY_TIME_KEY = '@my_word_notify_time';
/** 퀴즈를 처음 끝냈을 때의 권유를 이미 띄웠나. 거절한 사람에게 두 번 묻지 않기 위해 */
export const NOTIFY_PROMPTED_KEY = '@my_word_notify_prompted';

// 기본 20:00.
// 🔴 21:00 이 아닌 이유: 정보통신망법 §50③ 이 **21:00~08:00** 에 전자적 전송매체로 영리목적
//    광고성 정보를 보내려면 별도 동의를 받으라고 한다. 우리 알림은 서버가 보내는 것이 아니라
//    기기 안에서 만들어지고, 사용자가 스스로 켠 학습 리마인더라 적용 대상으로 보기 어렵다.
//    그래도 **기본값을 하필 그 시간대 시작점에 두면** 공짜로 논쟁을 산다. 20:00 이면 사라진다.
//    (사용자가 직접 야간 시각을 고르는 것은 막지 않는다 — 자기 기기의 자기 알람이다)
export const NOTIFY_DEFAULT_TIME = '20:00';

/** 한 번에 며칠치를 미리 걸어 두나. 이만큼 연속으로 안 열면 알림이 멈춘다(떠난 사용자에게 계속 보내지 않는다) */
export const NOTIFY_DAYS_AHEAD = 7;

/** 안드로이드 알림 채널 id. 한 번 만들면 이름·중요도를 코드로 바꿔도 OS 가 무시하므로 신중히 정한다 */
export const NOTIFY_CHANNEL_ID = 'study-reminder';

// --- 간격 반복(SRS) ---
// 단어별 다음 복습일. 🔴 **파생값이라 백업에 담지 않는다** — words + quizResults 로 언제든
//    다시 만들어진다(이 앱이 통계를 저장하지 않고 매번 파생하는 것과 같은 이유).
//    저장하는 이유는 오직 속도이고, 이력과 어긋나면 말없이 재생된다.
export const SRS_KEY = '@my_word_srs';

// --- SecureStore 키 (AsyncStorage 아님) ---
// 문의를 이 기기에 귀속시키는 무작위 UUID. 최초 실행 때 한 번 만들고 그 뒤로 바뀌지 않는다.
// ⚠ 이 값을 아는 사람이 이 기기의 문의를 읽을 수 있다 — 자격증명이라 위 키들과 달리
//   SecureStore 에 보관한다. AsyncStorage 로 옮기지 말 것.
// ⚠ SecureStore 키에는 '@' 를 쓸 수 없어 접두사 형식이 위와 다르다.
export const DEVICE_ID_KEY = 'myword_device_id';

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
