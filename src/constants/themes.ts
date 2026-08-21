export interface ThemeColors {
  // 브랜드
  primary: string;       // 링크, 활성 상태, 아이콘
  /**
   * 흰 글씨를 얹는 채운 버튼 전용. primary 보다 한 단계 진하다.
   *
   * ⚠ 여기에 primary 나 accent 를 쓰면 안 된다. accent(#C4B5FD 계열)는 흰 글씨 대비가
   *   1.72:1 로 WCAG 최소 4.5:1 의 절반도 안 되고, primary(#6366F1)조차 4.47:1 로
   *   아슬아슬하게 미달한다. 이 값들은 모두 4.5:1 을 넘긴 것이다.
   */
  primaryStrong: string;
  accent: string;        // 강조 배경, 로딩 (채운 버튼 배경으로 쓰지 않는다)
  primaryLight: string;  // 선택 배경, 보조 버튼 배경

  // 그라데이션
  gradientStart: string; // 히어로 그라데이션 시작
  gradientEnd: string;   // 히어로 그라데이션 끝

  // 배경
  background: string;    // 화면 배경
  card: string;          // 카드/모달 배경
  surface: string;       // 입력 필드, 서브 배경

  // 텍스트
  text: string;          // 본문 텍스트
  textSecondary: string; // 보조 텍스트
  textTertiary: string;  // 약한 텍스트
  textOnPrimary: string; // primary 위 텍스트

  // 경계
  border: string;        // 기본 테두리
  borderLight: string;   // 연한 테두리

  // 시맨틱 (고정 — 테마 불문). 배경·아이콘·테두리용이다
  success: string;
  error: string;
  warning: string;

  /**
   * 삭제처럼 되돌릴 수 없는 동작의 **글자색**.
   *
   * error(#EF4444)는 흰 배경에서 3.76:1 로 본문 기준 4.5:1 에 못 미친다.
   * 반대로 다크 배경에서는 진한 빨강이 안 보인다. 그래서 명암별로 값이 다르다.
   * ⚠ 배경색으로 쓰지 않는다 — 배경은 error 를 쓴다.
   */
  dangerText: string;

  /**
   * 정답·성공을 **글자로** 표시할 때. success(#10B981)는 흰 배경에서 2.54:1 이다.
   */
  successText: string;

  /**
   * 주의·중복을 **글자로** 표시할 때. warning(#F59E0B)은 흰 배경에서 2.15:1 로
   * 셋 중 가장 나쁘다.
   */
  warningText: string;

  /**
   * 의미색 블록(힌트·정답·오답 카드)의 배경과 테두리.
   *
   * 연한 파스텔 배경은 다크 테마에서 그대로 밝게 떠 버린다. 명암별로 값이 다르다.
   * 각 배경 위에는 짝이 되는 successText / warningText / dangerText 를 올린다.
   */
  successBg: string;
  successBorder: string;
  warningBg: string;
  warningBorder: string;
  dangerBg: string;
  dangerBorder: string;

  // 다크모드 여부
  isDark: boolean;
}

export interface Theme {
  id: string;
  name: string;
  colors: ThemeColors;
}

const SEMANTIC = {
  success: '#10B981',
  error: '#EF4444',
  warning: '#F59E0B',
};

