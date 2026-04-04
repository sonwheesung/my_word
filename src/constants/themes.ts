export interface ThemeColors {
  // 브랜드
  primary: string;       // 주 버튼, 링크, 활성 상태
  accent: string;        // 강조 버튼, 로딩
  primaryLight: string;  // 선택 배경, 연한 강조

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

  // 시맨틱 (고정 — 테마 불문)
  success: string;
  error: string;
  warning: string;

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
      isDark: false,
    },
  },
  {
    id: 'mint',
    name: '민트',
    colors: {
      primary: '#10B981',
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
      isDark: false,
    },
  },
  {
    id: 'rose',
    name: '로즈',
    colors: {
      primary: '#F43F5E',
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
      isDark: false,
    },
  },
  {
    id: 'orange',
    name: '오렌지',
    colors: {
      primary: '#F97316',
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
      isDark: false,
    },
  },
  {
    id: 'sky',
    name: '스카이',
    colors: {
      primary: '#0EA5E9',
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
      isDark: false,
    },
  },
  {
    id: 'dark',
    name: '다크',
    colors: {
      primary: '#8B5CF6',
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
      isDark: true,
    },
  },
];

export const DEFAULT_THEME_ID = 'indigo';

export function getThemeById(id: string): Theme {
  return THEMES.find((t) => t.id === id) ?? THEMES[0];
}
