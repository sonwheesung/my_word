import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { AD_FREE_KEY, REMOVE_ADS_PRODUCT_ID } from '../constants/appConfig';
import { commonServer } from '../services/commonServer/client';

/**
 * 평생 광고 제거 (관리형 상품 · 비소비성).
 *
 * 🔴 **진실은 Google Play 에 있다.** AsyncStorage 의 값은 부팅 직후 광고가 번쩍이는 것을
 *   막기 위한 캐시일 뿐이다. 매 부팅 `getAvailablePurchases()` 로 다시 확인하고,
 *   환불되면 목록에서 사라지므로 다음 부팅에 광고가 자동으로 돌아온다.
 *
 * ⚠ **서버 영수증 검증을 하지 않는다.** 의도적인 선택이다 — 이 앱은 백엔드가 없고,
 *   탈취되어도 손해가 상품 가격 한 건이다. 검증 서버를 세우는 비용이 그보다 크다.
 *   구독이나 더 비싼 상품을 붙이게 되면 그때 이 판단을 다시 해야 한다.
 */

// 네이티브 모듈이 없는 환경(Expo Go · 웹)에서도 앱이 죽지 않아야 한다.
// 광고 코드(AdBanner·useInterstitialAd)와 같은 방어 규약이다.
let iap: any = null;
let iapAvailable = false;
try {
  iap = require('expo-iap');
  iapAvailable = Platform.OS !== 'web';
} catch {
  // 네이티브 모듈 없음
}

export type PurchaseOutcome =
  | { ok: true }
  | { ok: false; reason: 'cancelled' | 'unavailable' | 'already-owned' | 'error' };

interface PurchaseContextValue {
  /**
   * 광고를 숨겨야 하는가.
   *
   * 🔴 **판정이 두 갈래다**(2026-10-07). 구독 도입 전에 평생 광고제거를 산 사람이 있고,
   *    그 사람에게서 혜택을 빼앗지 않는다.
   * ```
   * 광고 숨김   pro 활성  OR  remove_ads 소유
   * 시험 권한   pro 활성만
   * ```
   *    그래서 RevenueCat 에서 `remove_ads` 를 **어떤 entitlement 에도 안 붙였다** —
   *    붙였으면 평생 광고제거 구매자가 AI 시험까지 공짜로 쓰게 된다.
   */
  adFree: boolean;
  /** 구독(`pro`)이 활성인가. 🔴 **시험 권한은 이것만 본다** */
  proActive: boolean;
  /** 결제 실패 유예 중. 활성이지만 곧 끊길 수 있어 안내를 띄울 수 있다 */
  inGracePeriod: boolean;
  /** Play 조회가 끝났는가. false 면 아직 캐시 값을 보고 있다 */
  ready: boolean;
  /** 스토어가 내려준 지역 통화 표시가. 못 받았으면 null */
  price: string | null;
  /** 구매·복원이 진행 중인가. 버튼 중복 탭 방지용 */
  busy: boolean;
  buy: () => Promise<PurchaseOutcome>;
  restore: () => Promise<PurchaseOutcome>;
}

const PurchaseContext = createContext<PurchaseContextValue>({
  adFree: false,
  proActive: false,
  inGracePeriod: false,
  ready: false,
  price: null,
  busy: false,
  buy: async () => ({ ok: false, reason: 'unavailable' }),
  restore: async () => ({ ok: false, reason: 'unavailable' }),
});

/** 구매 목록에 우리 상품이 실제로 '구매됨' 상태로 들어 있는가 */
function ownsRemoveAds(purchases: unknown): boolean {
  if (!Array.isArray(purchases)) return false;
  return purchases.some((p) => {
    if (typeof p !== 'object' || p === null) return false;
    const row = p as { productId?: unknown; purchaseState?: unknown };
    if (row.productId !== REMOVE_ADS_PRODUCT_ID) return false;
    // ⚠ 'pending'(결제 대기)은 아직 지급하지 않는다. 무통장·상품권 결제가 여기 걸린다.
    //   purchaseState 를 안 내려주는 경우가 있어 그때는 소유로 본다 — 이미 목록에 있으므로.
    return row.purchaseState === undefined || row.purchaseState === 'purchased';
  });
}

