/**
 * 로그인 — **기기 주체에서 구글 계정으로 갈아타는 일**(2026-10-13 · C 단계).
 *
 * 🔴 이 파일이 지키는 가장 무거운 약속: **갈아탈 때마다 장부를 비운다.**
 *    비우지 않으면 `pickChanged` 가 아무것도 안 골라 **새 계정의 서버가 영원히 빈다.**
 *    크래시도 오류도 없고, 폰을 잃은 날에야 알게 된다.
 *
 * 🔴 두 번째 약속: **`provider === 'google'` 일 때만 로그인이다.** 이 앱은 로그인 없이도
 *    서버에 주체가 있다(`device`). `subject !== null` 로 판정하면 **로그인한 적 없는 사람
 *    전원에게 「로그인됨」**이 뜬다.
 */

declare const require: (id: string) => any;
declare const __dirname: string;

const fs = require('fs') as { readFileSync(p: string, enc: string): string };
const path = require('path') as { join(...parts: string[]): string };

import { SIGNED_OUT, toAuthState } from '../src/services/authService';

describe('🔴 toAuthState — 기기 주체를 로그인으로 세지 않는다', () => {
  it('구글 주체면 로그인이다', () => {
    expect(toAuthState({ provider: 'google', email: 'a@b.com' })).toEqual({
      signedIn: true,
      email: 'a@b.com',
    });
  });

  it('🔴 기기 주체는 로그인이 아니다 — 로그인 없이도 주체는 늘 있다', () => {
    expect(toAuthState({ provider: 'device', email: null })).toEqual(SIGNED_OUT);
  });

  it('주체가 없으면 로그인이 아니다', () => {
    expect(toAuthState(null)).toEqual(SIGNED_OUT);
  });

  it('공급자가 이메일을 안 줘도 로그인은 로그인이다', () => {
    expect(toAuthState({ provider: 'google' })).toEqual({ signedIn: true, email: null });
  });

  it('이메일이 문자열이 아니면 버린다 — 화면에 [object Object] 를 띄우지 않는다', () => {
    expect(toAuthState({ provider: 'google', email: undefined })).toEqual({
      signedIn: true,
      email: null,
    });
  });

  it('⚠ 모르는 공급자는 로그인이 아니다 — 카카오·애플이 붙는 날 이 줄을 같이 고친다', () => {
    expect(toAuthState({ provider: 'kakao', email: 'a@b.com' })).toEqual(SIGNED_OUT);
  });
});

// ── 🔴 소스를 훑어 「세 경로 전부」를 센다 ─────────────────────────────────────

const read = (rel: string): string => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
const squash = (src: string): string =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n]*/g, ' ')
    .replace(/\s+/g, '');

const AUTH = 'src/services/authService.ts';
const GOOGLE = 'src/services/googleAuth.ts';
const SETTINGS = 'src/screens/SettingsScreen.tsx';

/** 함수 하나의 몸통만 잘라 낸다. 한 호출이 모든 자리를 만족시키지 못하게 한다 */
const bodyOf = (src: string, start: string, end: string): string => {
  const a = src.indexOf(start);
  expect(a).toBeGreaterThanOrEqual(0);
  const b = src.indexOf(end, a + start.length);
  return src.slice(a, b < 0 ? src.length : b);
};

