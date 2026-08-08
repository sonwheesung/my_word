import { normalizeForCompare, detectSpeechLanguage, DEFAULT_SPEECH_LANGUAGE } from '../src/utils/text';
import { shareService } from '../src/services/shareService';
import type { Word } from '../src/types/word';

// --- 유니코드 정규화 ---

describe('normalizeForCompare', () => {
  it('조합형(NFD)과 완성형(NFC)을 같게 취급한다', () => {
    const cases = ['학습', 'tiếng', 'café', 'が', 'ñ', 'ㅎㅏㄴ'];
    for (const s of cases) {
      expect(normalizeForCompare(s.normalize('NFD'))).toBe(normalizeForCompare(s.normalize('NFC')));
    }
  });

  it('앞뒤 공백과 대소문자 차이를 흡수한다', () => {
    expect(normalizeForCompare('  Apple ')).toBe(normalizeForCompare('apple'));
    expect(normalizeForCompare('Apfel')).toBe(normalizeForCompare('APFEL'));
  });

  it('대소문자가 없는 문자는 그대로 둔다', () => {
    for (const s of ['猫', 'كتاب', 'หนังสือ', 'किताब', '👨‍👩‍👧']) {
      expect(normalizeForCompare(s)).toBe(s);
    }
  });

  it('서로 다른 단어를 같게 만들지 않는다', () => {
    expect(normalizeForCompare('猫')).not.toBe(normalizeForCompare('犬'));
    expect(normalizeForCompare('学习')).not.toBe(normalizeForCompare('學習'));
    expect(normalizeForCompare('book')).not.toBe(normalizeForCompare('books'));
  });
});

// --- 스크립트 기반 언어 추정 ---

describe('detectSpeechLanguage', () => {
  it.each([
    ['ねこ', 'ja-JP'],
    ['猫が好き', 'ja-JP'],
    ['テスト', 'ja-JP'],
    ['学习', 'zh-CN'],
    ['ㄅㄆㄇ', 'zh-TW'],
    ['한국어', 'ko-KR'],
    ['หนังสือ', 'th-TH'],
    ['किताब', 'hi-IN'],
    ['كِتَاب', 'ar-SA'],
    ['סֵפֶר', 'he-IL'],
    ['книга', 'ru-RU'],
    ['βιβλίο', 'el-GR'],
    ['Apfel', 'en-US'],
    ['résumé', 'en-US'],
  ])('%s → %s', (text, expected) => {
    expect(detectSpeechLanguage(text)).toBe(expected);
  });

  it('가나가 섞이면 한자가 있어도 일본어로 본다', () => {
    expect(detectSpeechLanguage('食べる')).toBe('ja-JP');
    expect(detectSpeechLanguage('日本語')).toBe('zh-CN'); // 한자뿐이면 구분 불가
  });

  it('한자뿐인 단어는 예문에 가나가 있으면 일본어로 보정된다', () => {
    expect(detectSpeechLanguage('猫')).toBe('zh-CN');
    expect(detectSpeechLanguage('猫', ['猫が窓の外を見ている。'])).toBe('ja-JP');
    expect(detectSpeechLanguage('猫', ['我喜欢猫。'])).toBe('zh-CN');
  });

  it('예문 힌트는 한자뿐인 경우에만 쓴다', () => {
    // 이미 판별된 단어가 예문 때문에 뒤집히면 안 된다
    expect(detectSpeechLanguage('책', ['これは本です。'])).toBe('ko-KR');
    expect(detectSpeechLanguage('book', ['これは本です。'])).toBe('en-US');
  });

  it('판별할 문자가 없으면 기본값을 쓴다', () => {
    for (const s of ['', '123', '!!!', '👨‍👩‍👧', '   ']) {
      expect(detectSpeechLanguage(s)).toBe(DEFAULT_SPEECH_LANGUAGE);
    }
  });

  it('서로게이트 쌍을 쪼개다가 오판하지 않는다', () => {
    expect(detectSpeechLanguage('🎌ねこ')).toBe('ja-JP');
    expect(detectSpeechLanguage('𠀋')).toBe('zh-CN'); // CJK 확장 B (U+2000B)
  });
});

