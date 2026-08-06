import { Platform } from 'react-native';
import { APP_CODE, APP_VERSION, SERVER_URL } from '../../constants/appConfig';
import { createCommonServer } from './index';

/**
 * 공통 서버 클라이언트 — 앱 전역에서 이 인스턴스 하나만 쓴다.
 *
 * SDK 자체는 react-native 에 의존하지 않으므로(웹·Node 어디서나 동작), 플랫폼 값 주입은
 * 이 파일이 담당한다. 여기가 SDK와 앱을 잇는 유일한 접점이다.
 *
 * SERVER_URL 이 비어 있으면 모든 호출이 'not-configured' 로 떨어지고 네트워크를 타지 않는다.
 */
export const commonServer = createCommonServer({
  baseUrl: SERVER_URL,
  appCode: APP_CODE,
  appVersion: APP_VERSION,
  platform: Platform.OS,
});
