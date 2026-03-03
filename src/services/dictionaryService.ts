import { toKoreanPOS } from '../constants/partOfSpeech';

export interface DictionaryResult {
  word: string;
  meanings: string[];
  examples: { example: string; translation: string }[];
  partOfSpeech: string[];
}

// Google Translate 무료 엔드포인트로 한국어 뜻 가져오기 (dt=bd: 사전 모드)
async function fetchKoreanMeanings(word: string): Promise<{ meanings: string[]; partOfSpeech: string[] }> {
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=ko&dt=bd&dt=t&q=${encodeURIComponent(word)}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error('번역 요청에 실패했습니다');
  }

  const data = await response.json();

  const meanings: string[] = [];
  const partOfSpeech: string[] = [];

  // data[1] = 사전 항목 (품사별 한국어 뜻 배열)
  if (data[1] && Array.isArray(data[1])) {
    for (const entry of data[1]) {
      const pos = entry[0] as string;
      const translations = entry[1] as string[];
      const koreanPOS = toKoreanPOS(pos);
      if (!partOfSpeech.includes(koreanPOS)) {
        partOfSpeech.push(koreanPOS);
      }
      for (const t of translations) {
        if (meanings.length < 5 && !meanings.includes(t)) {
          meanings.push(t);
        }
      }
    }
  }

  // 사전 항목이 없으면 기본 번역 사용
  if (meanings.length === 0 && data[0] && data[0][0] && data[0][0][0]) {
    meanings.push(data[0][0][0]);
  }

  return { meanings, partOfSpeech };
}

// Google Translate로 영어 → 한국어 번역
async function translateToKorean(text: string): Promise<string> {
  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=ko&dt=t&q=${encodeURIComponent(text)}`;
    const response = await fetch(url);
    if (!response.ok) return '';
    const data = await response.json();
    return data[0].map((s: any[]) => s[0]).join('');
  } catch {
    return '';
  }
}

// Free Dictionary API로 영어 예문 가져오기 + 한국어 번역
async function fetchExamples(word: string): Promise<{ example: string; translation: string }[]> {
  const response = await fetch(
    `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`
  );

  if (!response.ok) {
    return [];
  }

  const data = await response.json();
  const englishExamples: string[] = [];

  for (const entry of data) {
    for (const meaning of entry.meanings) {
      for (const definition of meaning.definitions) {
        if (definition.example && englishExamples.length < 3) {
          englishExamples.push(definition.example);
        }
      }
    }
  }

  if (englishExamples.length === 0) return [];

  // 예문들을 병렬로 번역
  const translations = await Promise.all(
    englishExamples.map(ex => translateToKorean(ex))
  );

  return englishExamples.map((ex, i) => ({
    example: ex,
    translation: translations[i],
  }));
}

export const dictionaryService = {
  async lookup(word: string): Promise<DictionaryResult | null> {
    const trimmed = word.trim().toLowerCase();
    if (!trimmed) return null;

    // 한국어 뜻 + 영어 예문을 병렬로 가져오기
    const [koreanResult, examples] = await Promise.all([
      fetchKoreanMeanings(trimmed),
      fetchExamples(trimmed),
    ]);

    if (koreanResult.meanings.length === 0) {
      return null;
    }

    return {
      word: trimmed,
      meanings: koreanResult.meanings,
      examples,
      partOfSpeech: koreanResult.partOfSpeech,
    };
  },
};
