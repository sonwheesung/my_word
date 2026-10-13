/**
 * 다국어 텍스트 취급 유틸.
 *
 * 이 앱은 사용자가 어떤 언어의 단어든 저장할 수 있어야 하므로,
 * 문자열을 비교하거나 소리내어 읽을 때 특정 언어를 전제하지 않는다.
 */

// --- 유니코드 정규화 ---

/**
 * 문자열 비교 전용 정규화.
 *
 * 눈에 같아 보이는 글자도 유니코드 표현이 둘일 수 있다(NFC 완성형 / NFD 조합형).
 * '학습' 은 NFC 로 2자, NFD 로 6자이고 `===` 비교에서는 서로 다른 문자열이다.
 * macOS 에서 만든 CSV, 일부 서드파티 IME 가 NFD 를 내보내므로 실제로 부딪힌다.
 *
 * **저장된 데이터는 건드리지 않는다.** 비교하는 쪽에서만 양쪽을 같은 형태로 맞춘다.
 * 운영 중인 앱에서 기존 데이터를 일괄 변환하면 되돌릴 방법이 없기 때문이다.
 */
export function normalizeForCompare(value: string): string {
  return value.trim().toLowerCase().normalize('NFC');
}

// --- 스크립트 기반 언어 추정 ---

/** 스크립트를 판별하지 못했을 때 쓰는 기본 언어 */
export const DEFAULT_SPEECH_LANGUAGE = 'en-US';

type Script =
  | 'kana'
  | 'bopomofo'
  | 'hangul'
  | 'han'
  | 'thai'
  | 'devanagari'
  | 'arabic'
  | 'hebrew'
  | 'cyrillic'
  | 'greek'
  | 'latin';

/** [스크립트, 코드포인트 시작, 끝] — 앞에서부터 먼저 맞는 것을 채택한다 */
const SCRIPT_RANGES: ReadonlyArray<readonly [Script, number, number]> = [
  ['kana', 0x3040, 0x30ff], // 히라가나 + 가타카나 + 장음부호
  ['kana', 0xff66, 0xff9d], // 반각 가타카나
  ['bopomofo', 0x3100, 0x312f],
  ['hangul', 0x1100, 0x11ff],
  ['hangul', 0x3130, 0x318f],
  ['hangul', 0xac00, 0xd7a3],
  ['han', 0x3400, 0x4dbf],
  ['han', 0x4e00, 0x9fff],
  ['han', 0xf900, 0xfaff],
  ['han', 0x20000, 0x2a6df],
  ['thai', 0x0e00, 0x0e7f],
  ['devanagari', 0x0900, 0x097f],
  ['arabic', 0x0600, 0x06ff],
  ['arabic', 0x0750, 0x077f],
  ['arabic', 0xfb50, 0xfdff],
  ['arabic', 0xfe70, 0xfeff],
  ['hebrew', 0x0590, 0x05ff],
  ['cyrillic', 0x0400, 0x04ff],
  ['greek', 0x0370, 0x03ff],
  ['greek', 0x1f00, 0x1fff],
  ['latin', 0x0041, 0x005a],
  ['latin', 0x0061, 0x007a],
  ['latin', 0x00c0, 0x024f], // 라틴 확장 A/B (é, ß, ā, ő …)
];

/**
 * 판정 우선순위. 한 단어에 여러 스크립트가 섞였을 때 위쪽이 이긴다.
 *
 * 가나가 한 글자라도 있으면 한자가 섞여 있어도 일본어다(일본어는 조사·활용이 가나라
 * 사실상 반드시 섞인다). 반대로 한자만 있으면 일본어인지 중국어인지 원리적으로
 * 구분할 수 없어 중국어로 둔다 — 아래 detectSpeechLanguage 의 힌트로 보완한다.
 */
const SCRIPT_PRIORITY: ReadonlyArray<readonly [Script, string]> = [
  ['kana', 'ja-JP'],
  ['bopomofo', 'zh-TW'],
  ['hangul', 'ko-KR'],
  ['han', 'zh-CN'],
  ['thai', 'th-TH'],
  ['devanagari', 'hi-IN'],
  ['arabic', 'ar-SA'],
  ['hebrew', 'he-IL'],
  ['cyrillic', 'ru-RU'],
  ['greek', 'el-GR'],
  ['latin', DEFAULT_SPEECH_LANGUAGE],
];

function collectScripts(text: string): Set<Script> {
  const found = new Set<Script>();
  // for...of 는 코드포인트 단위로 순회한다(서로게이트 쌍을 쪼개지 않음)
  for (const char of text) {
    const code = char.codePointAt(0);
    if (code === undefined) continue;
    for (const [script, start, end] of SCRIPT_RANGES) {
      if (code >= start && code <= end) {
        found.add(script);
        break;
      }
    }
  }
  return found;
}

