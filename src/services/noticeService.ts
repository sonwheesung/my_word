import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { NOTICE_READ_KEY } from '../constants/appConfig';

/**
 * 공지 읽음 상태 — **로컬 전용**.
 *
 * 서버에 읽음을 보내지 않는다. 익명 앱이라 서버가 "누가 읽었는지"를 알 방법이 없고,
 * 알 수 있게 만들면 익명성이 깨진다. 그래서 읽은 공지 id 를 기기에만 쌓는다.
 *
 * 저장 시 서버가 내려준 id 목록과 교집합만 남긴다 — 만료·삭제된 공지의 id 가 영원히
 * 쌓이는 것을 막기 위함이다(공지 id 는 서버에서 재사용하지 않으므로 안전하다).
 */

// 웹 환경 localStorage 폴백
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

export const noticeService = {
  /** 읽은 공지 id 목록. 저장소 오류·깨진 값은 "아무것도 안 읽음"으로 본다(안내가 더 뜰 뿐 손해가 없다). */
  async getReadIds(): Promise<string[]> {
    try {
      const raw = await storageImpl.getItem(NOTICE_READ_KEY);
      if (!raw) return [];
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter((v): v is string => typeof v === 'string');
    } catch {
      return [];
    }
  },

  /**
   * 주어진 id 들을 읽음으로 저장한다.
   * @param readIds 읽음 처리할 id
   * @param serverIds 현재 서버가 내려준 공지 id — 이 목록에 없는 id 는 정리한다
   * @returns 실제로 저장된 id 목록
   */
  async setReadIds(readIds: string[], serverIds: string[]): Promise<string[]> {
    const alive = new Set(serverIds);
    const next = [...new Set(readIds)].filter((id) => alive.has(id));
    try {
      await storageImpl.setItem(NOTICE_READ_KEY, JSON.stringify(next));
    } catch {
      // 저장 실패 시에도 화면 상태는 갱신한다 — 다음 실행에 안읽음으로 되돌아갈 뿐이다
    }
    return next;
  },
};
