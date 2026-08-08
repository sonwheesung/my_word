import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import * as Localization from 'expo-localization';
import { LANGUAGE_KEY } from '../constants/appConfig';

/**
 * 앱 언어 결정.
 *
 *   저장된 설정  →  기기 언어  →  영어(폴백)
 *
 * UI 문구와 사전 번역 언어가 이 값을 함께 따른다. 메뉴는 영어인데 사전 뜻은 한국어로
 * 나오면 앱이 고장난 것으로 보이기 때문이다.
 *
 * 지원 목록에 언어를 추가하면 그 언어 사용자는 기기 설정만으로 자동 적용된다.
 */

export const SUPPORTED_LANGUAGES = ['ko', 'en'] as const;
export type AppLanguage = (typeof SUPPORTED_LANGUAGES)[number];

/** 지원하지 않는 기기 언어일 때 쓰는 값 */
export const FALLBACK_LANGUAGE: AppLanguage = 'en';

/** 설정 화면에 보여줄 이름. 각 언어를 그 언어로 적는다(자기 언어를 못 찾으면 의미가 없다) */
export const LANGUAGE_LABEL: Readonly<Record<AppLanguage, string>> = {
  ko: '한국어',
  en: 'English',
};

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

export function isSupportedLanguage(value: unknown): value is AppLanguage {
  return typeof value === 'string' && (SUPPORTED_LANGUAGES as readonly string[]).includes(value);
}

/** 'ko-KR' · 'ko_KR' · 'KO' 를 모두 'ko' 로 맞춘다 */
function toPrimarySubtag(tag: string): string {
  return tag.toLowerCase().replace(/_/g, '-').split('-')[0];
}

/**
 * 기기 언어 중 지원 목록에 있는 첫 번째를 고른다.
 * 사용자가 선호 언어를 여러 개 등록해 둘 수 있으므로 순서대로 본다.
 */
export function resolveDeviceLanguage(): AppLanguage {
  try {
    for (const locale of Localization.getLocales()) {
      const primary = toPrimarySubtag(locale.languageCode ?? locale.languageTag ?? '');
      if (isSupportedLanguage(primary)) return primary;
    }
  } catch {
    // 기기 정보를 못 읽어도 앱을 막지 않는다
  }
  return FALLBACK_LANGUAGE;
}

/** 사용자가 직접 고른 언어. 없거나 깨졌으면 null */
export async function getStoredLanguage(): Promise<AppLanguage | null> {
  try {
    const raw = await storageImpl.getItem(LANGUAGE_KEY);
    return isSupportedLanguage(raw) ? raw : null;
  } catch {
    return null;
  }
}

export async function setStoredLanguage(language: AppLanguage): Promise<void> {
  try {
    await storageImpl.setItem(LANGUAGE_KEY, language);
    currentLanguage = language;
  } catch {
    // 저장에 실패해도 이번 실행에는 반영해 둔다
    currentLanguage = language;
  }
}

// 사전 조회 등에서 매번 저장소를 읽지 않도록 캐시한다
let currentLanguage: AppLanguage | null = null;

/** 저장된 설정 → 기기 언어 → 폴백 순으로 앱 언어를 정한다 */
export async function resolveAppLanguage(): Promise<AppLanguage> {
  if (currentLanguage) return currentLanguage;
  currentLanguage = (await getStoredLanguage()) ?? resolveDeviceLanguage();
  return currentLanguage;
}

/** 이미 결정된 언어. 아직 결정 전이면 기기 언어로 답한다(동기 호출용) */
export function getCurrentLanguage(): AppLanguage {
  return currentLanguage ?? resolveDeviceLanguage();
}

/** 테스트에서 캐시를 비우기 위한 용도 */
export function resetLanguageCache(): void {
  currentLanguage = null;
}
