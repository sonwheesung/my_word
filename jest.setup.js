// 날짜 집계 테스트가 실행 환경의 시간대에 좌우되지 않도록 KST 로 고정한다.
// (UTC 환경에서만 통과하는 로컬 날짜 버그를 잡기 위해 필수)
process.env.TZ = 'Asia/Seoul';

// 문의 서버 URL — 모듈이 로드 시점에 읽으므로 테스트 파일 안에서 넣으면 import 호이스팅에 밀린다.
// 여기(setupFiles)는 테스트 모듈 로드보다 먼저 실행되므로 여기서 고정한다. 실제 요청은 fetch 목이 가로챈다.
process.env.EXPO_PUBLIC_SERVER_URL = 'https://support.test';

// AsyncStorage 네이티브 모듈은 테스트 환경에 없으므로 공식 목으로 대체한다.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
