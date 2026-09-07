/**
 * 번역 파일이 **실제로 쓸 수 있는 상태인지** 검사한다.
 *
 * 🔴 i18next 는 없는 키를 **오류 없이 키 그대로 출력한다**(`fallbackLng: false`).
 *    이 앱에서 키는 한국어 원문이므로, 번역이 빠지면 일본어 화면에 **한국어가 그대로 뜬다.**
 *    타입 체크도 lint 도 이것을 못 잡는다 — 그래서 여기서 잡는다.
 *
 * 언어를 추가하면 `LOCALES` 에 한 줄만 더한다. 검사는 그대로 적용된다.
 */

import en from '../src/i18n/locales/en.json';
import ja from '../src/i18n/locales/ja.json';
import { SUPPORTED_LANGUAGES } from '../src/i18n/language';

type Dict = Record<string, string>;

/** ko 는 키가 곧 원문이라 번역 파일이 없다(그래서 여기 없다) */
const LOCALES: ReadonlyArray<[string, Dict]> = [
  ['en', en as Dict],
  ['ja', ja as Dict],
];

/** `_comment` 는 사람이 읽는 메모라 검사 대상이 아니다 */
const keysOf = (d: Dict) => Object.keys(d).filter((k) => k !== '_comment');

const placeholders = (s: string) => [...new Set(s.match(/\{\{\w+\}\}/g) ?? [])].sort();

const BASE = keysOf(en as Dict);

describe('번역 파일 커버리지', () => {
  it('지원 언어와 번역 파일이 짝이 맞는다', () => {
    // ko 는 키가 원문이므로 파일이 없다. 나머지는 전부 파일이 있어야 한다.
    const needFiles = SUPPORTED_LANGUAGES.filter((l) => l !== 'ko');
    expect(LOCALES.map(([code]) => code).sort()).toEqual([...needFiles].sort());
  });

  it.each(LOCALES)('%s — en 의 모든 키를 담고 있다', (code, dict) => {
    const missing = BASE.filter((k) => !(k in dict));
    // 빠진 키는 화면에 한국어로 뜬다. 개수가 아니라 이름을 보여 줘야 고칠 수 있다.
    expect({ locale: code, missing }).toEqual({ locale: code, missing: [] });
  });

  it.each(LOCALES)('%s — en 에 없는 키를 갖고 있지 않다(죽은 번역)', (code, dict) => {
    const extra = keysOf(dict).filter((k) => !BASE.includes(k));
    expect({ locale: code, extra }).toEqual({ locale: code, extra: [] });
  });

  it.each(LOCALES)('%s — 보간 자리표시자가 원문과 같다', (code, dict) => {
    // 🔴 `{{count}}` 를 빠뜨리면 숫자가 사라지고, 이름을 바꾸면 화면에 `{{count}}` 가 그대로 뜬다.
    const mismatched = keysOf(dict)
      .filter((k) => placeholders(k).join() !== placeholders(dict[k]).join())
      .map((k) => ({ key: k, expected: placeholders(k), got: placeholders(dict[k]) }));
    expect({ locale: code, mismatched }).toEqual({ locale: code, mismatched: [] });
  });

  it.each(LOCALES)('%s — 빈 번역이 없다', (code, dict) => {
    const empty = keysOf(dict).filter((k) => dict[k].trim() === '');
    expect({ locale: code, empty }).toEqual({ locale: code, empty: [] });
  });
});

describe('🔴 복수형 — 언어마다 필요한 접미사가 다르다', () => {
  it.each(LOCALES)('%s — 그 언어가 쓰는 복수형 카테고리를 모두 갖고 있다', (code, dict) => {
    // Intl 이 말하는 것이 진실이다. 일본어는 `other` 하나뿐이고 영어는 `one`·`other` 둘이다.
    // 필요한 접미사가 없으면 i18next 가 키(=한국어)를 그대로 내보낸다.
    const categories = new Intl.PluralRules(code).resolvedOptions().pluralCategories;

    // 어떤 키가 복수형인지는 en 기준으로 안다(`_one` 또는 `_other` 로 끝난다)
    const stems = [
      ...new Set(
        BASE.filter((k) => /_(one|other|two|few|many|zero)$/.test(k)).map((k) =>
          k.replace(/_(one|other|two|few|many|zero)$/, ''),
        ),
      ),
    ];

    const missing: string[] = [];
    for (const stem of stems) {
      for (const cat of categories) {
        if (!(`${stem}_${cat}` in dict)) missing.push(`${stem}_${cat}`);
      }
    }
    expect({ locale: code, missing }).toEqual({ locale: code, missing: [] });
  });
});
