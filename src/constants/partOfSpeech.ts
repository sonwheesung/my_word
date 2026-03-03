// 영어 품사 → 한국어 품사 매핑
const partOfSpeechMap: Record<string, string> = {
  noun: '명사',
  verb: '동사',
  adjective: '형용사',
  adverb: '부사',
  pronoun: '대명사',
  preposition: '전치사',
  conjunction: '접속사',
  interjection: '감탄사',
  determiner: '한정사',
  exclamation: '감탄사',
  article: '관사',
  particle: '조사',
  abbreviation: '약어',
  phrase: '구',
};

export function toKoreanPOS(englishPOS: string): string {
  const key = englishPOS.toLowerCase().trim();
  return partOfSpeechMap[key] || englishPOS;
}
