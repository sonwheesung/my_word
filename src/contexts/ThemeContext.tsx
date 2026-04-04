import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import type { ThemeColors } from '../constants/themes';
import { getThemeById, DEFAULT_THEME_ID } from '../constants/themes';

const THEME_STORAGE_KEY = '@my_word_theme';

const isWeb = Platform.OS === 'web';
const storageImpl = isWeb
  ? {
      async getItem(key: string): Promise<string | null> {
        if (typeof window !== 'undefined' && window.localStorage) {
          return window.localStorage.getItem(key);
        }
        return null;
      },
      async setItem(key: string, value: string): Promise<void> {
        if (typeof window !== 'undefined' && window.localStorage) {
          window.localStorage.setItem(key, value);
        }
      },
    }
  : AsyncStorage;

interface ThemeContextType {
  colors: ThemeColors;
  themeId: string;
  setThemeId: (id: string) => void;
}

const defaultColors = getThemeById(DEFAULT_THEME_ID).colors;

const ThemeContext = createContext<ThemeContextType>({
  colors: defaultColors,
  themeId: DEFAULT_THEME_ID,
  setThemeId: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [themeId, setThemeIdState] = useState(DEFAULT_THEME_ID);

  useEffect(() => {
    const load = async () => {
      try {
        const saved = await storageImpl.getItem(THEME_STORAGE_KEY);
        if (saved) {
          setThemeIdState(saved);
        }
      } catch {
        // 무시
      }
    };
    load();
  }, []);

  const setThemeId = useCallback(async (id: string) => {
    setThemeIdState(id);
    try {
      await storageImpl.setItem(THEME_STORAGE_KEY, id);
    } catch {
      // 무시
    }
  }, []);

  const value = useMemo(() => ({
    colors: getThemeById(themeId).colors,
    themeId,
    setThemeId,
  }), [themeId, setThemeId]);

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextType {
  return useContext(ThemeContext);
}
