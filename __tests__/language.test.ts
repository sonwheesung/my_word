import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Localization from 'expo-localization';
import {
  resolveAppLanguage,
  resolveDeviceLanguage,
  getStoredLanguage,
  setStoredLanguage,
  resetLanguageCache,
  isSupportedLanguage,
  FALLBACK_LANGUAGE,
} from '../src/i18n/language';
import { LANGUAGE_KEY } from '../src/constants/appConfig';

jest.mock('expo-localization', () => ({ getLocales: jest.fn() }));

const mockedLocalization = Localization as jest.Mocked<typeof Localization>;

function withDeviceLocales(tags: string[]) {
  mockedLocalization.getLocales.mockReturnValue(
    tags.map((t) => ({ languageTag: t, languageCode: t.split('-')[0] })) as never,
  );
}

beforeEach(async () => {
  jest.clearAllMocks();
  resetLanguageCache();
  await AsyncStorage.clear();
});

describe('isSupportedLanguage', () => {
  it('지원 목록만 통과시킨다', () => {
    expect(isSupportedLanguage('ko')).toBe(true);
    expect(isSupportedLanguage('en')).toBe(true);
    for (const v of ['de', 'KO', 'ko-KR', '', null, undefined, 42, {}]) {
      expect(isSupportedLanguage(v)).toBe(false);
    }
  });
});

describe('resolveDeviceLanguage', () => {
  it.each([
    [['ko-KR'], 'ko'],
    [['en-US'], 'en'],
    [['ko_KR'], 'ko'],
    [['KO-kr'], 'ko'],
  ])('%s → %s', (tags, expected) => {
    withDeviceLocales(tags as string[]);
    expect(resolveDeviceLanguage()).toBe(expected);
  });

  it('선호 언어 목록에서 지원하는 첫 번째를 고른다', () => {
    withDeviceLocales(['de-DE', 'fr-FR', 'ko-KR', 'en-US']);
    expect(resolveDeviceLanguage()).toBe('ko');
  });

  it('지원 언어가 하나도 없으면 폴백', () => {
    withDeviceLocales(['de-DE', 'th-TH']);
    expect(resolveDeviceLanguage()).toBe(FALLBACK_LANGUAGE);
  });

  it('기기 정보를 못 읽어도 앱을 막지 않는다', () => {
    mockedLocalization.getLocales.mockImplementation(() => {
      throw new Error('unavailable');
    });
    expect(resolveDeviceLanguage()).toBe(FALLBACK_LANGUAGE);
  });

  it('빈 목록도 폴백으로 처리한다', () => {
    withDeviceLocales([]);
    expect(resolveDeviceLanguage()).toBe(FALLBACK_LANGUAGE);
  });
});

describe('resolveAppLanguage', () => {
  it('저장된 설정이 기기 언어보다 우선한다', async () => {
    withDeviceLocales(['ko-KR']);
    await setStoredLanguage('en');
    resetLanguageCache();

    expect(await resolveAppLanguage()).toBe('en');
  });

  it('저장된 설정이 없으면 기기 언어를 따른다', async () => {
    withDeviceLocales(['ko-KR']);
    expect(await resolveAppLanguage()).toBe('ko');
  });

  it('저장된 값이 깨졌으면 무시하고 기기 언어를 따른다', async () => {
    await AsyncStorage.setItem(LANGUAGE_KEY, 'klingon');
    withDeviceLocales(['ko-KR']);

    expect(await getStoredLanguage()).toBeNull();
    expect(await resolveAppLanguage()).toBe('ko');
  });

  it('한 번 정해지면 저장소를 다시 읽지 않는다', async () => {
    withDeviceLocales(['ko-KR']);
    expect(await resolveAppLanguage()).toBe('ko');

    // 저장소를 밖에서 바꿔도 이미 정해진 값을 유지한다 = 다시 읽지 않았다는 뜻
    await AsyncStorage.setItem(LANGUAGE_KEY, 'en');

    expect(await resolveAppLanguage()).toBe('ko');
  });

  it('설정을 바꾸면 즉시 반영된다', async () => {
    withDeviceLocales(['ko-KR']);
    expect(await resolveAppLanguage()).toBe('ko');

    await setStoredLanguage('en');

    expect(await resolveAppLanguage()).toBe('en');
    expect(await getStoredLanguage()).toBe('en');
  });

  it('저장에 실패해도 이번 실행에는 반영한다', async () => {
    withDeviceLocales(['ko-KR']);
    // spyOn().mockRestore() 는 이 목 모듈을 되돌리지 못해 뒤 테스트를 오염시킨다. 직접 교체한다
    const original = AsyncStorage.setItem;
    (AsyncStorage as { setItem: unknown }).setItem = jest
      .fn()
      .mockRejectedValue(new Error('disk full'));

    try {
      await setStoredLanguage('en');
      expect(await resolveAppLanguage()).toBe('en');
    } finally {
      (AsyncStorage as { setItem: unknown }).setItem = original;
    }
  });
});