export const THEMES: Theme[] = [
  {
    id: 'indigo',
    name: '인디고',
    colors: {
      primary: '#6366F1',
      primaryStrong: '#4F46E5', // 흰 글씨 대비 6.30:1
      accent: '#C4B5FD',
      primaryLight: '#EEF2FF',
      gradientStart: '#6366F1',
      gradientEnd: '#818CF8',
      background: '#F8F9FA',
      card: '#FFFFFF',
      surface: '#F9FAFB',
      text: '#1A1A1A',
      textSecondary: '#6B7280',
      textTertiary: '#9CA3AF',
      textOnPrimary: '#FFFFFF',
      border: '#E5E7EB',
      borderLight: '#F3F4F6',
      ...SEMANTIC,
      dangerText: '#DC2626', // 카드 배경 위 4.83:1
      successText: '#047857',
      warningText: '#92400E',
      successBg: '#D1FAE5',
      successBorder: '#6EE7B7',
      warningBg: '#FFFBEB',
      warningBorder: '#FDE68A',
      dangerBg: '#FEE2E2',
      dangerBorder: '#FCA5A5',
      isDark: false,
    },
  },
  {
    id: 'mint',
    name: '민트',
    colors: {
      primary: '#10B981',
      primaryStrong: '#047857', // 흰 글씨 대비 5.48:1
      accent: '#6EE7B7',
      primaryLight: '#ECFDF5',
      gradientStart: '#10B981',
      gradientEnd: '#34D399',
      background: '#F8FAFB',
      card: '#FFFFFF',
      surface: '#F0FDF4',
      text: '#1A1A1A',
      textSecondary: '#6B7280',
      textTertiary: '#9CA3AF',
      textOnPrimary: '#FFFFFF',
      border: '#E5E7EB',
      borderLight: '#F3F4F6',
      ...SEMANTIC,
      dangerText: '#DC2626', // 카드 배경 위 4.83:1
      successText: '#047857',
      warningText: '#92400E',
      successBg: '#D1FAE5',
      successBorder: '#6EE7B7',
      warningBg: '#FFFBEB',
      warningBorder: '#FDE68A',
      dangerBg: '#FEE2E2',
      dangerBorder: '#FCA5A5',
      isDark: false,
    },
  },
  {
    id: 'rose',
    name: '로즈',
    colors: {
      primary: '#F43F5E',
      primaryStrong: '#BE123C', // 흰 글씨 대비 6.28:1
      accent: '#FDA4AF',
      primaryLight: '#FFF1F2',
      gradientStart: '#F43F5E',
      gradientEnd: '#FB7185',
      background: '#FAFAFA',
      card: '#FFFFFF',
      surface: '#FFF5F5',
      text: '#1A1A1A',
      textSecondary: '#6B7280',
      textTertiary: '#9CA3AF',
      textOnPrimary: '#FFFFFF',
      border: '#E5E7EB',
      borderLight: '#F3F4F6',
      ...SEMANTIC,
      dangerText: '#DC2626', // 카드 배경 위 4.83:1
      successText: '#047857',
      warningText: '#92400E',
      successBg: '#D1FAE5',
      successBorder: '#6EE7B7',
      warningBg: '#FFFBEB',
      warningBorder: '#FDE68A',
      dangerBg: '#FEE2E2',
      dangerBorder: '#FCA5A5',
      isDark: false,
    },
  },
  {
    id: 'orange',
    name: '오렌지',
    colors: {
      primary: '#F97316',
      primaryStrong: '#C2410C', // 흰 글씨 대비 5.18:1
      accent: '#FDBA74',
      primaryLight: '#FFF7ED',
      gradientStart: '#F97316',
      gradientEnd: '#FB923C',
      background: '#FAFAF9',
      card: '#FFFFFF',
      surface: '#FFFBF5',
      text: '#1A1A1A',
      textSecondary: '#6B7280',
      textTertiary: '#9CA3AF',
      textOnPrimary: '#FFFFFF',
      border: '#E5E7EB',
      borderLight: '#F3F4F6',
      ...SEMANTIC,
      dangerText: '#DC2626', // 카드 배경 위 4.83:1
      successText: '#047857',
      warningText: '#92400E',
      successBg: '#D1FAE5',
      successBorder: '#6EE7B7',
      warningBg: '#FFFBEB',
      warningBorder: '#FDE68A',
      dangerBg: '#FEE2E2',
      dangerBorder: '#FCA5A5',
      isDark: false,
    },
  },
  {
    id: 'sky',
    name: '스카이',
    colors: {
      primary: '#0EA5E9',
      primaryStrong: '#0369A1', // 흰 글씨 대비 5.93:1
      accent: '#7DD3FC',
      primaryLight: '#F0F9FF',
      gradientStart: '#0EA5E9',
      gradientEnd: '#38BDF8',
      background: '#F8FAFC',
      card: '#FFFFFF',
      surface: '#F0F9FF',
      text: '#1A1A1A',
      textSecondary: '#6B7280',
      textTertiary: '#9CA3AF',
      textOnPrimary: '#FFFFFF',
      border: '#E5E7EB',
      borderLight: '#F3F4F6',
      ...SEMANTIC,
      dangerText: '#DC2626', // 카드 배경 위 4.83:1
      successText: '#047857',
      warningText: '#92400E',
      successBg: '#D1FAE5',
      successBorder: '#6EE7B7',
      warningBg: '#FFFBEB',
      warningBorder: '#FDE68A',
      dangerBg: '#FEE2E2',
      dangerBorder: '#FCA5A5',
      isDark: false,
    },
  },
  {
    id: 'dark',
    name: '다크',
    colors: {
      primary: '#8B5CF6',
      primaryStrong: '#7C3AED', // 흰 글씨 대비 5.70:1
      accent: '#A78BFA',
      primaryLight: '#2D2640',
      gradientStart: '#1E1E2E',
      gradientEnd: '#2D2640',
      background: '#121212',
      card: '#1E1E1E',
      surface: '#2A2A2A',
      text: '#E5E5E5',
      textSecondary: '#A0A0A0',
      textTertiary: '#707070',
      textOnPrimary: '#FFFFFF',
      border: '#333333',
      borderLight: '#2A2A2A',
      ...SEMANTIC,
      dangerText: '#F87171', // 카드 배경 위 6.03:1
      successText: '#6EE7B7',
      warningText: '#FCD34D',
      successBg: '#10291F',
      successBorder: '#1F5741',
      warningBg: '#2B2312',
      warningBorder: '#5C4A1C',
      dangerBg: '#2E1717',
      dangerBorder: '#5E2B2B',
      isDark: true,
    },
  },
];

export const DEFAULT_THEME_ID = 'indigo';

export function getThemeById(id: string): Theme {
  return THEMES.find((t) => t.id === id) ?? THEMES[0];
}
