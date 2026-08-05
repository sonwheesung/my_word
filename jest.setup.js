// 날짜 집계 테스트가 실행 환경의 시간대에 좌우되지 않도록 KST 로 고정한다.
// (UTC 환경에서만 통과하는 로컬 날짜 버그를 잡기 위해 필수)
process.env.TZ = 'Asia/Seoul';

// AsyncStorage 네이티브 모듈은 테스트 환경에 없으므로 공식 목으로 대체한다.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
