/**
 * 구독 소유자 묶기 — **「돈은 나가는데 pro 가 아닌」 상태를 막는 약속들.**
 *
 * 🔴 이 파일이 지키는 가장 무거운 약속: **주체 ID 를 모를 때는 초기화하지 않는다.**
 *    익명으로 초기화하면 그 뒤의 결제가 `$RCAnonymousID` 에 붙고, 웹훅이
 *    `anonymous-app-user-id` 로 거부한다. **결제는 성공하고 권한만 안 생긴다** —
 *    크래시도 오류도 없어서 돈을 낸 사람이 문의를 할 때까지 아무도 모른다.
 *
 * 🔴 두 번째 약속: **「구매 복원」은 스토어에 먼저 묻고 서버를 나중에 읽는다.**
 *    거꾸로 하면 소유자를 옮기기 **전의 빈손**을 읽어 「구독 없음」이 뜬다.
 *    값은 둘 다 맞고 **순서만** 틀리는 종류라, 값을 재는 테스트로는 안 잡힌다.
 */

declare const require: (id: string) => any;
declare const __dirname: string;

const fs = require('fs') as { readFileSync(p: string, enc: string): string };
const path = require('path') as { join(...parts: string[]): string };

const mockCalls: string[] = [];
let mockConfigured = false;
let mockActive: Record<string, unknown> = {};
let mockThrowOn: string | null = null;
let mockPackages: any[] = [];
let mockPurchaseError: any = null;

/** SDK 가 주는 모양 그대로의 묶음 하나 */
const pkg = (packageType: string, priceString: string, price: number) => ({
  packageType,
  product: { priceString, price, currencyCode: 'KRW' },
});

jest.mock('react-native-purchases', () => ({
  __esModule: true,
  default: {
    configure: (o: { apiKey: string; appUserID: string }) => {
      if (mockThrowOn === 'configure') throw new Error('boom');
      mockCalls.push(`configure:${o.appUserID}:${o.apiKey}`);
      mockConfigured = true;
    },
    logIn: async (id: string) => {
      if (mockThrowOn === 'logIn') throw new Error('boom');
      mockCalls.push(`logIn:${id}`);
      return { customerInfo: {}, created: false };
    },
    restorePurchases: async () => {
      if (mockThrowOn === 'restore') throw new Error('boom');
      mockCalls.push('restore');
      return { entitlements: { active: mockActive } };
    },
    setLogLevel: () => {},
    isConfigured: async () => mockConfigured,
    getOfferings: async () => {
      if (mockThrowOn === 'getOfferings') throw new Error('boom');
      mockCalls.push('getOfferings');
      return { current: { availablePackages: mockPackages } };
    },
    purchasePackage: async (pkg: { packageType: string }) => {
      mockCalls.push(`purchase:${pkg.packageType}`);
      if (mockPurchaseError !== null) throw mockPurchaseError;
      return {};
    },
  },
  LOG_LEVEL: { DEBUG: 'debug', ERROR: 'error' },
}));

import {
  __resetForTest,
  getPlans,
  isAvailable,
  purchase,
  restore,
  syncSubject,
} from '../src/services/subscriptionService';

const SUBJECT_A = '11111111-1111-4111-8111-111111111111';
const SUBJECT_B = '22222222-2222-4222-8222-222222222222';

beforeEach(() => {
  mockCalls.length = 0;
  mockConfigured = false;
  mockActive = {};
  mockThrowOn = null;
  mockPackages = [];
  mockPurchaseError = null;
  __resetForTest();
});

describe('🔴 주체 ID 를 모르면 아무것도 하지 않는다', () => {
  it('null 이면 초기화하지 않는다 — 익명 ID 가 생기는 유일한 경로를 막는다', async () => {
    await syncSubject(null);
    expect(mockCalls).toEqual([]);
  });

  it('빈 문자열도 같다', async () => {
    await syncSubject('');
    expect(mockCalls).toEqual([]);
  });
});

