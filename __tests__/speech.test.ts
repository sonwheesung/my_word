import * as Speech from 'expo-speech';
import { speak, resetSpeechSupportCache, siblingHints, type HintSource } from '../src/utils/speech';

jest.mock('expo-speech', () => ({
  speak: jest.fn(),
  stop: jest.fn().mockResolvedValue(undefined),
  getAvailableVoicesAsync: jest.fn(),
}));

const mockedSpeech = Speech as jest.Mocked<typeof Speech>;

function withVoices(languages: string[]) {
  mockedSpeech.getAvailableVoicesAsync.mockResolvedValue(
    languages.map((language, i) => ({
      identifier: `v${i}`,
      name: `voice-${i}`,
      quality: 'Default',
      language,
    })) as never,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedSpeech.stop.mockResolvedValue(undefined);
  resetSpeechSupportCache();
});

describe('speak', () => {
  it('감지한 언어로 읽는다', async () => {
    withVoices(['en-US', 'ja-JP', 'ko-KR']);

    const result = await speak('ねこ');

    expect(result.outcome).toBe('ok');
    expect(result.language).toBe('ja-JP');
    expect(mockedSpeech.speak).toHaveBeenCalledWith('ねこ', expect.objectContaining({ language: 'ja-JP' }));
  });

  it('기기에 해당 음성이 없으면 재생하지 않고 이유를 돌려준다', async () => {
    withVoices(['en-US', 'ko-KR']);

    const result = await speak('ねこ');

    expect(result.outcome).toBe('unsupported');
    expect(result.label).toBe('일본어');
    expect(mockedSpeech.speak).not.toHaveBeenCalled();
  });

  it('3글자 언어 코드(jpn)도 지원으로 인식한다', async () => {
    withVoices(['eng-USA', 'jpn-JPN']);

    const result = await speak('ねこ');

    expect(result.outcome).toBe('ok');
    expect(mockedSpeech.speak).toHaveBeenCalled();
  });

  it('밑줄 구분자(en_US)도 인식한다', async () => {
    withVoices(['en_US']);

    expect((await speak('apple')).outcome).toBe('ok');
  });

  it('음성 목록 조회에 실패하면 막지 않고 그냥 시도한다', async () => {
    mockedSpeech.getAvailableVoicesAsync.mockRejectedValue(new Error('unavailable'));

    const result = await speak('ねこ');

    expect(result.outcome).toBe('ok');
    expect(mockedSpeech.speak).toHaveBeenCalled();
  });

  it('빈 문자열은 재생하지 않는다', async () => {
    withVoices(['en-US']);

    expect((await speak('   ')).outcome).toBe('error');
    expect(mockedSpeech.speak).not.toHaveBeenCalled();
  });

  it('겹쳐 재생되지 않도록 이전 음성을 멈춘다', async () => {
    withVoices(['en-US']);

    await speak('apple');

    expect(mockedSpeech.stop).toHaveBeenCalled();
  });

  it('음성 목록은 앱 실행당 1회만 조회한다', async () => {
    withVoices(['en-US']);

    await speak('apple');
    await speak('banana');
    await speak('cherry');

    expect(mockedSpeech.getAvailableVoicesAsync).toHaveBeenCalledTimes(1);
  });

  it('예문 힌트가 한자 단독 단어의 언어를 바꾼다', async () => {
    withVoices(['ja-JP', 'zh-CN']);

    expect((await speak('猫')).language).toBe('zh-CN');
    expect((await speak('猫', ['猫が窓の外を見ている。'])).language).toBe('ja-JP');
  });
});

// ── 🔴 2026-10-13: 사장님 폰에서 `水`(물)가 중국어로 읽혔다 ──────────────────────
//
// 실측 로그: `GoogleTTSServiceImpl: Synthesis request for locale zho-CHN`.
// 예문이 없는 한자 단어라 힌트가 0이었고, 글자만으로는 日/中 을 가를 수 없어 ④(zh-CN)로
// 떨어졌다. 같은 단어장에 `食べる`·`飲む`·`行く` 가 있었는데 **보지 않고 있었다.**

