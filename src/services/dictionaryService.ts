import i18n from '../i18n';
import { localizePOS } from '../constants/partOfSpeech';
import { resolveAppLanguage, type AppLanguage } from '../i18n/language';

/**
 * 사전 연동.
 *
 * 뜻은 Google Translate 사전 모드(dt=bd)로 가져온다. 임의 언어쌍에서 동작하므로
 * 원본 언어를 고정하지 않고 `sl=auto` 로 감지시킨다.
 *
 * 예문은 Free Dictionary API 에서 가져오는데 **영어 표제어만 존재한다.**
 * (Apfel·猫·книга 처럼 유효한 단어도 다른 언어 코드로는 404) 그래서 감지 언어가
 * 영어일 때만 시도하고, 아니면 지원하지 않는다는 사실을 호출자에게 알린다.
 */

export interface DictionaryResult {
  word: string;
  meanings: string[];
  examples: { example: string; translation: string }[];
  partOfSpeech: string[];
  /** Google 이 감지한 원본 언어 (BCP-47 기본 서브태그) */
  detectedLanguage: string;
  /** 이 언어는 예문 자동 수집을 지원하지 않아 뜻만 채웠다 */
  examplesUnsupported: boolean;
}

export type LookupOutcome =
  | { ok: true; data: DictionaryResult }
  | { ok: false; reason: 'not-found' }
  /** 단어와 뜻이 같은 언어라 번역할 것이 없다 (한국어 UI 에서 한국어 단어를 조회한 경우) */
  | { ok: false; reason: 'same-language'; detectedLanguage: string };

const TRANSLATE_ENDPOINT = 'https://translate.googleapis.com/translate_a/single';
const DICTIONARY_ENDPOINT = 'https://api.dictionaryapi.dev/api/v2/entries/en';
const MAX_MEANINGS = 5;
const MAX_EXAMPLES = 3;

interface TranslateLookup {
  meanings: string[];
  partOfSpeech: string[];
  detectedLanguage: string;
}

/** dt=bd 는 사전 항목(품사별 뜻), dt=t 는 일반 번역. 둘 다 요청해 앞의 것을 우선한다 */
async function fetchMeanings(
  word: string,
  targetLanguage: AppLanguage,
): Promise<TranslateLookup> {
  // hl 은 품사 라벨의 언어다. 지정하지 않으면 요청의 Accept-Language 를 따라가서
  // 같은 코드가 기기 로케일에 따라 '명사'/'noun'/'Substantiv' 를 돌려준다.
  // 영어로 고정해 받고, 표시 언어는 localizePOS 가 정한다.
  const url =
    `${TRANSLATE_ENDPOINT}?client=gtx&sl=auto&tl=${targetLanguage}&hl=en` +
    `&dt=bd&dt=t&q=${encodeURIComponent(word)}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(i18n.t('번역 요청에 실패했습니다'));
  }

  const data = await response.json();

  const meanings: string[] = [];
  const partOfSpeech: string[] = [];

  // data[2] = 감지된 원본 언어
  const detectedLanguage = typeof data[2] === 'string' ? data[2].toLowerCase().split('-')[0] : '';

  // data[1] = 사전 항목 (품사별 뜻 배열). 언어쌍에 따라 없을 수 있다
  if (data[1] && Array.isArray(data[1])) {
    for (const entry of data[1]) {
      const pos = entry[0] as string;
      const translations = entry[1] as string[];
      const label = localizePOS(pos, targetLanguage);
      if (!partOfSpeech.includes(label)) {
        partOfSpeech.push(label);
      }
      for (const t of translations) {
        if (meanings.length < MAX_MEANINGS && !meanings.includes(t)) {
          meanings.push(t);
        }
      }
    }
  }

  // 사전 항목이 없으면 기본 번역 사용
  if (meanings.length === 0 && data[0]?.[0]?.[0]) {
    meanings.push(data[0][0][0]);
  }

  return { meanings, partOfSpeech, detectedLanguage };
}

async function translate(text: string, targetLanguage: AppLanguage): Promise<string> {
  try {
    const url =
      `${TRANSLATE_ENDPOINT}?client=gtx&sl=en&tl=${targetLanguage}` +
      `&dt=t&q=${encodeURIComponent(text)}`;
    const response = await fetch(url);
    if (!response.ok) return '';
    const data = await response.json();
    return data[0].map((s: any[]) => s[0]).join('');
  } catch {
    return '';
  }
}

/** 영어 표제어 전용. 다른 언어는 호출하지 않는다 */
async function fetchEnglishExamples(
  word: string,
  targetLanguage: AppLanguage,
): Promise<{ example: string; translation: string }[]> {
  const response = await fetch(`${DICTIONARY_ENDPOINT}/${encodeURIComponent(word)}`);
  if (!response.ok) return [];

  const data = await response.json();
  const examples: string[] = [];

  for (const entry of data) {
    for (const meaning of entry.meanings) {
      for (const definition of meaning.definitions) {
        if (definition.example && examples.length < MAX_EXAMPLES) {
          examples.push(definition.example);
        }
      }
    }
  }

  if (examples.length === 0) return [];

  // targetLanguage 가 'en' 인 경우는 오지 않는다 — 그러면 감지 언어와 같아
  // 호출자가 앞에서 'same-language' 로 빠진다
  const translations = await Promise.all(examples.map((ex) => translate(ex, targetLanguage)));
  return examples.map((example, i) => ({ example, translation: translations[i] }));
}

export const dictionaryService = {
  /**
   * 네트워크·HTTP 실패는 throw 한다(호출자가 잡아 안내). 그 외의 결과는 타입으로 구분한다.
   *
   * 입력을 소문자로 만들지 않는다 — 독일어 명사처럼 대문자가 철자인 언어에서
   * 조회 품질이 떨어지고, 사용자가 친 표기를 바꿔 버린다.
   */
  async lookup(word: string): Promise<LookupOutcome> {
    const trimmed = word.trim();
    if (!trimmed) return { ok: false, reason: 'not-found' };

    const targetLanguage = await resolveAppLanguage();
    const { meanings, partOfSpeech, detectedLanguage } = await fetchMeanings(
      trimmed,
      targetLanguage,
    );

    if (meanings.length === 0) {
      return { ok: false, reason: 'not-found' };
    }

    // 같은 언어면 Google 이 입력을 그대로 돌려준다. 뜻이라고 채워 넣으면 오히려 방해된다
    if (detectedLanguage === targetLanguage) {
      return { ok: false, reason: 'same-language', detectedLanguage };
    }

    const isEnglishWord = detectedLanguage === 'en';
    const examples = isEnglishWord ? await fetchEnglishExamples(trimmed, targetLanguage) : [];

    return {
      ok: true,
      data: {
        word: trimmed,
        meanings,
        examples,
        partOfSpeech,
        detectedLanguage,
        examplesUnsupported: !isEnglishWord,
      },
    };
  },
};
