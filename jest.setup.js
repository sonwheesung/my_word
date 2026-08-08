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
