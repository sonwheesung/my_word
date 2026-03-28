import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { APP_VERSION, LATEST_VERSION, VERSION_SKIP_KEY } from '../constants/appConfig';

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

/**
 * 시맨틱 버전 비교
 * a < b → -1, a === b → 0, a > b → 1
 */
function compareVersions(a: string, b: string): number {
  const partsA = a.split('.').map(Number);
  const partsB = b.split('.').map(Number);
  const len = Math.max(partsA.length, partsB.length);

  for (let i = 0; i < len; i++) {
    const numA = partsA[i] ?? 0;
    const numB = partsB[i] ?? 0;
    if (numA < numB) return -1;
    if (numA > numB) return 1;
  }
  return 0;
}

export interface VersionCheckResult {
  hasUpdate: boolean;
  currentVersion: string;
  latestVersion: string;
}

export const versionService = {
  /**
   * 업데이트 필요 여부 확인
   * - 현재 버전 < 최신 버전이면 hasUpdate = true
   * - 사용자가 해당 버전을 건너뛰었으면 hasUpdate = false
   */
  async checkForUpdate(): Promise<VersionCheckResult> {
    const result: VersionCheckResult = {
      hasUpdate: false,
      currentVersion: APP_VERSION,
      latestVersion: LATEST_VERSION,
    };

    // 현재 버전이 최신 버전 이상이면 업데이트 불필요
    if (compareVersions(APP_VERSION, LATEST_VERSION) >= 0) {
      return result;
    }

    // 사용자가 이 버전을 건너뛴 적 있는지 확인
    try {
      const skippedVersion = await storageImpl.getItem(VERSION_SKIP_KEY);
      if (skippedVersion === LATEST_VERSION) {
        return result; // 건너뛴 버전이면 표시하지 않음
      }
    } catch {
      // 저장소 에러 무시
    }

    result.hasUpdate = true;
    return result;
  },

  /**
   * 해당 버전 건너뛰기 저장
   */
  async skipVersion(version: string): Promise<void> {
    try {
      await storageImpl.setItem(VERSION_SKIP_KEY, version);
    } catch {
      // 저장소 에러 무시
    }
  },
};