describe('🔴 갈아탈 때마다 장부를 비운다 (소스 훑기)', () => {
  it('⚠ 가드가 실제로 읽었다 — 빈 파일을 지키며 초록이 되지 않는다', () => {
    expect(read(AUTH)).toContain('export const authService');
    expect(read(GOOGLE)).toContain('export async function signInGoogle');
    expect(read(SETTINGS).length).toBeGreaterThan(5000);
  });

  it('🔴 되감기는 한 함수다 — 세 곳이 같은 것을 부른다', () => {
    const src = squash(read(AUTH));
    // 비우는 코드는 그 함수 안에 **한 번만** 있다
    expect(src.split('syncService.saveState(EMPTY_STATE)').length - 1).toBe(2);
    expect(src).toContain('asyncfunctionrewindForNewSubject()');
    for (const fn of ['asyncsignIn()', 'asyncsignOut()']) {
      expect(bodyOf(src, fn, '},')).toContain('awaitrewindForNewSubject()');
    }
  });

  it('🔴 로그인은 **성공한 뒤에만** 되감는다', () => {
    const src = squash(read(AUTH));
    const body = bodyOf(src, 'asyncsignIn()', 'asyncsignOut()');
    const fail = body.indexOf('if(!r.ok)');
    const rewind = body.indexOf('awaitrewindForNewSubject()');
    expect(fail).toBeGreaterThan(0);
    expect(rewind).toBeGreaterThan(fail);
  });

  it('🔴 서버가 거절하면 구글 세션도 끊는다 — 안 끊으면 계정을 바꿔 볼 길이 막힌다', () => {
    const body = bodyOf(squash(read(AUTH)), 'asyncsignIn()', 'asyncsignOut()');
    const fail = body.indexOf('if(!r.ok)');
    const out = body.indexOf('awaitsignOutGoogle()');
    expect(out).toBeGreaterThan(fail);
  });

  it('🔴 지운 뒤에는 비우되 **밀지 않는다** — 밀면 방금 지운 것이 곧바로 올라간다', () => {
    const body = bodyOf(squash(read(AUTH)), 'asyncafterServerErased()', '};');
    expect(body).toContain('syncService.saveState(EMPTY_STATE)');
    expect(body).toContain('awaitrevokeGoogle()');
    expect(body).not.toContain('syncScheduler.now()');
  });

  it('🔴 로그아웃은 기기 세션을 바로 되살린다 — 안 그러면 밀기가 헛돈다', () => {
    const body = bodyOf(squash(read(AUTH)), 'asyncsignOut()', 'asyncafterServerErased()');
    expect(body).toContain('awaitensureDeviceSession()');
  });
});

describe('🔴 webClientId — 여기를 틀리면 "설정은 다 했는데 로그인이 안 된다"', () => {
  it('웹 클라이언트 ID 를 쓴다', () => {
    const src = read(GOOGLE);
    expect(src).toContain('.apps.googleusercontent.com');
    expect(src).toContain('webClientId');
  });

  it('⚠ Expo Go 에서는 모듈을 건드리지 않는다 — require 하면 RedBox 가 뜬다', () => {
    const src = squash(read(GOOGLE));
    expect(src).toContain("Constants.executionEnvironment==='storeClient'");
    expect(src).toContain('if(isExpoGo)returnnull');
  });

  it('🔴 토큰이 비어 오는 경우를 서버 401 과 가른다', () => {
    expect(squash(read(GOOGLE))).toContain("code:'NO_ID_TOKEN'");
  });

  it('⚠ 실패 코드를 번역하지 않고 그대로 보인다 — DEVELOPER_ERROR 가 그대로 보여야 한다', () => {
    expect(squash(read(SETTINGS))).toContain("t('구글로그인에실패했어요({{code}})',{code:fail.code})");
  });
});

describe('🔴 설정 화면 (소스 훑기)', () => {
  it('쓸 수 없는 빌드에서는 계정 절을 아예 안 그린다', () => {
    expect(squash(read(SETTINGS))).toContain('{authService.isAvailable()&&(');
  });

  it('🔴 「확인 중」과 「로그인 안 됨」을 다르게 그린다 — 안 그러면 깜빡인다', () => {
    const src = squash(read(SETTINGS));
    expect(src).toContain('auth===null?(');
    expect(src).toContain('auth.signedIn?(');
  });

  it('🔴 서버 사본을 지운 뒤 뒷정리를 부른다', () => {
    const src = squash(read(SETTINGS));
    const erase = src.indexOf('commonServer.deleteAccount()');
    const after = src.indexOf('authService.afterServerErased()');
    expect(erase).toBeGreaterThanOrEqual(0);
    expect(after).toBeGreaterThan(erase);
  });

  it('⚠ 취소는 아무 말도 하지 않는다 — 스스로 닫은 것이다', () => {
    const src = squash(read(SETTINGS));
    expect(src).toContain("case'cancelled':returnnull");
    expect(src).toContain('if(message!==null)showToast(message');
  });
});
