import { dictionaryService } from '../src/services/dictionaryService';
import * as language from '../src/i18n/language';

// requireActual 은 expo-localization(네이티브 모듈)을 끌고 들어와 테스트 환경에서 깨진다.
// 이 파일이 쓰는 것은 resolveAppLanguage 하나뿐이므로 모듈 전체를 대체한다.
jest.mock('../src/i18n/language', () => ({
  resolveAppLanguage: jest.fn(),
  // i18n 초기화가 함께 끌려오므로 그쪽이 쓰는 것도 채워 둔다
  resolveDeviceLanguage: () => 'ko',
  setStoredLanguage: jest.fn(),
  SUPPORTED_LANGUAGES: ['ko', 'en'],
  FALLBACK_LANGUAGE: 'en',
}));

const mockedResolve = language.resolveAppLanguage as jest.MockedFunction<
  typeof language.resolveAppLanguage
>;

/** Google Translate 응답 모양: [번역, 사전항목, 감지언어, …] */
function translateResponse(opts: {
  detected: string;
  plain?: string;
  entries?: Array<[string, string[]]>;
}) {
  return [
    [[opts.plain ?? '뜻', 'src', null, null, 10]],
    opts.entries ? opts.entries.map(([pos, list]) => [pos, list, [], '', 1]) : null,
    opts.detected,
  ];
}

const DICT_RESPONSE = [
  {
    word: 'apple',
    meanings: [
      { definitions: [{ example: 'She ate an apple.' }, { definition: 'no example here' }] },
    ],
  },
];

let calls: string[] = [];

function mockFetch(handler: (url: string) => { ok: boolean; body: unknown }) {
  (globalThis as unknown as { fetch: jest.Mock }).fetch = jest.fn(async (url: string) => {
    calls.push(url);
    const { ok, body } = handler(url);
    return { ok, json: async () => body };
  });
}

beforeEach(() => {
  calls = [];
  jest.clearAllMocks();
  mockedResolve.mockResolvedValue('ko');
});

describe('요청 형태', () => {
  it('원본 언어를 고정하지 않고 감지시킨다 (sl=auto)', async () => {
    mockFetch(() => ({ ok: true, body: translateResponse({ detected: 'de', plain: '사과' }) }));

    await dictionaryService.lookup('Apfel');

    expect(calls[0]).toContain('sl=auto');
    expect(calls[0]).toContain('tl=ko');
  });

  it('품사 라벨 언어를 영어로 고정한다 (hl=en)', async () => {
    // hl 을 빼면 요청의 Accept-Language 를 따라가, 같은 코드가 기기마다 다른 품사를 준다
    mockFetch(() => ({
      ok: true,
      body: translateResponse({ detected: 'ru', entries: [['noun', ['book']]] }),
    }));

    const outcome = await dictionaryService.lookup('книга');

    expect(calls[0]).toContain('hl=en');
    expect(outcome.ok && outcome.data.partOfSpeech).toEqual(['명사']);
  });

  it('앱 언어가 영어면 품사도 영어로 표시한다', async () => {
    mockedResolve.mockResolvedValue('en');
    mockFetch(() => ({
      ok: true,
      body: translateResponse({ detected: 'ru', entries: [['noun', ['book']]] }),
    }));

    const outcome = await dictionaryService.lookup('книга');

    expect(outcome.ok && outcome.data.partOfSpeech).toEqual(['noun']);
  });

  it('뜻 언어가 앱 언어를 따른다', async () => {
    mockedResolve.mockResolvedValue('en');
    mockFetch(() => ({ ok: true, body: translateResponse({ detected: 'de', plain: 'apple' }) }));

    await dictionaryService.lookup('Apfel');

    expect(calls[0]).toContain('tl=en');
  });

  it('입력을 소문자로 바꾸지 않는다', async () => {
    mockFetch(() => ({ ok: true, body: translateResponse({ detected: 'de', plain: '사과' }) }));

    const outcome = await dictionaryService.lookup('Apfel');

    expect(calls[0]).toContain(encodeURIComponent('Apfel'));
    expect(calls[0]).not.toContain(encodeURIComponent('apfel'));
    expect(outcome.ok && outcome.data.word).toBe('Apfel');
  });

  it('HTTP 실패는 throw 한다', async () => {
    mockFetch(() => ({ ok: false, body: {} }));

    await expect(dictionaryService.lookup('apple')).rejects.toThrow();
  });
});

