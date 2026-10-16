/**
 * 구독 소유자 묶기 — **「돈은 나가는데 pro 가 아닌」 상태에서 빠져나오는 유일한 길.**
 *
 * ## 🔴 서버만으로는 안 된다. 그걸 먼저 확인했다
 *
 * 공통 서버에는 RevenueCat 에서 상태를 당겨 오는 폴백이 이미 있다(`lib/rcPull.ts`).
 * 그런데 그 조회의 키가 **`app_user_id` = 우리 주체 ID** 다. 기기를 바꾸거나 설정에서
 * 「서버에 보관된 내용 지우기」를 누르면 주체가 새로 생기고, RevenueCat 은 **그 새 ID 가
 * 무엇을 가졌는지 모른다** — 구매는 죽은 옛 ID 에 묶여 있다. 그래서 서버가 아무리 물어도
 * 빈손으로 돌아온다.
 *
 * 소유자를 옮기려면 **구매가 실제로 있는 기기에서** 스토어에 물어봐야 하고, 그게 이 SDK 다.
 * 서버 주석이 같은 결론을 적어 두었다 — *"`restorePurchases()` 를 부르면 RC 가 소유자를 옮기고
 * TRANSFER 웹훅이 온다. 안 부르면 돈은 나가는데 pro 가 아닌 상태가 유지된다."*
 *
 * ```
 * 해지 후 같은 기기에서 재구독   🟢 주체가 그대로라 이 파일 없이도 된다
 * 폰을 바꿨을 때                 🔴 이 파일이 있어야 한다
 * 「지우기」를 누른 뒤            🔴 이 파일이 있어야 한다
 * 구글 로그인으로 주체가 바뀔 때   🔴 이 파일이 있어야 한다
 * ```
 *
 * ## 🔴 `app_user_id` 는 **반드시** 우리 주체 ID 다. 익명으로 두면 조용히 실패한다
 *
 * RevenueCat 은 ID 를 안 주면 스스로 익명 ID(`$RCAnonymousID:…`)를 만든다. 그 상태로 결제하면
 * 웹훅이 `anonymous-app-user-id` 로 **거부**한다(`common_server/lib/revenuecat.ts`).
 * 결제는 성공하고 권한만 안 생기는, 가장 찾기 어려운 실패다.
 *
 * → 그래서 **주체 ID 를 알기 전에는 `configure` 를 부르지 않는다.** 한 번이라도 익명으로
 *   초기화하면 그 뒤에 한 결제가 익명 ID 에 붙을 수 있다. 늦게 켜는 쪽이 안전하다.
 *
 * ## ⚠ 평생 광고 제거(`remove_ads`)는 여기서 다루지 않는다
 *
 * 그쪽은 `expo-iap` 이 그대로 맡는다. 게시된 약관 제6조가 *"평생 광고 제거에 관하여 구매 토큰을
 * 포함한 어떠한 결제 정보도 회사 서버로 전송하거나 저장하지 않는다"* 고 적고 있고,
 * 그 약속을 지키려면 그 상품은 RevenueCat 을 거치지 않아야 한다.
 *
 * 🟢 RevenueCat SDK 와 자체 IAP 코드를 **함께 쓰는 것은 공식 지원**이다(Play Billing 8 이상 조건).
 *    실측: `expo-iap` 이 끌어오는 BillingClient 가 **9.1.0** 이라 조건을 넘긴다.
 * 🔴 다만 **두 라이브러리가 같은 빌드에 들어가는 것은 아직 구워 본 적이 없다.**
 *    Gradle 이 둘의 BillingClient 를 합치는 결과는 빌드해야 보인다. 릴리스 빌드 E2E 에서
 *    **광고 제거 구매·복원이 여전히 되는지** 반드시 다시 잰다(R8 절의 교훈과 같은 종류다).
 *
 * ⚠ 네이티브 모듈이라 **Expo Go 에서는 없다.** `require` 하면 RedBox 가 뜨므로 건너뛴다.
 */
import Constants from 'expo-constants';

/**
 * RevenueCat Android **공개** SDK 키. `goog_` 로 시작한다.
 *
 * ⚠ 공개값이라 코드에 둔다(앱 번들에 어차피 구워진다). `.env` 로 덮어쓸 수 있게만 열어 둔다.
 * 🚫 **`sk_` 로 시작하는 Secret key 를 여기 넣지 마라.** 그건 서버 전용이고, 앱에 박으면
 *    누구나 남의 구독을 조작할 수 있다. 서버는 `RC_SECRET_API_KEY_MYWORD` 로 따로 갖는다.
 */
const PROD_PUBLIC_SDK_KEY = 'goog_cBBJSjNtjoYzgaAEMYpobEIoaoo';