describe('🔴 한자 단독 표기 — 같은 단어장의 다른 단어가 근거가 된다', () => {
  const JA_DECK: HintSource[] = [
    { word: '水', categoryId: 99 },
    { word: '山', categoryId: 99 },
    { word: '食べる', categoryId: 99 },
    { word: '飲む', categoryId: 99 },
  ];

  it('⚠ 고치기 전의 모양 — 근거가 없으면 중국어로 읽는다(종전 그대로)', async () => {
    withVoices(['en-US', 'ja-JP', 'zh-CN']);
    const result = await speak('水');
    expect(result.language).toBe('zh-CN');
  });

  it('🔴 같은 단어장에 가나가 있으면 일본어로 읽는다', async () => {
    withVoices(['en-US', 'ja-JP', 'zh-CN']);
    const target = JA_DECK[0] as HintSource;
    const result = await speak('水', siblingHints(target, JA_DECK));
    expect(result.language).toBe('ja-JP');
  });

  it('🔴 다른 단어장은 섞지 않는다 — 옆 단어장의 가나가 중국어 단어를 뒤집으면 더 나쁘다', () => {
    const target: HintSource = { word: '水', categoryId: 1 };
    const pool: HintSource[] = [
      { word: '食べる', categoryId: 2 }, // 다른 단어장
      { word: '山', categoryId: 1 },
    ];
    expect(siblingHints(target, pool)).toEqual(['山']);
  });

  it('자기 자신은 근거에 넣지 않는다', () => {
    const target: HintSource = { word: '水', categoryId: 1 };
    expect(siblingHints(target, [target])).toEqual([]);
  });

  it('이 단어의 예문이 먼저 온다 — 가장 가까운 근거다', () => {
    const target: HintSource = {
      word: '水',
      categoryId: 1,
      examples: [{ example: '水を飲む' }],
    };
    expect(siblingHints(target, [{ word: '山', categoryId: 1 }])).toEqual(['水を飲む', '山']);
  });

  it('⚠ 단어장이 커도 탭이 느려지지 않도록 상한이 있다', () => {
    const pool: HintSource[] = Array.from({ length: 500 }, (_, i) => ({
      word: `w${i}`,
      categoryId: 1,
    }));
    const hints = siblingHints({ word: '水', categoryId: 1 }, pool);
    expect(hints.length).toBeLessThanOrEqual(60);
    expect(hints.length).toBeGreaterThan(0);
  });

  it('🔴 저장된 language 가 받아 준다 — 한자 단어 하나뿐인 단어장', async () => {
    withVoices(['en-US', 'ja-JP', 'zh-CN']);
    const result = await speak('水', [], 'ja');
    expect(result.language).toBe('ja-JP');
  });

  it('가나가 있으면 저장된 language 를 무시한다 — 글자가 더 강한 증거다', async () => {
    withVoices(['en-US', 'ja-JP', 'zh-CN']);
    const result = await speak('ねこ', [], 'zh');
    expect(result.language).toBe('ja-JP');
  });

  it('저장값이 비어 있거나 모르는 값이면 종전대로 추정한다', async () => {
    withVoices(['en-US', 'ja-JP', 'zh-CN']);
    expect((await speak('水', [], '')).language).toBe('zh-CN');
    expect((await speak('水', [], '   ')).language).toBe('zh-CN');
    expect((await speak('水', [], 'klingon')).language).toBe('zh-CN');
  });
});

// ── 🔴 소스를 훑어 "주는 곳"을 센다 ─────────────────────────────────────────────
//
// 2026-10-13 의 원인은 기능이 없어서가 아니었다. `Word.language` 는 타입·SQLite·서버·복구에
// 전부 있었고 **주는 곳만 없었다.** 그날 하루에 같은 모양을 다섯 번 만났다.
// → **「칸이 있다」가 아니라 「그 칸에 값이 들어간다」를 본다.**

