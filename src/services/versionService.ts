import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { APP_VERSION, STORE_URL, VERSION_SKIP_KEY } from '../constants/appConfig';
import { compareVersions } from './commonServer';
import type { Bootstrap } from './commonServer/types';

/**
 * 진입 게이트 판정 — 점검 · 강제 업데이트 · 업데이트 안내.
 *
 * 판정 근거는 **공통 서버의 bootstrap 응답뿐**이다. 예전처럼 앱 안의 상수(LATEST_VERSION)를
 * 보지 않는다 — 그 방식은 "업데이트가 있다는 사실을 알려면 먼저 업데이트해야 하는" 구조라
 * 애초에 동작할 수 없었다. 이제 스토어 심사를 기다리지 않고 서버에서 안내를 켤 수 있다.
 *
 * 서버 조회에 **실패하면 게이트를 적용하지 않는다**(호출부가 boot=null 로 넘긴다).
 * 서버가 죽었다고 사용자가 앱을 못 쓰는 일은 없어야 한다.
 */

// 웹 환경 localStorage 폴백
const isWeb = Platform.OS === 'web';
const storageImpl = isWeb
  ? {
      async getItem(key: string): Promise<string | null> {
        if (typeof window !== 'undefined' && window.localStorage) {
          return window.localStorage.getItem(key);
        }
        return null;
      },
      async setItem(key: string, value: string): Promise<void> {
        if (typeof window !== 'undefined' && window.localStorage) {
          window.localStorage.setItem(key, value);
        }
      },
    }
  : AsyncStorage;

export type GateDecision =
  | { kind: 'none' }
  | { kind: 'maintenance'; title: string; body: string }
  /** 안내만. 건너뛰기·나중에 가능. */
  | { kind: 'soft-update'; currentVersion: string; latestVersion: string; storeUrl: string };

/** 앱 진입을 막는 판정 — 닫을 수 없는 전체 화면으로 표시한다. */
export type BlockingDecision = Extract<GateDecision, { kind: 'maintenance' }>;

export function isBlocking(decision: GateDecision): decision is BlockingDecision {
  return decision.kind === 'maintenance';
}

/** 서버가 준 스토어 링크를 우선하고, 없으면 앱에 박힌 상수로 폴백한다. */
function resolveStoreUrl(version: Bootstrap['version']): string {
  const fromServer =
    Platform.OS === 'ios' ? version.iosUrl : Platform.OS === 'android' ? version.androidUrl : null;
  return fromServer ?? STORE_URL ?? '';
}

/**
 * 게이트 판정 — 순수 함수. 저장소·네트워크를 건드리지 않으므로 그대로 테스트할 수 있다.
 *
 * 우선순위: 점검 > 업데이트 안내. 점검 중이라면 업데이트를 권해봤자 의미가 없다.
 *
 * **버전으로 앱을 막지 않는다.** 서버가 `min` 을 내려도 진입을 차단하지 않고 안내로만 쓴다
 * (사용자를 가두는 대가가 얻는 것보다 크다는 판단). 진입 차단 수단은 점검 모드 하나뿐이다.
 *
 * @param boot   bootstrap 응답. 조회 실패 시 null — 이때는 항상 'none'
 * @param skippedVersion 사용자가 건너뛴 버전(없으면 null). 소프트 안내에만 영향을 준다
 */
export function evaluateGate(boot: Bootstrap | null, skippedVersion: string | null): GateDecision {
  if (!boot) return { kind: 'none' };

  if (boot.maintenance.active) {
    return {
      kind: 'maintenance',
      title: boot.maintenance.title,
      body: boot.maintenance.body,
    };
  }

  const { min, latest } = boot.version;
  const storeUrl = resolveStoreUrl(boot.version);
  const belowMin = min !== null && compareVersions(APP_VERSION, min) < 0;

  // 안내 대상 버전. `min` 은 차단이 아니라 안내 후보로만 쓴다 — 관리자가 min 만 채웠을 때
  // 아무 일도 안 일어나면 그것도 사고이므로, 둘 중 높은 쪽을 안내한다.
  let target = latest;
  if (belowMin && min !== null && (target === null || compareVersions(min, target) > 0)) {
    target = min;
  }

  if (target !== null && compareVersions(APP_VERSION, target) < 0 && skippedVersion !== target) {
    return { kind: 'soft-update', currentVersion: APP_VERSION, latestVersion: target, storeUrl };
  }

  return { kind: 'none' };
}

export const versionService = {
  /** 저장소에서 건너뛴 버전을 읽어 게이트를 판정한다. 저장소 오류는 "건너뛴 적 없음"으로 본다. */
  async resolveGate(boot: Bootstrap | null): Promise<GateDecision> {
    let skipped: string | null = null;
    try {
      skipped = await storageImpl.getItem(VERSION_SKIP_KEY);
    } catch {
      // 저장소 에러 무시 — 안내가 한 번 더 뜨는 것이 안 뜨는 것보다 낫다
    }
    return evaluateGate(boot, skipped);
  },

  /** 해당 버전 건너뛰기 저장 */
  async skipVersion(version: string): Promise<void> {
    try {
      await storageImpl.setItem(VERSION_SKIP_KEY, version);
    } catch {
      // 저장소 에러 무시
    }
  },
};