export function PurchaseProvider({ children }: { children: React.ReactNode }) {
  const [adFree, setAdFree] = useState(false);
  /**
   * 구독 상태. **공통 서버의 `/api/v1/entitlements` 가 진실이고** Play 를 직접 안 본다 —
   * 구독은 갱신·유예·환불이 있어서 기기에서 판정하면 틀린다(1회성 상품과 다른 점이다).
   *
   * ⚠ 실패하면 `false` 로 둔다. 🔴 **광고를 "못 물어봤으니 숨기자"로 가면 안 된다** —
   *   오프라인인 사람 전원에게 광고가 사라지고, 그건 수익이 조용히 0 이 되는 길이다.
   *   반대로 구독자에게 광고가 잠깐 보이는 것은 되돌릴 수 있다.
   */
  const [proActive, setProActive] = useState(false);
  const [inGracePeriod, setInGracePeriod] = useState(false);
  const [ready, setReady] = useState(false);
  const [price, setPrice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const mounted = useRef(true);

  /** 평생 광고제거를 샀는가. 구독과 **따로** 들고 있어야 판정을 두 갈래로 할 수 있다 */
  const ownsLifetime = useRef(false);

  /**
   * 캐시와 상태를 함께 갱신한다.
   *
   * 🔴 **광고 숨김 = 평생 구매 OR 구독 활성.** 한쪽이 false 라고 숨김을 끄면 안 된다 —
   *    구독자가 평생 구매를 안 했다고 광고가 나오거나, 그 반대가 된다.
   */
  const apply = useCallback(async (next: { lifetime?: boolean; pro?: boolean }) => {
    if (next.lifetime !== undefined) ownsLifetime.current = next.lifetime;
    if (next.pro !== undefined && mounted.current) setProActive(next.pro);
    const hidden = ownsLifetime.current || (next.pro ?? proActive);
    if (mounted.current) setAdFree(hidden);
    try {
      await AsyncStorage.setItem(AD_FREE_KEY, hidden ? '1' : '0');
    } catch {
      // 캐시 실패는 치명적이지 않다 — 다음 부팅에 다시 물어본다
    }
  }, [proActive]);

  /**
   * 구독을 서버에 물어본다. **공통 서버가 진실이다**(위 `proActive` 주석).
   *
   * ⚠ 실패하면 상태를 **바꾸지 않는다.** false 로 덮으면 네트워크가 잠깐 끊긴 구독자에게
   *   광고가 튀어나온다. 못 물어본 것과 "아니다"는 다르다.
   */
  const refreshPro = useCallback(async (fresh = false) => {
    try {
      const result = await commonServer.fetchEntitlements(fresh ? { fresh: true } : {});
      if (!result.ok || !mounted.current) return;
      const pro = result.entitlements['pro'];
      await apply({ pro: pro?.active === true });
      if (mounted.current) setInGracePeriod(pro?.inGracePeriod === true);
    } catch {
      // 못 물어봤다. 다음 기회에 다시 본다
    }
  }, [apply]);

  useEffect(() => {
    mounted.current = true;
    let purchaseSub: { remove?: () => void } | null = null;
    let errorSub: { remove?: () => void } | null = null;

    (async () => {
      // 1) 캐시 먼저. Play 왕복을 기다리는 동안 구매자에게 광고를 보여주지 않는다
      try {
        const cached = await AsyncStorage.getItem(AD_FREE_KEY);
        if (mounted.current && cached === '1') setAdFree(true);
      } catch {
        // 못 읽으면 미구매로 두고 아래에서 Play 가 정정한다
      }

      if (!iapAvailable || iap === null) {
        // ⚠ 웹·IAP 없음에서도 구독은 물어볼 수 있다(서버가 답한다)
        void refreshPro();
        if (mounted.current) setReady(true);
        return;
      }

      // 2) Play 에 물어본다
      try {
        await iap.initConnection();

        // 구매 흐름은 비동기로 돌아온다. 리스너를 먼저 걸어야 놓치지 않는다
        purchaseSub = iap.purchaseUpdatedListener(async (purchase: unknown) => {
          const row = purchase as { productId?: string } | null;
          if (row?.productId !== REMOVE_ADS_PRODUCT_ID) return;
          if (!ownsRemoveAds([purchase])) return;
          /*
           * 🔴 **finishTransaction 을 반드시 부른다.** 비소비성이라 isConsumable 은 false 다.
           *   안 부르면 Play 가 3일 뒤 자동 환불한다 — 돈은 받고 광고는 살아나는 최악이 된다.
           */
          try {
            await iap.finishTransaction({ purchase, isConsumable: false });
          } catch {
            // 확인 실패해도 소유는 소유다. 다음 부팅에 다시 시도된다
          }
          await apply({ lifetime: true });
        });

        errorSub = iap.purchaseErrorListener(() => {
          // 사유는 buy() 의 반환값으로 전달한다. 여기서는 상태만 푼다
          if (mounted.current) setBusy(false);
        });

        const purchases = await iap.getAvailablePurchases();
        await apply({ lifetime: ownsRemoveAds(purchases) });
        // 🔴 구독은 Play 가 아니라 서버에 묻는다. 둘은 서로 기다릴 이유가 없다
        void refreshPro();

        // 표시가는 실패해도 무방하다 — 없으면 화면이 가격을 숨긴다
        try {
          const products = await iap.fetchProducts({
            skus: [REMOVE_ADS_PRODUCT_ID],
            type: 'in-app',
          });
          const found = Array.isArray(products)
            ? products.find(
                (p: { id?: string; displayPrice?: string }) =>
                  p?.id === REMOVE_ADS_PRODUCT_ID,
              )
            : null;
          if (mounted.current && typeof found?.displayPrice === 'string') {
            setPrice(found.displayPrice);
          }
        } catch {
          // 가격 없이도 구매는 된다
        }
      } catch {
        /*
         * ⚠ **캐시 값을 유지한다.** 오프라인이거나 Play 가 응답하지 않을 때
         *   구매자에게 광고를 되돌려주면 안 된다. 미구매자는 캐시가 '0' 이라 그대로 광고를 본다.
         */
      } finally {
        if (mounted.current) setReady(true);
      }
    })();

    return () => {
      mounted.current = false;
      purchaseSub?.remove?.();
      errorSub?.remove?.();
      if (iapAvailable && iap !== null) {
        try {
          iap.endConnection();
        } catch {
          // 정리 실패는 무시한다
        }
      }
    };
  }, [apply]);

  const buy = useCallback(async (): Promise<PurchaseOutcome> => {
    if (!iapAvailable || iap === null) return { ok: false, reason: 'unavailable' };
    if (adFree) return { ok: false, reason: 'already-owned' };
    setBusy(true);
    try {
      await iap.requestPurchase({
        request: { google: { skus: [REMOVE_ADS_PRODUCT_ID] } },
        type: 'in-app',
      });
      /*
       * 여기서 성공을 단정하지 않는다. 실제 지급은 purchaseUpdatedListener 가 한다 —
       * 결제창을 닫는 것과 결제가 끝나는 것은 다른 사건이다.
       */
      return { ok: true };
    } catch (error: any) {
      const code = String(error?.code ?? '');
      if (code.includes('CANCEL') || code.includes('Cancel')) {
        return { ok: false, reason: 'cancelled' };
      }
      if (code.includes('ALREADY_OWNED') || code.includes('AlreadyOwned')) {
        // 이미 산 사람이다. 복원으로 이어주는 것이 맞다
        return { ok: false, reason: 'already-owned' };
      }
      return { ok: false, reason: 'error' };
    } finally {
      setBusy(false);
    }
  }, [adFree]);

  const restore = useCallback(async (): Promise<PurchaseOutcome> => {
    if (!iapAvailable || iap === null) return { ok: false, reason: 'unavailable' };
    setBusy(true);
    try {
      const purchases = await iap.getAvailablePurchases();
      const owned = ownsRemoveAds(purchases);
      await apply({ lifetime: owned });
      /*
       * 🔴 **구독도 함께 되살린다.** "구매 복원"을 누르는 사람은 기기를 바꿨거나 재설치한
       *    사람이고, 그 사람이 가진 것이 평생 구매인지 구독인지 **본인도 모른다.**
       *    `fresh` 로 짧은 쿨다운을 쓴다(SDK 주석: 구매 직후·복원 버튼용).
       */
      await refreshPro(true);
      const restored = owned || proActive;
      return restored ? { ok: true } : { ok: false, reason: 'unavailable' };
    } catch {
      return { ok: false, reason: 'error' };
    } finally {
      setBusy(false);
    }
  }, [apply, proActive, refreshPro]);

  return (
    <PurchaseContext.Provider value={{ adFree,
        proActive,
        inGracePeriod, ready, price, busy, buy, restore }}>
      {children}
    </PurchaseContext.Provider>
  );
}

export function usePurchase(): PurchaseContextValue {
  return useContext(PurchaseContext);
}