describe('주체를 맞추는 순서', () => {
  it('첫 호출은 configure 이고 appUserID 가 우리 주체 ID 다', async () => {
    await syncSubject(SUBJECT_A);
    expect(mockCalls).toHaveLength(1);
    expect(mockCalls[0]).toContain(`configure:${SUBJECT_A}:`);
  });

  it('🔴 configure 에 공개 키를 넘긴다 — goog_ 로 시작해야 한다', async () => {
    await syncSubject(SUBJECT_A);
    expect(mockCalls[0]).toMatch(/configure:[^:]+:goog_/);
  });

  it('같은 주체로 다시 부르면 아무것도 안 한다 — 부팅마다 호출돼도 괜찮아야 한다', async () => {
    await syncSubject(SUBJECT_A);
    await syncSubject(SUBJECT_A);
    await syncSubject(SUBJECT_A);
    expect(mockCalls).toHaveLength(1);
  });

  it('🔴 주체가 바뀌면 configure 가 아니라 logIn 이다 — 그게 소유자를 옮긴다', async () => {
    await syncSubject(SUBJECT_A);
    await syncSubject(SUBJECT_B);
    expect(mockCalls).toEqual([expect.stringContaining(`configure:${SUBJECT_A}`), `logIn:${SUBJECT_B}`]);
  });

  it('바뀐 뒤 또 같은 주체면 조용하다', async () => {
    await syncSubject(SUBJECT_A);
    await syncSubject(SUBJECT_B);
    await syncSubject(SUBJECT_B);
    expect(mockCalls).toHaveLength(2);
  });

  it('이미 configure 된 프로세스에 처음 들어와도 configure 를 두 번 부르지 않는다', async () => {
    mockConfigured = true; // 다른 경로가 먼저 켠 상태
    await syncSubject(SUBJECT_A);
    expect(mockCalls).toEqual([`logIn:${SUBJECT_A}`]);
  });
});

describe('복원', () => {
  it('활성 엔타이틀먼트가 있으면 found', async () => {
    mockActive = { pro: {} };
    expect(await restore()).toEqual({ found: true });
  });

  it('없으면 found 가 아니다', async () => {
    expect(await restore()).toEqual({ found: false });
  });

  it('⚠ 응답에 entitlements 가 아예 없어도 터지지 않는다', async () => {
    mockActive = undefined as unknown as Record<string, unknown>;
    expect(await restore()).toEqual({ found: false });
  });
});

describe('🔴 실패해도 던지지 않는다 — 구독 묶기가 앱을 못 쓰게 만들 이유는 아니다', () => {
  it('configure 가 터져도 삼킨다', async () => {
    mockThrowOn = 'configure';
    await expect(syncSubject(SUBJECT_A)).resolves.toBeUndefined();
  });

  it('logIn 이 터져도 삼킨다', async () => {
    mockThrowOn = 'logIn';
    await syncSubject(SUBJECT_A);
    mockThrowOn = 'logIn';
    await expect(syncSubject(SUBJECT_B)).resolves.toBeUndefined();
  });

  it('복원이 터져도 삼키고 found 가 아니다', async () => {
    mockThrowOn = 'restore';
    expect(await restore()).toEqual({ found: false });
  });

  it('🔴 터진 뒤에 주체가 묶인 것으로 기억하지 않는다 — 다음 호출이 다시 시도해야 한다', async () => {
    mockThrowOn = 'configure';
    await syncSubject(SUBJECT_A);
    mockThrowOn = null;
    await syncSubject(SUBJECT_A);
    expect(mockCalls).toEqual([expect.stringContaining(`configure:${SUBJECT_A}`)]);
  });
});

describe('모듈이 붙어 있을 때만 켠다', () => {
  it('키가 있고 모듈이 있으면 쓸 수 있다', () => {
    expect(isAvailable()).toBe(true);
  });
});

/*
 * ───────────────────────── 소스를 직접 읽는 가드 ─────────────────────────
 *
 * 아래는 **다른 파일이 약속을 깨는 것**을 잡는다. 값을 재는 테스트로는 안 잡히는 종류다.
 * 🔴 파일을 옮기거나 이름을 바꾸면 이 경로들도 같이 고친다. 안 고치면
 *    **없는 파일을 지키면서 초록**이 된다 — 그게 이 종류 테스트의 유일한 고장 방식이다.
 */
const SRC = (rel: string): string =>
  fs.readFileSync(path.join(__dirname, '..', 'src', rel), 'utf8');

