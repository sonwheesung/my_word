import * as Speech from 'expo-speech';
import { speak, resetSpeechSupportCache } from '../src/utils/speech';

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
