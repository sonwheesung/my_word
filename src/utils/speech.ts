import * as Speech from 'expo-speech';
import { DEFAULT_SPEECH_LANGUAGE, detectSpeechLanguage } from './text';

/**
 * 단어 읽어주기.
 *
 * 언어를 en-US 로 고정하면 일본어·중국어·아랍어 단어에서 무음이거나 엉뚱하게 읽힌다.
 * 사용자 입장에서는 "고장난 앱"으로 보이므로, 글자에서 언어를 추정해 넘기고
 * 기기에 해당 음성이 없으면 조용히 실패하지 말고 이유를 돌려준다.
 */

const SPEECH_RATE = 0.85;

export type SpeakOutcome = 'ok' | 'unsupported' | 'error';

export interface SpeakResult {
  outcome: SpeakOutcome;
  /** 실제로 시도한 BCP-47 태그 */
  language: string;
  /** 사용자에게 보여줄 언어 이름 */
  label: string;
}

const LANGUAGE_LABEL: Readonly<Record<string, string>> = {
  'ko-KR': '한국어',
  'ja-JP': '일본어',
  'zh-CN': '중국어',
  'zh-TW': '중국어(번체)',
  'th-TH': '태국어',
  'hi-IN': '힌디어',
  'ar-SA': '아랍어',
  'he-IL': '히브리어',
  'ru-RU': '러시아어',
  'el-GR': '그리스어',
  'en-US': '영어',
};

/**
 * 엔진이 내려주는 언어 표기가 제각각이다(en-US, en_US, eng-USA …).
 * 비교는 기본 서브태그 2글자로만 한다.
 */
const PRIMARY_ALIAS: Readonly<Record<string, string>> = {
  kor: 'ko',
  jpn: 'ja',
  zho: 'zh',
  cmn: 'zh',
  chi: 'zh',
  tha: 'th',
  hin: 'hi',
  ara: 'ar',
  heb: 'he',
  rus: 'ru',
  ell: 'el',
  gre: 'el',
  eng: 'en',
};

function toPrimarySubtag(tag: string): string {
  const primary = tag.toLowerCase().replace(/_/g, '-').split('-')[0];
  return PRIMARY_ALIAS[primary] ?? primary;
}

// 기기 음성 목록은 바뀌지 않으므로 앱 실행당 1회만 조회한다
let supportedCache: Promise<Set<string>> | null = null;

function getSupportedPrimaries(): Promise<Set<string>> {
  if (!supportedCache) {
    supportedCache = Speech.getAvailableVoicesAsync()
      .then((voices) => new Set(voices.map((v) => toPrimarySubtag(v.language))))
      // 조회에 실패하면 "모른다"는 뜻의 빈 집합. 이 경우 검사를 생략하고 그냥 시도한다
      .catch(() => new Set<string>());
  }
  return supportedCache;
}

/** 테스트에서 캐시를 비우기 위한 용도 */
export function resetSpeechSupportCache(): void {
  supportedCache = null;
}

export function describeLanguage(language: string): string {
  return LANGUAGE_LABEL[language] ?? language;
}

/** `siblingHints` 가 보는 최소한의 모양. `Word` 전체를 끌어오지 않으려고 구조로 받는다 */
export interface HintSource {
  word: string;
  categoryId: number;
  examples?: ReadonlyArray<{ example: string }>;
}

/**
 * 한자 단독 표기를 가를 근거를 모은다 — **이 단어의 예문 + 같은 단어장의 다른 단어.**
 *
 * 🔴 **같은 `categoryId` 만 본다.** 옆 단어장의 중국어가 일본어 단어를 뒤집으면 지금보다
 *    나빠진다. 플래시카드처럼 덱이 단어장을 가로지를 수 있는 화면이 있어 **거르는 쪽을
 *    호출부에 맡기지 않고 여기서 한다** — 맡기면 한 화면이 빠뜨린다.
 *
 * ⚠ 가나는 한 글자만 있어도 결론이 난다. 그래서 전부 이을 필요가 없고 **상한을 둔다** —
 *   단어장이 수천 개여도 탭 한 번이 느려지지 않아야 한다.
 */
const HINT_WORD_LIMIT = 60;

export function siblingHints(
  target: HintSource,
  pool: ReadonlyArray<HintSource> = [],
): string[] {
  const out: string[] = [];
  for (const e of target.examples ?? []) out.push(e.example);
  let taken = 0;
  for (const w of pool) {
    if (taken >= HINT_WORD_LIMIT) break;
    if (w.categoryId !== target.categoryId) continue;
    if (w.word === target.word) continue;
    out.push(w.word);
    taken += 1;
  }
  return out;
}

/**
 * @param text   읽을 문장/단어
 * @param hints  한자 단독 표기의 일본어/중국어 판별 보조. `siblingHints` 로 만든다
 * @param stored 저장된 `Word.language`(뜻 찾기가 감지한 값). 없을 수 있다
 */
export async function speak(
  text: string,
  hints: string[] = [],
  stored?: string,
): Promise<SpeakResult> {
  const trimmed = text.trim();
  const language = trimmed
    ? detectSpeechLanguage(trimmed, hints, stored)
    : DEFAULT_SPEECH_LANGUAGE;
  const label = describeLanguage(language);

  if (!trimmed) return { outcome: 'error', language, label };

  try {
    const supported = await getSupportedPrimaries();
    // 집합이 비어 있으면 조회 실패다. 확인이 안 된다고 재생을 막지는 않는다
    if (supported.size > 0 && !supported.has(toPrimarySubtag(language))) {
      return { outcome: 'unsupported', language, label };
    }

    // 연속 탭으로 음성이 겹치지 않도록 이전 재생을 끊는다
    await Speech.stop();
    Speech.speak(trimmed, { language, rate: SPEECH_RATE });
    return { outcome: 'ok', language, label };
  } catch {
    return { outcome: 'error', language, label };
  }
}