/** 주석을 걷어낸다 — 주석에 적힌 글자를 호출로 세면 가드가 거짓으로 초록이 된다. */
const stripComments = (s: string): string =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('🔴 비밀 키가 앱에 섞이지 않는다', () => {
  it("소스에 sk_ 로 시작하는 문자열 리터럴이 없다 — 박히면 누구나 남의 구독을 조작한다", () => {
    const code = stripComments(SRC('services/subscriptionService.ts'));
    expect(code).not.toMatch(/['"`]sk_/);
  });

  it('공개 키는 goog_ 로 시작한다 — 플랫폼이 섞이면 결제가 조용히 안 붙는다', () => {
    const code = SRC('services/subscriptionService.ts');
    expect(code).toMatch(/PROD_PUBLIC_SDK_KEY = 'goog_[A-Za-z0-9]+'/);
  });
});

describe('🔴 주체가 바뀌는 자리마다 구독도 같이 묶는다', () => {
  const auth = (): string => stripComments(SRC('services/authService.ts'));

  it('authService 가 subscriptionService 를 들여온다', () => {
    expect(auth()).toContain("from './subscriptionService'");
  });

  it('한 함수로 모은다 — 호출부마다 configure/logIn 을 고르면 하나가 익명으로 샌다', () => {
    expect(auth()).toMatch(/async function bindSubscription\(\)/);
    expect(auth()).toContain('subscriptionService.syncSubject(');
  });

  it('🔴 주체가 바뀌는 네 자리가 전부 부른다 (되감기 · 서버 사본 삭제 포함)', () => {
    const code = auth();
    // 되감기는 signIn·signOut 둘이 공유하므로 그 함수 안에 있으면 둘 다 덮인다.
    expect(code).toMatch(/rewindForNewSubject\(\)[\s\S]{0,200}?bindSubscription\(\)/);
    // 서버 사본 삭제 뒤처리는 되감기를 쓰지 않으므로 따로 있어야 한다.
    expect(code).toMatch(/afterServerErased[\s\S]{0,600}?bindSubscription\(\)/);
    // 부팅·설정 화면 경로.
    expect(code).toMatch(/restoreSession\(\)[\s\S]{0,300}?bindSubscription\(\)/);
    expect((code.match(/bindSubscription\(\)/g) ?? []).length).toBeGreaterThanOrEqual(4);
  });
});

describe('🔴 「구매 복원」은 스토어를 먼저, 서버를 나중에 읽는다', () => {
  it('순서가 뒤집히면 옮기기 전의 빈손을 읽는다', () => {
    const code = stripComments(SRC('contexts/PurchaseContext.tsx'));
    const store = code.indexOf('subscriptionService.restore()');
    const server = code.indexOf('refreshPro(true)');
    expect(store).toBeGreaterThan(-1);
    expect(server).toBeGreaterThan(-1);
    expect(store).toBeLessThan(server);
  });
});

// ── 요금제 · 결제 (2026-10-16 · 시안 #20 의 밑바탕) ──────────────────────────

describe('🔴 요금제 — 가격을 지어내지 않는다', () => {
  it('둘 다 오면 둘 다 준다', async () => {
    mockPackages = [pkg('ANNUAL', '₩39,000', 39000), pkg('MONTHLY', '₩4,900', 4900)];
    const plans = await getPlans();
    expect(plans.map((p) => p.kind)).toEqual(['yearly', 'monthly']);
    expect(plans[0].priceString).toBe('₩39,000');
  });

  it('하나만 와도 그대로 준다 — 화면이 카드 하나만 그린다', async () => {
    mockPackages = [pkg('MONTHLY', '₩4,900', 4900)];
    expect((await getPlans()).map((p) => p.kind)).toEqual(['monthly']);
  });

  it('🔴 조회가 실패하면 **빈 배열**이다 — 던지지도, 지어내지도 않는다', async () => {
    mockThrowOn = 'getOfferings';
    expect(await getPlans()).toEqual([]);
  });

  it('🔴 가격 문자열이 비면 그 요금제를 버린다 — 빈 가격으로 결제받으면 가격 고지를 어긴다', async () => {
    mockPackages = [pkg('ANNUAL', '', 39000), pkg('MONTHLY', '₩4,900', 4900)];
    expect((await getPlans()).map((p) => p.kind)).toEqual(['monthly']);
  });

  it('모르는 종류(주간 등)는 버린다 — 화면이 그릴 자리가 없다', async () => {
    mockPackages = [pkg('WEEKLY', '₩1,500', 1500)];
    expect(await getPlans()).toEqual([]);
  });
});

describe('🔴 결제 — 사유마다 할 일이 다르다. 하나로 접지 않는다', () => {
  beforeEach(async () => {
    mockPackages = [pkg('ANNUAL', '₩39,000', 39000), pkg('MONTHLY', '₩4,900', 4900)];
    await getPlans();
  });

  it('성공하면 ok', async () => {
    expect(await purchase('yearly')).toEqual({ ok: true });
    expect(mockCalls).toContain('purchase:ANNUAL');
  });

  it("코드 '1' → 취소. **오류가 아니다**", async () => {
    mockPurchaseError = { code: '1' };
    expect(await purchase('yearly')).toEqual({ ok: false, reason: 'cancelled' });
  });

  it('옛 네이티브가 코드를 안 주고 userCancelled 만 줘도 취소로 읽는다', async () => {
    mockPurchaseError = { userCancelled: true };
    expect(await purchase('monthly')).toEqual({ ok: false, reason: 'cancelled' });
  });

  it("코드 '6' → 이미 구독. **다시 결제시키지 않는다**", async () => {
    mockPurchaseError = { code: '6' };
    expect(await purchase('yearly')).toEqual({ ok: false, reason: 'already-owned' });
  });

  it("코드 '3' → 결제가 허용되지 않음(보호자 승인 거부 등). error 와 섞지 않는다", async () => {
    mockPurchaseError = { code: '3' };
    expect(await purchase('yearly')).toEqual({ ok: false, reason: 'not-allowed' });
  });

  it('모르는 코드는 error 로 내려앉는다 — SDK 가 코드를 늘려도 앱이 안 깨진다', async () => {
    mockPurchaseError = { code: '99' };
    expect(await purchase('yearly')).toEqual({ ok: false, reason: 'error' });
  });

  it('🔴 숫자 1 과 문자열 "1" 을 섞지 않는다 — 섞으면 취소가 영영 오류로 보인다', async () => {
    mockPurchaseError = { code: 1 };
    expect(await purchase('yearly')).toEqual({ ok: false, reason: 'cancelled' });
  });
});

describe('🔴 가격을 모르면 결제창을 띄우지 않는다', () => {
  it('요금제를 안 가져왔으면 unavailable — 가격을 모르는 채로 사게 하지 않는다', async () => {
    const r = await purchase('yearly');
    expect(r).toEqual({ ok: false, reason: 'unavailable' });
    expect(mockCalls.some((c) => c.startsWith('purchase:'))).toBe(false);
  });

  it('한쪽만 가져왔으면 없는 쪽은 결제창을 안 띄운다', async () => {
    mockPackages = [pkg('MONTHLY', '₩4,900', 4900)];
    await getPlans();
    expect(await purchase('yearly')).toEqual({ ok: false, reason: 'unavailable' });
    expect(mockCalls.some((c) => c.startsWith('purchase:'))).toBe(false);
  });
});

describe('🔴 「확인 중」을 만들 길이 화면에 열려 있다', () => {
  it('PurchaseContext 가 서버에 다시 묻는 함수를 내보낸다', () => {
    const code = stripComments(SRC('contexts/PurchaseContext.tsx'));
    expect(code).toContain('recheckPro: refreshPro');
  });

  it('🔴 「못 물어봤다」를 「아니다」로 돌려주지 않는다', () => {
    /*
     * 「확인 중」 화면은 몇 초 간격으로 몇 번 다시 묻는다. 실패를 `false` 로 주면
     * **네트워크가 잠깐 끊긴 사람에게 「구독이 아니다」**가 된다. 그래서 `null` 이다.
     * (`proKnown` 을 둔 것과 같은 이유 — 모르는 것과 아닌 것을 섞지 않는다)
     */
    const code = stripComments(SRC('contexts/PurchaseContext.tsx'));
    expect(code).toContain('Promise<boolean | null>');
    const body = code.slice(code.indexOf('const refreshPro'), code.indexOf('const buy'));
    // 실패 자리 둘(못 물어봄 · 예외)이 모두 null 을 돌려준다
    expect((body.match(/return null;/g) ?? []).length).toBe(2);
    expect(body).toContain('return active;');
  });
});