const PUBLIC_SDK_KEY = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY || PROD_PUBLIC_SDK_KEY;

const isExpoGo = Constants.executionEnvironment === 'storeClient';

interface CustomerInfo {
  entitlements?: { active?: Record<string, { productIdentifier?: string } | undefined> };
  originalAppUserId?: string;
}

/**
 * SDK 가 주는 요금제 묶음 중 **우리가 쓰는 칸만** 적는다.
 * ⚠ 전체 타입을 베껴 오지 않는다 — SDK 가 올라가면 베낀 쪽이 조용히 어긋난다.
 */
interface RcPackage {
  packageType: string;
  product: { priceString: string; price: number; currencyCode: string };
}

interface PurchasesModule {
  default: {
    configure: (o: { apiKey: string; appUserID: string }) => void;
    logIn: (appUserID: string) => Promise<{ customerInfo: CustomerInfo; created: boolean }>;
    restorePurchases: () => Promise<CustomerInfo>;
    setLogLevel: (level: unknown) => void;
    isConfigured: () => Promise<boolean>;
    getOfferings: () => Promise<{ current?: { availablePackages?: RcPackage[] } | null }>;
    purchasePackage: (pkg: RcPackage) => Promise<unknown>;
    getCustomerInfo: () => Promise<CustomerInfo>;
  };
  LOG_LEVEL?: { DEBUG?: unknown; ERROR?: unknown };
}

function loadModule(): PurchasesModule | null {
  if (isExpoGo) return null;
  try {
    return require('react-native-purchases') as PurchasesModule;
  } catch {
    return null;
  }
}

/** 이 기기에서 구독 소유자 묶기를 쓸 수 있는가. 키가 없으면 **꺼진 것으로 다룬다.** */
export function isAvailable(): boolean {
  return PUBLIC_SDK_KEY.length > 0 && loadModule() !== null;
}

/**
 * 지금 SDK 가 들고 있는 주체 ID. `configure` 를 두 번 부르지 않기 위한 것이고,
 * **주체가 바뀌었는지 판정하는 기준**이다.
 */
let boundSubjectId: string | null = null;

/**
 * 주체 ID 를 SDK 에 맞춘다. 로그인·로그아웃·지우기·부팅 **전부 이 한 함수로** 들어온다.
 *
 * 🔴 **갈라서 쓰지 마라.** `configure` 와 `logIn` 을 호출부마다 고르게 하면 어느 경로 하나가
 *    익명으로 초기화하고, 그 사고는 결제한 뒤에야 드러난다.
 *
 * ⚠ 실패해도 던지지 않는다. 구독 묶기가 안 되는 것이 **앱을 못 쓰게 만들 이유는 아니다**
 *   (오프라인에 오류를 띄우지 않는다는 이 프로젝트의 원칙과 같다).
 */
export async function syncSubject(subjectId: string | null): Promise<void> {
  if (!isAvailable()) return;
  // 🔴 주체를 모르면 **아무것도 하지 않는다.** 익명으로 초기화하는 것보다 안 켜는 쪽이 낫다.
  if (!subjectId) return;
  if (boundSubjectId === subjectId) return;

  const mod = loadModule();
  if (!mod) return;
  const Purchases = mod.default;

  try {
    if (__DEV__ && mod.LOG_LEVEL?.DEBUG !== undefined) {
      Purchases.setLogLevel(mod.LOG_LEVEL.DEBUG);
    }
    const already = boundSubjectId !== null || (await Purchases.isConfigured());
    if (already) {
      // 🟢 주체가 바뀐 경우다. `logIn` 이 RevenueCat 쪽 소유자를 옮기고 TRANSFER 웹훅을 만든다.
      await Purchases.logIn(subjectId);
    } else {
      Purchases.configure({ apiKey: PUBLIC_SDK_KEY, appUserID: subjectId });
    }
    boundSubjectId = subjectId;
  } catch (error: any) {
    if (__DEV__) {
      console.warn('[subscription] syncSubject 실패:', error?.message ?? error);
    }
  }
}

/**
 * 스토어에 "이 기기가 가진 것"을 물어 소유자를 지금 주체로 옮긴다.
 *
 * 🔴 **이것이 「돈은 나가는데 pro 가 아닌」 상태의 답이다.** 사용자가 그 사실을 알 리 없으므로
 *    설정의 「구매 복원」이 이 함수를 함께 불러야 한다 — 그 버튼이 유일한 입구다.
 *
 * 반환은 "성공했는가"가 아니라 **"활성 구독을 찾았는가"** 다. 호출부는 이 값으로 문구를
 * 가르지 말고, **서버의 엔타이틀먼트를 다시 읽어** 판정해야 한다 — 소유자 이전은 웹훅을 거치고,
 * 그 왕복이 끝난 뒤가 진실이다.
 */