// --- CSV 다국어 라운드트립 ---

const SAMPLES = [
  { label: '일본어', word: '猫', meaning: '고양이', example: '猫が窓の外を見ている。', memo: 'ねこ / ネコ' },
  { label: '중국어(간)', word: '学习', meaning: '학습하다', example: '我每天学习中文，很有意思。', memo: 'xuéxí' },
  { label: '중국어(번)', word: '學習', meaning: '학습하다', example: '我每天學習中文。', memo: '' },
  { label: '아랍어', word: 'كِتَاب', meaning: '책', example: 'هٰذَا كِتَابٌ جَدِيدٌ.', memo: 'RTL' },
  { label: '히브리어', word: 'סֵפֶר', meaning: '책', example: 'זֶה סֵפֶר חָדָשׁ.', memo: '' },
  { label: '태국어', word: 'หนังสือ', meaning: '책', example: 'ฉันอ่านหนังสือทุกวัน', memo: '띄어쓰기 없음' },
  { label: '힌디어', word: 'किताब', meaning: '책', example: 'यह एक नई किताब है।', memo: '' },
  { label: '러시아어', word: 'книга', meaning: '책', example: 'Это новая книга.', memo: '' },
  { label: '그리스어', word: 'βιβλίο', meaning: '책', example: 'Αυτό είναι ένα βιβλίο.', memo: '' },
  { label: '독일어', word: 'Apfel', meaning: '사과', example: 'Der Apfel ist rot.', memo: 'Straße' },
  { label: '베트남어', word: 'tiếng Việt', meaning: '베트남어', example: 'Tôi học tiếng Việt.', memo: '' },
  { label: '이모지', word: '👨‍👩‍👧', meaning: '가족', example: 'A 👨‍👩‍👧 emoji.', memo: '🇰🇷🇯🇵' },
  { label: '구분자 충돌', word: 'テスト,「引用」', meaning: '테스트 겸 시험', example: '行1\n行2::번역', memo: '따옴표 " 포함' },
];

function toWord(s: (typeof SAMPLES)[number], id: number): Word {
  return {
    wordId: id,
    categoryId: 1,
    word: s.word,
    meanings: [s.meaning],
    examples: [{ example: s.example, translation: '번역' }],
    tags: [s.label],
    memo: s.memo,
    createdAt: '2026-08-08T00:00:00.000Z',
    updatedAt: '2026-08-08T00:00:00.000Z',
  } as Word;
}

describe('다국어 CSV 라운드트립', () => {
  const csv = shareService.exportWordsToCSV(SAMPLES.map(toWord));
  const parsed = shareService.parseCSV(csv);

  it('에러 없이 전부 파싱된다', () => {
    expect(parsed.errors).toEqual([]);
    expect(parsed.success).toHaveLength(SAMPLES.length);
  });

  it.each(SAMPLES.map((s, i) => [s.label, i] as const))('%s 필드가 보존된다', (_label, i) => {
    const s = SAMPLES[i];
    const p = parsed.success[i];
    expect(p.word).toBe(s.word);
    expect(p.meanings[0]).toBe(s.meaning);
    expect(p.memo).toBe(s.memo);
    expect(p.tags).toEqual([s.label]);
  });

  it("'|' 는 다국어 본문에서도 뜻 구분자로 동작한다 (포맷 규약)", () => {
    const round = shareService.parseCSV(
      shareService.exportWordsToCSV([
        { ...toWord(SAMPLES[0], 99), meanings: ['고양이', '猫科の動物'] },
      ]),
    );
    expect(round.success[0].meanings).toEqual(['고양이', '猫科の動物']);
  });

  it('대소문자를 가공하지 않는다 (독일어 명사 보존)', () => {
    const german = parsed.success[SAMPLES.findIndex((s) => s.label === '독일어')];
    expect(german.word).toBe('Apfel');
    expect(german.examples[0].example).toBe('Der Apfel ist rot.');
  });
});
