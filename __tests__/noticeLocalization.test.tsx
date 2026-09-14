/**
 * 공지사항 화면이 앱 언어에 맞는 공지를 고르는가(SDK 2026-09-14 localizeAnnouncement).
 *
 * 규칙 자체는 공통 서버 쪽 가드가 지킨다. 여기서 보는 것은 **이 화면이 그 함수를 앱 언어로 지나는가**다.
 * 화면이 `item.title` 을 직접 쓰는 옛 코드로 돌아가면 영어 기기에서도 한국어가 나오고, 이 테스트가 깨진다.
 */
import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { Text } from 'react-native';
import NoticeScreen from '../src/screens/NoticeScreen';

let mockLang = 'ko';
let mockAnnouncements: unknown[] = [];

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: mockLang } }),
}));

jest.mock('../src/contexts/ThemeContext', () => ({
  useTheme: () => ({
    colors: new Proxy({ isDark: false }, { get: (t: Record<string, unknown>, k: string) => (k in t ? t[k] : '#000000') }),
  }),
}));

jest.mock('../src/contexts/BootstrapContext', () => ({
  useBootstrap: () => ({
    announcements: mockAnnouncements,
    readIds: [],
    loaded: true,
    markAllNoticesRead: jest.fn(),
  }),
}));

// 헤더는 이 검사의 대상이 아니다(안전 영역 등 다른 사슬을 끌어온다).
jest.mock('../src/components/ScreenHeader', () => () => null);
jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));

const base = {
  id: 'n1',
  kind: 'update',
  pinned: false,
  startsAt: '2026-09-14T01:00:00.000Z',
  title: '한국어 제목',
  body: '한국어 본문',
};

async function renderedTexts(lang: string, item: Record<string, unknown>): Promise<string[]> {
  mockLang = lang;
  mockAnnouncements = [item];
  let tree: ReactTestRenderer.ReactTestRenderer | undefined;
  await ReactTestRenderer.act(async () => {
    tree = ReactTestRenderer.create(<NoticeScreen onBack={() => undefined} />);
  });
  const texts = tree!.root.findAllByType(Text).map((n) => String(n.props.children));
  await ReactTestRenderer.act(async () => {
    tree!.unmount();
  });
  return texts;
}

describe('공지사항 화면의 언어 선택', () => {
  const both = { ...base, titleEn: 'English title', bodyEn: 'English body' };

  test('한국어 앱은 영어 본문이 있어도 한국어를 보여 준다', async () => {
    const texts = await renderedTexts('ko', both);
    expect(texts).toEqual(expect.arrayContaining(['한국어 제목', '한국어 본문']));
    expect(texts).not.toContain('English title');
  });

  test('영어 앱은 영어 제목과 본문이 둘 다 있으면 영어를 보여 준다', async () => {
    const texts = await renderedTexts('en', both);
    expect(texts).toEqual(expect.arrayContaining(['English title', 'English body']));
    expect(texts).not.toContain('한국어 제목');
  });

  test('영어 제목만 있고 본문이 비면 한국어로 둔다(제목만 영어인 공지를 막는다)', async () => {
    const texts = await renderedTexts('en', { ...base, titleEn: 'English title', bodyEn: '' });
    expect(texts).toEqual(expect.arrayContaining(['한국어 제목', '한국어 본문']));
    expect(texts).not.toContain('English title');
  });

  // 2026-09-14 사용자 결정: 일본어 공지는 없으므로 일본어 앱은 한국어보다 영어를 본다.
  test('일본어 앱은 영어 공지가 있으면 영어를 보여 준다', async () => {
    const texts = await renderedTexts('ja', both);
    expect(texts).toEqual(expect.arrayContaining(['English title', 'English body']));
  });
});