export async function restore(): Promise<{ found: boolean }> {
  if (!isAvailable()) return { found: false };
  const mod = loadModule();
  if (!mod) return { found: false };

  try {
    const info = await mod.default.restorePurchases();
    const active = info?.entitlements?.active ?? {};
    return { found: Object.keys(active).length > 0 };
  } catch (error: any) {
    if (__DEV__) {
      console.warn('[subscription] restore 실패:', error?.message ?? error);
    }
    return { found: false };
  }
}

// ── 요금제 · 결제 (2026-10-16 · 시안 단어앱#20 의 밑바탕) ────────────────────

/** 파는 요금제는 둘뿐이다. 🔴 이름을 늘리기 전에 Play 콘솔 상품부터 늘린다 */
export type SubPlanKind = 'yearly' | 'monthly';

export interface SubPlan {
  kind: SubPlanKind;
  /**
   * 🔴 **Play 가 준 현지 가격 문자열을 그대로 쓴다.** 원화 고정 문자열로 채우지 않는다 —
   *    이 앱은 145개국에 나가 있고, 지어낸 가격은 **결제 전 가격 고지**를 어긴다.
   */
  priceString: string;
  /** 숫자 가격. **월 환산과 할인율 계산에만** 쓴다(화면에 그대로 찍지 않는다) */
  price: number;
  currency: string;
}

/**
 * 결제 결과.
 *
 * 🔴 **사유마다 사용자가 할 일이 다르다.** 하나로 접으면 2026-10-15 의 AI 시험 실패 화면과
 *    같은 잘못이 된다 — 거기서는 일곱 가지가 *"잠시 뒤에 다시 시도해 주세요"* 로 뭉개져 있었다.
 */
export type SubPurchaseResult =
  | { ok: true }
  /** 결제창을 닫았다. **가장 흔하다** — 오류로 보여 주지 않는다 */
  | { ok: false; reason: 'cancelled' }
  /** 이미 구독 중이다(다른 기기에서 샀거나 서버 반영 전). **다시 결제시키지 않는다** */
  | { ok: false; reason: 'already-owned' }
  /**
   * 기기가 결제를 허용하지 않는다 — 보호자 승인 거부 · 결제 제한.
   * 🔴 **`error` 와 섞지 않는다.** 사용자 잘못이 아니고 「다시 시도」로도 안 풀린다.
   */
  | { ok: false; reason: 'not-allowed' }
  /** 결제 모듈이 없다(Expo Go · 키 없음) */
  | { ok: false; reason: 'unavailable' }
  | { ok: false; reason: 'error' };

/**
 * 🔴 SDK 의 에러 코드 **실제 값**이다(`@revenuecat/purchases-typescript-internal` 의
 *    `error-codes.d.ts` 를 직접 읽어 맞췄다 · 2026-10-16).
 * ⚠ 숫자를 **문자열**로 준다. `e.code === 1` 로 비교하면 영영 안 맞는다.
 */
const RC_CANCELLED = '1';
const RC_NOT_ALLOWED = '3';
const RC_ALREADY_OWNED = '6';

/** SDK 가 준 묶음을 화면이 쓸 모양으로 옮긴다. 모르는 종류는 버린다 */
function toPlan(pkg: RcPackage): SubPlan | null {
  const kind: SubPlanKind | null =
    pkg.packageType === 'ANNUAL' ? 'yearly' : pkg.packageType === 'MONTHLY' ? 'monthly' : null;
  if (kind === null) return null;
  const p = pkg.product;
  if (typeof p?.priceString !== 'string' || p.priceString.length === 0) return null;
  if (typeof p.price !== 'number' || !Number.isFinite(p.price)) return null;
  return { kind, priceString: p.priceString, price: p.price, currency: p.currencyCode ?? '' };
}

/** 가져온 묶음을 그대로 들고 있는다 — `purchase` 가 **같은 객체**를 SDK 에 돌려줘야 한다 */
let cachedPackages: RcPackage[] = [];

/**
 * 파는 요금제를 가져온다.
 *
 * 🔴 **못 가져오면 빈 배열이다. 지어내지 않는다.** 화면은 그때 가격을 비우고 [다시 시도]를
 *    준다(시안 #20 「가격 없음」). 가격 없이 결제를 받으면 **결제 전 가격 고지**를 못 지킨다.
 * ⚠ 하나만 와도 그대로 돌려준다 — 화면이 카드 하나만 그리고 할인 알약을 숨긴다.
 */