/** 저장된 `language`(`ja` · `zh` …)를 읽을 수 있는 BCP-47 태그로 편다 */
const STORED_TO_TAG: Readonly<Record<string, string>> = {
  ja: 'ja-JP',
  ko: 'ko-KR',
  zh: 'zh-CN',
  'zh-tw': 'zh-TW',
  en: DEFAULT_SPEECH_LANGUAGE,
  th: 'th-TH',
  hi: 'hi-IN',
  ar: 'ar-SA',
  he: 'he-IL',
  ru: 'ru-RU',
  el: 'el-GR',
};

export function storedLanguageToTag(stored: string | undefined): string | null {
  if (typeof stored !== 'string') return null;
  const key = stored.trim().toLowerCase().replace(/_/g, '-');
  if (key === '') return null;
  return STORED_TO_TAG[key] ?? STORED_TO_TAG[key.split('-')[0] ?? ''] ?? null;
}

/**
 * 단어를 어떤 언어로 읽어야 하는지 정해 BCP-47 태그로 돌려준다.
 *
 * ```
 * ① 글자가 말해 주면 그걸 쓴다        가나 · 한글 · 주음 · 라틴 …
 * ② 한자뿐이면 힌트를 본다            같은 단어장의 다른 단어 · 이 단어의 예문
 * ③ 그래도 모르면 저장된 language     뜻 찾기가 감지해 둔 값
 * ④ 그것도 없으면 zh-CN               한자의 다수파
 * ```
 *
 * 🔴 **②를 넓힌 것이 2026-10-13 수정의 핵심이다.** 그 전에는 힌트가 「이 단어의 예문」
 *    뿐이었고, 예문 없는 한자 단어(`水`)는 근거가 0이라 **④로 떨어져 중국어로 읽혔다.**
 *    사장님 폰에서 `水`(물)가 「shuǐ」로 발음되는 것을 실제로 들었다(`zho-CHN` 합성 요청).
 *    같은 단어장에 `食べる`·`飲む`·`行く` 가 있으면 가나가 있으므로 ②에서 끝난다.
 *
 * ⚠ **원리적으로 못 푸는 경우는 여전히 남는다** — 한자 단어 하나만 든 단어장. 그때 ③이
 *   받아 준다. 셋 다 비면 ④는 틀릴 수 있고, 그건 글자만으로는 풀 수 없는 문제다.
 *
 * 🚫 **`ExamPrefs.languageByCategory` 를 쓰지 않았다.** AI 시험 설정에서 사용자가 직접 고른
 *    카테고리별 언어라 가장 강한 근거처럼 보이지만, 그 값은 **백업에 일부러 안 담기는
 *    기기별 선택**이다(`data-model.md`). 그걸 발음에 쓰면 **복원한 기기에서 같은 단어가
 *    다르게 발음된다** — 소리가 기기마다 달라지는 것은 지금 흠보다 나쁘다.
 *    그리고 "AI 시험을 한 번 쓰면 발음이 바뀐다"는 사용자가 이어 붙일 수 없는 인과다.
 *
 * @param hints 같은 단어장의 다른 단어 · 이 단어의 예문. 🔴 **다른 단어장을 섞지 마라** —
 *              옆 단어장의 중국어가 일본어 단어를 뒤집는다.
 * @param stored 저장된 `Word.language`. 없을 수 있다(손으로 넣은 단어).
 */
export function detectSpeechLanguage(
  text: string,
  hints: string[] = [],
  stored?: string,
): string {
  const scripts = collectScripts(text);
  if (scripts.size === 0) return storedLanguageToTag(stored) ?? DEFAULT_SPEECH_LANGUAGE;

  // 한자뿐이라 판별이 안 되는 경우에만 힌트와 저장값을 본다.
  // 일본어 글에는 조사가 있어 가나가 거의 확실히 나온다.
  const hanOnly =
    scripts.has('han') && !scripts.has('kana') && !scripts.has('hangul') && !scripts.has('bopomofo');
  if (hanOnly) {
    if (hints.length > 0) {
      const hintScripts = collectScripts(hints.join(' '));
      if (hintScripts.has('kana')) return 'ja-JP';
      if (hintScripts.has('bopomofo')) return 'zh-TW';
    }
    const fromStored = storedLanguageToTag(stored);
    if (fromStored !== null) return fromStored;
  }

  for (const [script, language] of SCRIPT_PRIORITY) {
    if (scripts.has(script)) return language;
  }
  return DEFAULT_SPEECH_LANGUAGE;
}
