/**
 * 로그인 — **기기 주체에서 구글 계정으로 갈아타는 일**(2026-10-13 · `docs/SERVER_RESTORE_PLAN.md` C 단계).
 *
 * ## 🔴 승계를 만들지 않았다. 「다시 민다」가 전부다
 *
 * 구글로 로그인하면 서버에 **새 주체**가 생기고, 기기 주체의 사본은 고아가 된다.
 * 두 주체의 데이터를 섞는 병합 코드를 쓰지 않는다 — 틀리면 **남의 단어가 내 단어장에
 * 들어오고**, 그 사고는 조용하다.
 *
 * ```
 * 기기가 정본이다 → 로그인한 뒤 기기에 있는 것을 전부 다시 민다
 * ```
 *
 * 🔴 **그 「다시」를 만드는 것이 장부 비우기 한 줄이다.** `pickChanged` 는
 * `updated_at > 마지막으로 민 시각` 인 것만 고른다. 갈아탄 뒤에도 그 시각이 남아 있으면
 * **아무것도 안 골라서 새 계정의 서버가 영원히 빈다.** 비우면 전부 「바뀐 것」이 된다.
 *
 * ⚠ `syncService.needsRewind` 가 저절로 잡아 주기도 한다(주체가 바뀌면 `serverTotal` 이
 *   0 으로 보인다). 그래도 **명시적으로 비운다** — 저절로 되는 것에 기대지 않는다
 *   (설계서 §6 이 같은 말을 적어 두었다).
 *
 * ## ⚠ 로그아웃도 주체가 바뀌는 일이다
 *
 * 로그아웃하면 다시 **기기 주체**로 돌아간다. 그쪽 서버에는 로그인 전까지의 사본이 있고,
 * 그 사이에 기기에서 바뀐 것은 안 올라가 있다. 그래서 로그아웃에서도 똑같이 비운다.
 */
import { commonServer, ensureDeviceSession } from './commonServer/client';
import { googleAvailable, revokeGoogle, signInGoogle, signOutGoogle } from './googleAuth';
import { syncScheduler } from './syncScheduler';
import { EMPTY_STATE, syncService } from './syncService';

/** 로그인 실패를 화면이 고르는 값. `null` 은 성공이고, 취소는 아무 말도 하지 않는다 */
export type SignInFail =
  /** 이 빌드에 구글 로그인이 없다(Expo Go · 웹) */
  | { kind: 'unavailable' }
  /** 사용자가 창을 닫았다 — 🔴 화면은 아무것도 띄우지 않는다 */
  | { kind: 'cancelled' }
  /** 구글이 거절했다. `code` 를 그대로 보인다(`DEVELOPER_ERROR` 면 지문·패키지 문제다) */
  | { kind: 'google'; code?: string }
  /** 우리 서버가 거절했다 */
  | { kind: 'server'; reason: string };

export interface AuthState {
  /** 구글 계정으로 들어와 있는가. 기기 주체만 있는 상태는 **false** 다 */
  signedIn: boolean;
  email: string | null;
}

export const SIGNED_OUT: AuthState = { signedIn: false, email: null };

/**
 * 🔴 **주체가 바뀌었다. 장부를 비우고 전부 다시 민다.**
 *
 * 이 함수가 로그인·로그아웃·서버 사본 삭제 세 곳에서 **똑같이** 불린다.
 * 한 곳이라도 빠지면 그 경로에서만 조용히 서버가 비어 있게 된다.
 */
async function rewindForNewSubject(): Promise<void> {
  await syncService.saveState(EMPTY_STATE);
  syncScheduler.now();
}

/**
 * 서버가 준 주체를 화면이 쓰는 모양으로. **순수 함수다.**
 *
 * 🔴 **`provider === 'google'` 일 때만 「로그인」이다.** 이 앱은 로그인 없이도 서버에 주체가
 *    있다(`provider: 'device'` — 문의 답변을 돌려받으려고 최초 실행 때 만든 무작위 식별자).
 *    `subject !== null` 로 판정하면 **로그인한 적 없는 사람 전원에게 「로그인됨」**이 뜬다.
 */
export const toAuthState = (
  subject: { email?: string | null; provider?: string } | null,
): AuthState =>
  subject && subject.provider === 'google'
    ? { signedIn: true, email: typeof subject.email === 'string' ? subject.email : null }
    : SIGNED_OUT;

const toState = toAuthState;

