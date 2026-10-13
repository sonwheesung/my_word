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
  entitlements?: { active?: Record<string, unknown> };
  originalAppUserId?: string;
}

interface PurchasesModule {
  default: {
    configure: (o: { apiKey: string; appUserID: string }) => void;
    logIn: (appUserID: string) => Promise<{ customerInfo: CustomerInfo; created: boolean }>;
    restorePurchases: () => Promise<CustomerInfo>;
    setLogLevel: (level: unknown) => void;
    isConfigured: () => Promise<boolean>;
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

/** 테스트용 — 모듈 수준 상태를 비운다. 🚫 앱 코드에서 부르지 않는다. */
export function __resetForTest(): void {
  boundSubjectId = null;
}

export const subscriptionService = { isAvailable, syncSubject, restore };
