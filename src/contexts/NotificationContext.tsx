import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  NOTIFY_DEFAULT_TIME,
  NOTIFY_ENABLED_KEY,
  NOTIFY_PROMPTED_KEY,
  NOTIFY_TIME_KEY,
} from '../constants/appConfig';
import { notificationService, type PermissionState } from '../services/notificationService';
import { formatTime, parseTime, type TimeOfDay } from '../utils/notificationSchedule';

/**
 * 학습 리마인더 설정 — 토글 · 시각 · "권유를 이미 띄웠나".
 *
 * 🔴 BootstrapContext 에 얹지 않는다. 그쪽 책임은 "공통 서버 부팅 조회 1회"이고,
 *    알림은 서버와 아무 상관이 없다. 한 컨텍스트에 두면 서버가 죽었을 때 알림까지 끌려간다.
 *
 * 재예약 시점은 **포그라운드 복귀할 때마다**다. 앱을 열수록 첫 알림이 내일로 밀리므로
 * "하루 안 쓰면 온다"가 성립한다(자세한 이유는 utils/notificationSchedule.ts).
 */

interface NotificationValue {
  /** 웹에서는 false. 화면은 이 값으로 섹션 자체를 감춘다 */
  supported: boolean;
  /** 저장소를 읽어 첫 상태가 정해졌나. 그 전에는 토글이 깜빡이므로 화면에서 기다린다 */
  loaded: boolean;
  enabled: boolean;
  time: TimeOfDay;
  permission: PermissionState;
  /** 첫 퀴즈를 끝낸 사람에게 한 번만 권유할지. 이미 켰거나·이미 물었거나·OS 가 막았으면 false */
  shouldPrompt: boolean;
  /**
   * 토글. 켤 때 권한을 요청하고 **거절되면 켜지 않는다**(false 반환).
   * 화면은 반환값으로 "설정에서 허용해 주세요" 안내를 띄울지 정한다.
   */
  setEnabled: (next: boolean) => Promise<boolean>;
  setTime: (next: TimeOfDay) => Promise<void>;
  /** 권유를 띄웠음을 기록한다(수락·거절 무관 — 두 번 묻지 않는다) */
  markPrompted: () => void;
}

const NotificationContext = createContext<NotificationValue | null>(null);

// 웹 환경 localStorage 폴백 — noticeService 와 같은 형태로 둔다
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

// 저장된 값이 깨져 있어도 앱이 멈추면 안 된다. 파싱 실패는 기본값으로 본다.
const DEFAULT_TIME = parseTime(NOTIFY_DEFAULT_TIME) ?? { hour: 20, minute: 0 };

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const supported = notificationService.isSupported();
  const [loaded, setLoaded] = useState(false);
  const [enabled, setEnabledState] = useState(false);
  const [time, setTimeState] = useState<TimeOfDay>(DEFAULT_TIME);
  const [permission, setPermission] = useState<PermissionState>('undetermined');
  const [prompted, setPrompted] = useState(true); // 읽기 전에는 "이미 물었다"로 둬 깜빡임을 막는다

  // 리스너 콜백은 최신 상태를 보지 못하므로(등록 시점의 클로저를 잡는다) ref 로 따라간다
  const enabledRef = useRef(enabled);
  const timeRef = useRef(time);
  enabledRef.current = enabled;
  timeRef.current = time;

  useEffect(() => {
    let alive = true;

    (async () => {
      // 저장소 세 값과 권한 상태는 서로 기다릴 이유가 없다
      const [storedEnabled, storedTime, storedPrompted, currentPermission] = await Promise.all([
        storageImpl.getItem(NOTIFY_ENABLED_KEY),
        storageImpl.getItem(NOTIFY_TIME_KEY),
        storageImpl.getItem(NOTIFY_PROMPTED_KEY),
        notificationService.getPermission(),
      ]);
      if (!alive) return;

      const nextTime = parseTime(storedTime) ?? DEFAULT_TIME;
      // 🔴 저장소가 켜짐이어도 **OS 권한이 사라졌으면 꺼진 것**이다.
      //    사용자가 시스템 설정에서 끄고 돌아올 수 있고, 그때 토글만 켜져 있으면 거짓말이 된다.
      const nextEnabled = storedEnabled === 'true' && currentPermission === 'granted';

      setPermission(currentPermission);
      setTimeState(nextTime);
      setEnabledState(nextEnabled);
      setPrompted(storedPrompted === 'true');
      setLoaded(true);

      if (nextEnabled) {
        void notificationService.reschedule(nextTime);
      } else {
        void notificationService.cancelAll();
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!supported) return;

    // 🔴 `.catch()` 를 붙이지 않는다 — reschedule 은 계약상 절대 reject 하지 않는다.
    //    리스너 콜백은 동기라 여기서 새어 나간 rejection 은 잡을 곳이 없고, 그대로
    //    ErrorBoundary 에 걸려 **오류 화면**이 된다(BootstrapContext 의 하트비트와 같은 이유).
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      if (!enabledRef.current) return;
      void notificationService.reschedule(timeRef.current);
    });
    return () => sub.remove();
  }, [supported]);

  const setEnabled = useCallback(async (next: boolean): Promise<boolean> => {
    if (!next) {
      setEnabledState(false);
      await storageImpl.setItem(NOTIFY_ENABLED_KEY, 'false');
      await notificationService.cancelAll();
      return false;
    }

    // 켜려는 순간에만 권한을 묻는다. 이미 허용돼 있으면 대화상자가 뜨지 않는다.
    let current = await notificationService.getPermission();
    if (current !== 'granted') {
      current = await notificationService.requestPermission();
    }
    setPermission(current);

    if (current !== 'granted') {
      // 거절당했으면 켜지 않는다. 켠 척해 두면 알림이 안 오는 이유를 사용자가 알 길이 없다.
      setEnabledState(false);
      await storageImpl.setItem(NOTIFY_ENABLED_KEY, 'false');
      return false;
    }

    setEnabledState(true);
    await storageImpl.setItem(NOTIFY_ENABLED_KEY, 'true');
    await notificationService.reschedule(timeRef.current);
    return true;
  }, []);

  const setTime = useCallback(async (next: TimeOfDay): Promise<void> => {
    setTimeState(next);
    timeRef.current = next;
    await storageImpl.setItem(NOTIFY_TIME_KEY, formatTime(next));
    if (enabledRef.current) {
      await notificationService.reschedule(next);
    }
  }, []);

  const markPrompted = useCallback(() => {
    setPrompted(true);
    // 저장 실패해도 화면은 이미 넘어갔다. 최악이 다음 실행에 한 번 더 묻는 것이라 조용히 둔다.
    void storageImpl.setItem(NOTIFY_PROMPTED_KEY, 'true');
  }, []);

  const shouldPrompt = useMemo(
    // 권한이 이미 'denied' 면 대화상자가 아예 안 뜬다 — 물어도 소용이 없으니 권유하지 않는다.
    () => supported && loaded && !enabled && !prompted && permission !== 'denied',
    [supported, loaded, enabled, prompted, permission],
  );

  const value = useMemo<NotificationValue>(
    () => ({
      supported,
      loaded,
      enabled,
      time,
      permission,
      shouldPrompt,
      setEnabled,
      setTime,
      markPrompted,
    }),
    [supported, loaded, enabled, time, permission, shouldPrompt, setEnabled, setTime, markPrompted],
  );

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
}

export function useNotification(): NotificationValue {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotification 은 NotificationProvider 안에서만 쓸 수 있습니다');
  }
  return context;
}
