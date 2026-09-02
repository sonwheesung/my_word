// 날짜 집계 테스트가 실행 환경의 시간대에 좌우되지 않도록 KST 로 고정한다.
// (UTC 환경에서만 통과하는 로컬 날짜 버그를 잡기 위해 필수)
process.env.TZ = 'Asia/Seoul';

// 문의 서버 URL — 모듈이 로드 시점에 읽으므로 테스트 파일 안에서 넣으면 import 호이스팅에 밀린다.
// 여기(setupFiles)는 테스트 모듈 로드보다 먼저 실행되므로 여기서 고정한다. 실제 요청은 fetch 목이 가로챈다.
process.env.EXPO_PUBLIC_SERVER_URL = 'https://support.test';

// expo-localization 은 네이티브 모듈이라 테스트 환경에서 로드하면 expo-modules-core 가 깨진다.
// 서비스 계층이 i18n → language 를 거쳐 이걸 끌고 오므로 전역으로 목을 둔다.
// (언어 결정 자체를 검증하는 테스트는 파일 안에서 다시 목을 잡아 이 설정을 덮어쓴다)
jest.mock('expo-localization', () => ({
  getLocales: () => [{ languageTag: 'ko-KR', languageCode: 'ko' }],
}));

// AsyncStorage 네이티브 모듈은 테스트 환경에 없으므로 공식 목으로 대체한다.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// 🔴 위 expo-localization 과 **같은 이유**로 목이 필요하다 — 둘 다 expo-modules-core 를 끌어와
// 테스트 환경에서 `EventEmitter` 가 undefined 가 되며 **스위트가 로드 단계에서 통째로 죽는다.**
// (2026-09-01 에 기기 식별자를 붙이면서 이 둘을 추가했는데 목을 안 넣어 9개 중 7개가 죽어 있었다.
//  테스트가 "실패"가 아니라 "로드 실패"라 통과 개수만 보면 조용히 줄어든다 — 26/26 통과처럼 보였다.)
jest.mock('expo-crypto', () => ({
  randomUUID: () => '00000000-0000-4000-8000-000000000000',
}));

// SecureStore 는 메모리 저장소로 대체한다. 실제 암호화는 검증 대상이 아니고,
// 세션 복원/재등록 분기가 키-값 왕복만 보면 되기 때문이다.
jest.mock('expo-secure-store', () => {
  const store = new Map();
  return {
    getItemAsync: async (k) => (store.has(k) ? store.get(k) : null),
    setItemAsync: async (k, v) => void store.set(k, v),
    deleteItemAsync: async (k) => void store.delete(k),
  };
});

// expo-constants 도 같은 계열이다. appConfig 가 APP_VERSION 을 여기서 읽는다(하드코딩을 걷어낸 뒤).
//
// 🔴 **가짜 버전을 지어내지 않고 app.json 을 그대로 읽는다.** 버전 게이트 테스트가
//    `APP_VERSION` 을 기준으로 "이보다 낮은 버전"(0.9.0)을 조립하므로, 목이 임의의 값을 주면
//    그 전제가 깨져 테스트가 앱이 아니라 목을 검증하게 된다.
//    (실제로 '0.0.0-test' 를 넣었더니 0.9.0 보다 낮아져 soft-update 가 떴다 — 앱은 멀쩡한데.)
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { version: require('./app.json').expo.version } },
}));

// expo-linear-gradient 도 같은 계열이다(expo-modules-core → EventEmitter undefined).
// 이것 때문에 App.test.tsx 가 **1.3.0 부터 두 릴리스 내내** 로드조차 안 됐고,
// CHANGELOG 에 "이전부터 있던 것"으로 두 번 적히며 사실상 포기돼 있었다.
// 원인이 위 셋과 같은 종류였을 뿐이라 같은 방법으로 닫는다 — 그라데이션은 표시일 뿐
// 검증 대상이 아니므로 자식을 그대로 통과시키는 View 로 대체한다.
jest.mock('expo-linear-gradient', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    LinearGradient: ({ children, ...props }) => React.createElement(View, props, children),
  };
});

// @expo/vector-icons 는 expo-font 를 거쳐 또 expo-modules-core 로 간다(같은 사슬의 마지막 고리).
// 아이콘 세트가 수십 개라 하나씩 적지 않고 Proxy 로 **어떤 이름을 요구하든** 빈 View 를 준다.
// 테스트가 검증하는 것은 화면 구조이지 아이콘 글리프가 아니다.
jest.mock('@expo/vector-icons', () => {
  const React = require('react');
  const { View } = require('react-native');
  const Icon = (props) => React.createElement(View, props);
  return new Proxy({ __esModule: true }, { get: (t, k) => (k in t ? t[k] : Icon) });
});

// ─────────────────────────────────────────────────────────────────────────────
// ⏸ 여기까지가 목으로 닫은 범위다 — `App.test.tsx` 하나는 **아직 로드가 안 된다.**
//
// 근본 원인은 개별 모듈이 아니라 **preset 이다.** 이 프로젝트는 `preset: 'react-native'` 를 쓰는데,
// 그건 Expo 네이티브 모듈을 하나도 모른다. 그래서 화면이 새 expo-* 를 import 할 때마다
// `expo-modules-core` 의 EventEmitter 가 undefined 가 되며 스위트가 통째로 죽는다.
// App.test.tsx 는 App → 전 화면을 끌어오므로 **모든 네이티브 모듈을 다 만난다** —
// 남은 사슬만 해도 expo-clipboard · expo-iap 이고, 화면이 하나 늘 때마다 또 늘어난다.
//
// 두 갈래인데 **둘 다 판단이 필요하다**(임의로 고르지 않았다):
//   ① `jest-expo` preset 도입 — 공식 해법이고 이 목들이 대부분 필요 없어진다.
//      대가: devDependency 추가 + preset 교체 → 지금 통과하는 141개에 회귀 위험.
//   ② 이 파일에 계속 목을 더한다 — 위험은 없지만 화면이 늘 때마다 또 막아야 한다(두더지잡기).
//
// 🔴 그동안 착각하지 말 것: App.test.tsx 는 **실패가 아니라 로드조차 안 된 것**이다.
//    "Tests: N passed" 는 그 스위트를 아예 안 센다 — 2026-09-01 에 7개 스위트가 죽었을 때
//    통과 수가 140 → 26 으로 줄었는데도 "26/26 통과"로 보여서 아무도 못 봤다.
//    **스위트 실패 개수를 함께 본다.**
// ─────────────────────────────────────────────────────────────────────────────
