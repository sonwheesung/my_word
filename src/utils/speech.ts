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

/**
 * @param text  읽을 문장/단어
 * @param hints 같은 단어의 예문 등 (한자 단독 표기의 일본어/중국어 판별 보조)
 */
export async function speak(text: string, hints: string[] = []): Promise<SpeakResult> {
  const trimmed = text.trim();
  const language = trimmed ? detectSpeechLanguage(trimmed, hints) : DEFAULT_SPEECH_LANGUAGE;
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
