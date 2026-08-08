import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import {
  resolveAppLanguage,
  resolveDeviceLanguage,
  setStoredLanguage,
  type AppLanguage,
} from './language';

/**
 * i18next 초기화.
 *
 * **키가 곧 한국어 원문이다.** `t('단어 추가')` 처럼 쓰고 en.json 이 그 원문을 영어로 옮긴다.
 * 구조화된 키(`word.add`)를 쓰면 번역이 하나라도 빠졌을 때 화면에 키가 그대로 노출되는데,
 * 원문 키는 빠져도 한국어가 나온다. 문구 수백 개를 옮기는 작업에서는 이 차이가 크다.
 * 그래서 ko 번역 파일이 없다 — 한국어는 키 자체다.
 *
 * 한국어 문장에는 '.' 과 ':' 이 들어가므로 키 구분자를 모두 끈다.
 *
 * 저장된 설정을 읽는 것은 비동기라 첫 렌더를 막는다. 동기로 알 수 있는 기기 언어로 먼저
 * 세워 두고, App 이 initLanguage() 를 기다린 뒤 렌더하므로 전환이 눈에 보이지 않는다.
 */
i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    ko: { translation: {} }, // 키가 원문이라 비워 둔다
  },
  lng: resolveDeviceLanguage(),
  // 번역이 없으면 키(= 한국어 원문)를 그대로 쓴다
  fallbackLng: false,
  keySeparator: false,
  nsSeparator: false,
  returnNull: false,
  interpolation: {
    // React Native 에는 HTML 이 없어 이스케이프가 오히려 문자를 망친다
    escapeValue: false,
  },
});

/** 앱 시작 시 1회. 저장된 언어 설정을 반영한다 */
export async function initLanguage(): Promise<AppLanguage> {
  const language = await resolveAppLanguage();
  if (i18n.language !== language) {
    await i18n.changeLanguage(language);
  }
  return language;
}

/** 설정 화면에서 언어를 바꿀 때. 저장과 즉시 반영을 함께 처리한다 */
export async function changeAppLanguage(language: AppLanguage): Promise<void> {
  await setStoredLanguage(language);
  await i18n.changeLanguage(language);
}

export default i18n;