declare const require: (id: string) => any;
declare const __dirname: string;
const fs = require('fs') as { readFileSync(p: string, enc: string): string };
const path = require('path') as { join(...parts: string[]): string };
const read = (rel: string): string => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
const squash = (src: string): string =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n]*/g, ' ')
    .replace(/\s+/g, '');

const SPEAKING_SCREENS = [
  ['src/screens/ManageWordsScreen.tsx', 'words'],
  ['src/screens/FlashcardScreen.tsx', 'cards'],
  ['src/screens/QuizScreen.tsx', 'allWords'],
] as const;

describe('🔴 판별 근거가 실제로 넘어간다 (소스 훑기)', () => {
  it('⚠ 가드가 실제로 읽었다 — 빈 파일을 지키며 초록이 되지 않는다', () => {
    for (const [rel] of SPEAKING_SCREENS) {
      expect(read(rel).length).toBeGreaterThan(3000);
      expect(read(rel)).toContain('speak(');
    }
  });

  it('🔴 읽어 주는 화면 셋이 전부 siblingHints 를 넘긴다', () => {
    for (const [rel, pool] of SPEAKING_SCREENS) {
      const src = squash(read(rel));
      expect(src).toContain(`siblingHints(`);
      expect(src).toContain(`,${pool})`);
    }
  });

  it('🚫 예문만 넘기던 옛 모양이 남아 있지 않다', () => {
    /*
     * `speak(x,(word.examples??[]).map(...))` 가 한 곳이라도 남으면 그 화면의 한자 단어는
     * 계속 중국어로 읽힌다. 셋 중 하나만 고치고 끝내기 쉬운 자리라 기계로 본다.
     */
    for (const [rel] of SPEAKING_SCREENS) {
      expect(squash(read(rel))).not.toContain('examples??[]).map((e)=>e.example))');
    }
  });

  it('🔴 낡은 클로저를 막는다 — 목록이 의존성에 들어 있다', () => {
    /*
     * `words` 가 빠지면 단어장을 바꿔도 **이전 단어장**으로 판별한다. 화면은 멀쩡해 보이고
     * 소리만 틀린다 — 눈으로는 영영 안 잡힌다.
     */
    for (const [rel, pool] of [SPEAKING_SCREENS[0], SPEAKING_SCREENS[1]] as const) {
      const src = squash(read(rel));
      const at = src.indexOf('siblingHints(');
      expect(at).toBeGreaterThan(0);
      /*
       * ⚠ 정규식을 쓰지 않는다. 여기를 정규식으로 썼다가 백슬래시가 반으로 줄어
       *   경계 표시가 **백스페이스 문자**가 되는 바람에 가드가 먼저 빨개졌다(2026-10-13).
       *   문자열 자르기로만 판정하면 그 종류의 사고가 아예 생기지 않는다.
       */
      const after = src.slice(at);
      const open = after.indexOf('},[');
      expect(open).toBeGreaterThan(0);
      const deps = after.slice(open + 3, after.indexOf(']', open));
      expect(deps.split(',')).toContain(pool);
    }
  });

  it('🔴 뜻 찾기가 감지한 언어가 실제로 저장된다 — 칸만 있고 주는 곳이 없던 것이 원인이었다', () => {
    const src = squash(read('src/screens/AddWordScreen.tsx'));
    expect(src).toContain('setDetectedLanguage(result.detectedLanguage)');
    // 넣을 때와 고칠 때 **둘 다** 넘긴다
    expect(src.split('language:detectedLanguage').length - 1).toBe(2);
    // 수정 모드에서 다시 찾지 않으면 원래 값이 남는다
    expect(src).toContain('setDetectedLanguage(wordData.language)');
    // 🔴 연달아 넣을 때 앞 단어의 언어를 물려받지 않는다
    expect(src).toContain('setDetectedLanguage(undefined)');
  });

  it('🔴 다른 단어장을 섞지 않는 줄이 코드에 있다', () => {
    expect(squash(read('src/utils/speech.ts'))).toContain(
      'if(w.categoryId!==target.categoryId)continue',
    );
  });
});