export async function getPlans(): Promise<SubPlan[]> {
  cachedPackages = [];
  if (!isAvailable()) return [];
  const mod = loadModule();
  if (!mod) return [];
  try {
    const offerings = await mod.default.getOfferings();
    const pkgs = offerings?.current?.availablePackages ?? [];
    cachedPackages = pkgs;
    const out: SubPlan[] = [];
    for (const pkg of pkgs) {
      const plan = toPlan(pkg);
      if (plan !== null) out.push(plan);
    }
    return out;
  } catch (error: any) {
    if (__DEV__) {
      console.warn('[subscription] getPlans 실패:', error?.message ?? error);
    }
    return [];
  }
}

/**
 * 고른 요금제를 산다.
 *
 * 🔴 **이 함수가 성공했다고 구독자가 된 것이 아니다.** 권한의 진실은 **서버**다
 *    (`PurchaseContext` 머리 주석). Play 결제가 끝나도 웹훅이 서버에 닿기 전이면 잠깐
 *    `pro` 가 아니다 — 부르는 쪽은 `recheckPro(true)` 로 **서버에 다시 물어** 판정한다.
 * 🚫 **던지지 않는다.** 결제창을 닫은 것은 오류가 아니다.
 * ⚠ `getPlans()` 를 먼저 불러야 한다 — SDK 에 **그때 받은 묶음 객체**를 돌려줘야 하기 때문이다.
 */
export async function purchase(kind: SubPlanKind): Promise<SubPurchaseResult> {
  if (!isAvailable()) return { ok: false, reason: 'unavailable' };
  const mod = loadModule();
  if (!mod) return { ok: false, reason: 'unavailable' };

  const want = kind === 'yearly' ? 'ANNUAL' : 'MONTHLY';
  const pkg = cachedPackages.find((p) => p.packageType === want);
  // 🔴 묶음이 없으면 **결제창을 띄우지 않는다.** 가격을 모르는 채로 사게 하면 안 된다
  if (pkg === undefined) return { ok: false, reason: 'unavailable' };

  try {
    await mod.default.purchasePackage(pkg);
    return { ok: true };
  } catch (error: any) {
    const code = String(error?.code ?? '');
    // ⚠ `userCancelled` 는 SDK 가 **버리기로 한 칸**이지만, 옛 네이티브가 코드를 안 줄 때가 있다
    if (code === RC_CANCELLED || error?.userCancelled === true) {
      return { ok: false, reason: 'cancelled' };
    }
    if (code === RC_ALREADY_OWNED) return { ok: false, reason: 'already-owned' };
    if (code === RC_NOT_ALLOWED) return { ok: false, reason: 'not-allowed' };
    if (__DEV__) {
      console.warn('[subscription] purchase 실패:', code, error?.message ?? error);
    }
    return { ok: false, reason: 'error' };
  }
}

/**
 * 지금 쓰고 있는 요금제가 월간인가 연간인가 (2026-10-16 · 시안 #21).
 *
 * 🔴 **서버는 이걸 모른다.** 앱이 받는 권한 정보는 `active · expiresAt · willRenew ·
 *    inGracePeriod` 넷뿐이다. 상품 종류는 **기기의 스토어 SDK** 에만 있다.
 * 🚫 **금액은 여기서도 안 가져온다.** 「지금 파는 가격」과 「이 사람이 내는 가격」은 다르다 —
 *    가격을 올리면 옛 구독자는 옛 가격을 내는데 화면이 새 가격을 말하게 된다.
 * ⚠ 모르면 `null` 이다. 화면은 그때 종류를 적지 않고 날짜만 보여 준다.
 */
export async function activePlanKind(): Promise<SubPlanKind | null> {
  if (!isAvailable()) return null;
  const mod = loadModule();
  if (!mod) return null;
  try {
    const info = await mod.default.getCustomerInfo();
    const id = info?.entitlements?.active?.['pro']?.productIdentifier ?? '';
    // Play 의 기본 요금제 id 가 뒤에 붙는다(`myword_pro:yearly`)
    if (id.endsWith('yearly')) return 'yearly';
    if (id.endsWith('monthly')) return 'monthly';
    return null;
  } catch (error: any) {
    if (__DEV__) {
      console.warn('[subscription] activePlanKind 실패:', error?.message ?? error);
    }
    return null;
  }
}

/** 테스트용 — 모듈 수준 상태를 비운다. 🚫 앱 코드에서 부르지 않는다. */
export function __resetForTest(): void {
  boundSubjectId = null;
  cachedPackages = [];
}

export const subscriptionService = { isAvailable, syncSubject, restore, getPlans, purchase, activePlanKind };