describe('영어 단어', () => {
  it('뜻과 예문을 모두 가져온다', async () => {
    mockFetch((url) =>
      url.includes('dictionaryapi.dev')
        ? { ok: true, body: DICT_RESPONSE }
        : { ok: true, body: translateResponse({ detected: 'en', entries: [['noun', ['사과']]] }) },
    );

    const outcome = await dictionaryService.lookup('apple');

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.data.meanings).toEqual(['사과']);
    expect(outcome.data.partOfSpeech).toEqual(['명사']);
    expect(outcome.data.examples[0].example).toBe('She ate an apple.');
    expect(outcome.data.examplesUnsupported).toBe(false);
  });

  it('예문을 뜻 언어로 번역해 함께 채운다', async () => {
    mockFetch((url) => {
      if (url.includes('dictionaryapi.dev')) return { ok: true, body: DICT_RESPONSE };
      if (url.includes('dt=bd')) {
        return { ok: true, body: translateResponse({ detected: 'en', entries: [['noun', ['사과']]] }) };
      }
      return { ok: true, body: [[['그녀는 사과를 먹었다.', '']]] }; // 예문 번역
    });

    const outcome = await dictionaryService.lookup('apple');

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.data.examples).toEqual([
      { example: 'She ate an apple.', translation: '그녀는 사과를 먹었다.' },
    ]);
  });

  it('예문 번역이 실패해도 예문 자체는 살린다', async () => {
    mockFetch((url) => {
      if (url.includes('dictionaryapi.dev')) return { ok: true, body: DICT_RESPONSE };
      if (url.includes('dt=bd')) {
        return { ok: true, body: translateResponse({ detected: 'en', entries: [['noun', ['사과']]] }) };
      }
      return { ok: false, body: {} }; // 예문 번역만 실패
    });

    const outcome = await dictionaryService.lookup('apple');

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.data.examples).toEqual([{ example: 'She ate an apple.', translation: '' }]);
  });
});

describe('영어가 아닌 단어', () => {
  it('뜻은 가져오되 예문은 시도조차 하지 않는다', async () => {
    mockFetch(() => ({
      ok: true,
      body: translateResponse({ detected: 'de', entries: [['noun', ['사과']]] }),
    }));

    const outcome = await dictionaryService.lookup('Apfel');

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.data.meanings).toEqual(['사과']);
    expect(outcome.data.examples).toEqual([]);
    expect(outcome.data.examplesUnsupported).toBe(true);
    expect(outcome.data.detectedLanguage).toBe('de');
    // Free Dictionary 는 영어 표제어만 있으므로 부르지 않는다
    expect(calls.some((c) => c.includes('dictionaryapi.dev'))).toBe(false);
  });

  it.each(['ja', 'zh-CN', 'ar', 'ru'])('%s 도 같은 규칙을 따른다', async (detected) => {
    mockFetch(() => ({ ok: true, body: translateResponse({ detected, plain: '뜻' }) }));

    const outcome = await dictionaryService.lookup('단어');

    expect(outcome.ok && outcome.data.examplesUnsupported).toBe(true);
    expect(calls.some((c) => c.includes('dictionaryapi.dev'))).toBe(false);
  });
});

describe('실패 분기', () => {
  it('단어와 뜻이 같은 언어면 번역 결과를 채우지 않는다', async () => {
    mockFetch(() => ({ ok: true, body: translateResponse({ detected: 'ko', plain: '사과' }) }));

    const outcome = await dictionaryService.lookup('사과');

    expect(outcome).toEqual({ ok: false, reason: 'same-language', detectedLanguage: 'ko' });
  });

  it('뜻이 하나도 없으면 not-found', async () => {
    (globalThis as unknown as { fetch: jest.Mock }).fetch = jest.fn(async () => ({
      ok: true,
      json: async () => [null, null, 'de'],
    }));

    expect(await dictionaryService.lookup('asdfqwer')).toEqual({ ok: false, reason: 'not-found' });
  });

  it('빈 입력은 네트워크를 타지 않는다', async () => {
    mockFetch(() => ({ ok: true, body: translateResponse({ detected: 'en' }) }));

    expect(await dictionaryService.lookup('   ')).toEqual({ ok: false, reason: 'not-found' });
    expect(calls).toHaveLength(0);
  });
});
