import { randomUUID } from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { APP_CODE, APP_VERSION, DEVICE_ID_KEY, SERVER_URL } from '../../constants/appConfig';
import { createCommonServer } from './index';

/**
 * 공통 서버 클라이언트 — 앱 전역에서 이 인스턴스 하나만 쓴다.
 *
 * SDK 자체는 react-native 에 의존하지 않으므로(웹·Node 어디서나 동작), 플랫폼 값 주입은
 * 이 파일이 담당한다. 여기가 SDK와 앱을 잇는 유일한 접점이다.
 *
 * SERVER_URL 이 비어 있으면 모든 호출이 'not-configured' 로 떨어지고 네트워크를 타지 않는다.
 *
 * ⚠ 세션 토큰과 deviceId 는 **그 값을 아는 사람이 그 사용자의 문의를 읽을 수 있는 열쇠**다.
 *   그래서 이 앱의 다른 키들(@my_word_* / AsyncStorage)과 달리 SecureStore 에 보관한다.
 *   AsyncStorage 로 옮기지 말 것.
 */

/**
 * 웹에는 SecureStore 가 없다(호출하면 그대로 실패한다).
 *
 * 이 앱의 웹 실행은 Puppeteer UI 검증 전용이고 배포 대상이 아니다. 여기서 localStorage 로
 * 폴백하면 "자격증명은 SecureStore" 규칙이 무너지므로, 웹에서는 **기기 세션을 아예 만들지
 * 않는다** — 문의는 지금까지처럼 익명으로 접수된다.
 * (SDK 는 storage 가 없으면 세션을 메모리에만 두므로 그대로 두어도 동작은 한다)
 */
const secureStoreAvailable = Platform.OS !== 'web';

export const commonServer = createCommonServer({
  baseUrl: SERVER_URL,
  appCode: APP_CODE,
  appVersion: APP_VERSION,
  platform: Platform.OS,
  // 세션을 영속화하지 않으면 앱을 켤 때마다 registerDevice 를 다시 부르게 되는데,
  // 서버의 기기 등록 레이트리밋이 IP당 10회/600초라 같은 공유기 아래 기기 몇 대만 있어도 막힌다.
  // 선택이 아니라 필수다.
  storage: secureStoreAvailable
    ? {
        getItem: (key) => SecureStore.getItemAsync(key),
        setItem: (key, value) => SecureStore.setItemAsync(key, value),
        removeItem: (key) => SecureStore.deleteItemAsync(key),
      }
    : undefined,
});

/**
 * 기기 세션 확보 — 부팅 시 1회.
 *
 * 이 앱에는 로그인이 없다. 대신 최초 실행 때 만든 무작위 UUID 하나로 서버가 같은 주체를
 * 알아보게 해서, 보낸 문의에 답변을 돌려받을 수 있게 한다. **로그인이 아니다** — 이메일도
 * 이름도 보내지 않고, 이 UUID 는 광고·추적에 쓰이지 않는다.
 *
 * 이미 세션이 있으면 아무것도 하지 않는다(멱등). 앱을 껐다 켜도 SecureStore 에서 복원되므로
 * registerDevice 는 기기당 사실상 평생 1회다.
 *
 * ⚠ 실패해도 호출부를 막지 않는다. 오프라인이면 문의는 익명으로라도 보내져야 한다.
 * ⚠ 앱 삭제·기기 변경으로 UUID 가 사라지면 이전 문의와의 연결도 끊긴다(복구 경로 없음).
 */
export async function ensureDeviceSession(): Promise<boolean> {
  if (!secureStoreAvailable || !commonServer.isConfigured()) return false;

  try {
    if (await commonServer.isSignedIn()) {
      // 세션이 SecureStore 에서 복원됐다는 뜻 — registerDevice 를 부르지 않는다.
      // 이게 매 부팅마다 '신규 등록'으로 찍히면 영속화가 깨진 것이고, 서버의
      // 기기 등록 레이트리밋(IP당 10회/600초)에 곧 걸린다.
      if (__DEV__) console.log('[commonServer] 기기 세션: 복원됨');
      return true;
    }

    let deviceId = await SecureStore.getItemAsync(DEVICE_ID_KEY);
    if (!deviceId) {
      // 서버가 소문자 UUID v4 형식을 강제한다. Math.random 기반 생성기는 쓰지 않는다 —
      // 이 값이 곧 남의 문의를 읽는 열쇠라 추측 가능하면 안 된다.
      deviceId = randomUUID();
      await SecureStore.setItemAsync(DEVICE_ID_KEY, deviceId);
    }

    const result = await commonServer.registerDevice(deviceId);
    // ⚠ deviceId 자체는 절대 찍지 않는다 — 로그에 남으면 그게 곧 남의 문의를 읽는 열쇠가 된다.
    if (__DEV__) console.log('[commonServer] 기기 세션: 신규 등록', result.ok ? 'ok' : result.reason);
    return result.ok;
  } catch {
    // 저장소·네트워크 어느 쪽이 실패했든 익명으로 계속 쓸 수 있어야 한다
    return false;
  }
}