export const authService = {
  /** 이 빌드에서 로그인 줄을 띄워도 되는가 */
  isAvailable(): boolean {
    return googleAvailable() && commonServer.isConfigured();
  },

  /**
   * 지금 들고 있는 것. **네트워크를 타지 않는다.**
   *
   * 🔴 **이것만으로 화면을 그리면 안 된다.** SDK 의 `getSubject()` 는 이 JS 프로세스에서
   *    `login`·`restoreSession` 을 한 번 부른 뒤에만 채워진다 — 콜드부팅 직후에는 세션이
   *    멀쩡해도 `null` 이라, 로그인해 둔 사람에게 **「로그인 안 됨」으로 보인다.**
   *    화면은 `refresh()` 를 부르고, 그 전까지는 「확인 중」으로 둔다.
   */
  current(): AuthState {
    return toState(commonServer.getSubject());
  },

  /**
   * 서버에 물어 최신 주체를 받는다. 계정 줄을 그리는 화면이 뜰 때 부른다.
   *
   * ⚠ 부팅마다 부르지 않는다 — 계정 줄은 설정 화면에만 있고, 요청 하나를 매 실행에
   *   더할 이유가 없다. `ensureDeviceSession` 은 세션이 살아 있으면 건너뛰므로
   *   구글 세션이 기기 세션으로 덮이는 일도 없다.
   *
   * 🔴 **오프라인이면 로그아웃시키지 않는다.** 기기에 들고 있는 것을 그대로 답한다.
   */
  async refresh(): Promise<AuthState> {
    const res = await commonServer.restoreSession();
    if (!res.ok) return toState(commonServer.getSubject());
    return toState(res.subject);
  },

  async signIn(): Promise<SignInFail | null> {
    const g = await signInGoogle();
    if (!g.ok) {
      if (g.reason === 'cancelled') return { kind: 'cancelled' };
      if (g.reason === 'unavailable') return { kind: 'unavailable' };
      return { kind: 'google', ...(g.code === undefined ? {} : { code: g.code }) };
    }

    const r = await commonServer.login('google', g.idToken);
    if (!r.ok) {
      /*
       * 🔴 우리 서버가 거절했으면 구글 세션도 끊는다. 안 끊으면 다음 시도에서 계정 선택
       *    창이 안 뜨고 **같은 계정으로만 계속 실패**한다 — 다른 계정으로 바꿔 볼 길이 막힌다.
       */
      await signOutGoogle();
      return { kind: 'server', reason: r.reason };
    }

    await rewindForNewSubject();
    return null;
  },

  async signOut(): Promise<void> {
    await signOutGoogle();
    await commonServer.logout();
    /*
     * 🔴 기기 세션을 **바로** 되살린다. 안 되살리면 다음 부팅까지 밀기가 'not-signed-in' 으로
     *    떨어지고, 스케줄러가 간격을 늘려 가며 헛돈다.
     */
    await ensureDeviceSession();
    await rewindForNewSubject();
  },

  /**
   * 서버 사본을 지운 **뒤** 뒷정리. 설정 화면의 「서버에 보관된 내용 지우기」가 부른다.
   *
   * 🔴 탈퇴는 **그 주체를 가명화**한다. 구글로 들어와 있었다면 권한까지 회수해야
   *    화면이 「로그인됨」으로 남아 있지 않는다.
   */
  async afterServerErased(): Promise<void> {
    await revokeGoogle();
    await ensureDeviceSession();
    /*
     * 🔴 **비우되 밀지는 않는다.** 여기서 `syncScheduler.now()` 를 부르면 방금 지운 것이
     *    곧바로 다시 올라가 지운 의미가 없어진다.
     *
     * ⚠ 그래도 **비우기는 한다.** 안 비우면 다음에 단어 하나를 고쳤을 때 그 한 줄만 올라가고,
     *   새 주체의 서버에 **반쪽짜리 사본**이 생긴다. 반쪽은 통째보다 나쁘다 —
     *   「복구하면 돌아온다」가 거짓이 되기 때문이다.
     *
     * 그래서 결과는 이렇게 된다(처리방침·웹 삭제 페이지에 적은 그대로):
     *   지운 직후   서버에 아무것도 없다
     *   계속 쓰시면  다음에 뭔가 바뀔 때 **새 식별자로 처음부터** 다시 보관된다
     */
    await syncService.saveState(EMPTY_STATE);
  },
};
