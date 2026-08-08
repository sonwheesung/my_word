import type { AppLanguage } from '../i18n/language';

/**
 * 품사 라벨. 사전 조회 결과가 태그로 저장되므로 사용자 언어를 따라야 한다.
 *
 * Phase B 에서 i18next 번역 파일로 옮긴다. 지금은 사전 연동만 다국어화하는 단계라
 * 라이브러리 없이 언어별 표만 둔다.
 */
const PART_OF_SPEECH: Readonly<Record<AppLanguage, Readonly<Record<string, string>>>> = {
  ko: {
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
  },
  en: {
    noun: 'noun',
    verb: 'verb',
    adjective: 'adjective',
    adverb: 'adverb',
    pronoun: 'pronoun',
    preposition: 'preposition',
    conjunction: 'conjunction',
    interjection: 'interjection',
    determiner: 'determiner',
    exclamation: 'exclamation',
    article: 'article',
    particle: 'particle',
    abbreviation: 'abbreviation',
    phrase: 'phrase',
  },
};

/** 모르는 품사는 원문 그대로 둔다 — 빈 값보다 낫다 */
export function localizePOS(englishPOS: string, language: AppLanguage): string {
  const key = englishPOS.toLowerCase().trim();
  return PART_OF_SPEECH[language]?.[key] ?? englishPOS;
}
