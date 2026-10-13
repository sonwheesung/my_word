/**
 * 구글 로그인 — **ID 토큰만 받아 온다.** 검증은 공통 서버가 한다.
 *
 * 형제 앱(`mission/features/auth/google.ts`)의 모양을 그대로 따른다. 여기서 발명하지 않는다 —
 * 그쪽이 `DEVELOPER_ERROR` 를 포함해 실패 모양을 이미 다 밟아 봤다.
 *
 * ## 🔴 `webClientId` 는 **웹** 클라이언트 ID 다
 *
 * 안드로이드 네이티브 로그인도 ID 토큰의 `aud` 를 **웹 클라이언트 ID** 로 발급한다.
 * Android 클라이언트 ID 를 넣으면 **로그인은 되는데 서버가 전부 401** 이다 —
 * 서버 쪽 주석(`lib/auth/providers.ts`)이 같은 함정을 적어 두었다.
 *
 * ⚠ 공개값이라 코드에 둔다(앱 번들에 어차피 구워진다). `.env` 로 덮어쓸 수 있게만 열어 둔다.
 *
 * ## 🔴 Android OAuth 클라이언트가 **둘** 있어야 한다
 *
 * ```
 * myword-android-upload   업로드 키 SHA-1   내가 로컬에서 구운 릴리스 APK 로 시험할 때
 * myword-android-play     Play 앱 서명 SHA-1 사용자 기기에 깔리는 앱 (운영)
 * ```
 *
 * Play 앱 서명을 쓰므로 사용자 기기의 앱은 **구글이 다시 서명**한다. 업로드 키만 등록하면
 * **로컬에서는 되고 운영에서만 깨진다.** 증상이 「버튼을 눌러도 아무 일도 안 일어남」이라
 * 원인을 찾기 어렵다(2026-10-13 에 둘 다 등록했다).
 *
 * ⚠ 네이티브 모듈이라 **Expo Go 에서는 없다.** `require` 하면 RedBox 가 뜨므로 건너뛴다.
 */
import Constants from 'expo-constants';

/** `myword-web`(2026-10-13 생성 · 구글 프로젝트 `google-oauth-test`). 공개값이다 */
const PROD_WEB_CLIENT_ID =
  '281316002652-e9okg8skt4oc599pr35s5oquf51gcs0b.apps.googleusercontent.com';

const WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || PROD_WEB_CLIENT_ID;

const isExpoGo = Constants.executionEnvironment === 'storeClient';

interface GoogleModule {
  GoogleSignin: {
    configure: (o: { webClientId: string }) => void;
    hasPlayServices: (o?: { showPlayServicesUpdateDialog?: boolean }) => Promise<boolean>;
    signIn: () => Promise<{ type?: string; data?: { idToken?: string | null } | null }>;
    signOut: () => Promise<unknown>;
    revokeAccess: () => Promise<unknown>;
  };
  statusCodes?: { SIGN_IN_CANCELLED?: string };
}

function loadModule(): GoogleModule | null {
  if (isExpoGo) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('@react-native-google-signin/google-signin') as GoogleModule;
  } catch {
    return null;
  }
}

let configured = false;

function ready(): GoogleModule | null {
  const mod = loadModule();
  if (!mod?.GoogleSignin) return null;
  if (!configured) {
    mod.GoogleSignin.configure({ webClientId: WEB_CLIENT_ID });
    configured = true;
  }
  return mod;
}

/** 이 빌드에서 구글 로그인을 쓸 수 있는가. Expo Go·웹이면 false */
export function googleAvailable(): boolean {
  return ready() !== null;
}

export type GoogleResult =
  | { ok: true; idToken: string }
  /**
   * `code` 는 구글이 준 실패 코드다. **번역하지 않고 화면에 그대로 보인다** —
   * `DEVELOPER_ERROR`(10)는 지문·패키지 문제이고, 그 글자가 그대로 보여야 원인을 찾는다.
   */
  | { ok: false; reason: 'cancelled' | 'unavailable' | 'error'; code?: string };

export async function signInGoogle(): Promise<GoogleResult> {
  const mod = ready();
  if (mod === null) return { ok: false, reason: 'unavailable' };
  try {
    await mod.GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const res = await mod.GoogleSignin.signIn();
    if (res.type === 'cancelled') return { ok: false, reason: 'cancelled' };
    const idToken = res.data?.idToken;
    /*
     * 🔴 `webClientId` 가 틀리면 **로그인은 되는데 토큰만 비어서** 온다. 그대로 서버로 보내면
     *    401 로 위장되어 "서버가 거절했다"로 보인다. 여기서 갈라 둬야 원인이 보인다.
     */
    if (typeof idToken !== 'string' || idToken === '') {
      return { ok: false, reason: 'error', code: 'NO_ID_TOKEN' };
    }
    return { ok: true, idToken };
  } catch (error: any) {
    const code = error?.code;
    if (code !== undefined && code === mod.statusCodes?.SIGN_IN_CANCELLED) {
      return { ok: false, reason: 'cancelled' };
    }
    /*
     * 🔴 코드·메시지 앞부분만 담는다. 오류 객체에는 계정 정보가 섞여 올 수 있고,
     *    그게 화면이나 로그로 새어 나가면 안 된다.
     */
    const detail =
      code !== undefined ? String(code) : String(error?.message ?? '').slice(0, 40);
    return { ok: false, reason: 'error', ...(detail === '' ? {} : { code: detail }) };
  }
}

/**
 * 로그아웃 · 서버가 거절했을 때. 🔴 **남겨 두면 다음 로그인에서 계정 선택 창이 안 뜬다** —
 * 다른 계정으로 바꿔 보려는 사람이 막힌다.
 */
export async function signOutGoogle(): Promise<void> {
  try {
    await loadModule()?.GoogleSignin.signOut();
  } catch {
    // 우리 세션은 따로 지운다. 여기 실패가 그걸 막으면 안 된다
  }
}

/** 서버 사본을 지울 때. 앱에 준 권한까지 회수한다 — 다음 로그인에서 동의 화면이 다시 뜬다 */
export async function revokeGoogle(): Promise<void> {
  const g = loadModule()?.GoogleSignin;
  try {
    await g?.revokeAccess();
  } catch {
    // 이미 끊겼으면 그만이다
  }
  try {
    await g?.signOut();
  } catch {
    // 같은 이유
  }
}
