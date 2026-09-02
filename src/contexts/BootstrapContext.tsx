import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';
import { commonServer, ensureDeviceSession } from '../services/commonServer/client';
import { noticeService } from '../services/noticeService';
import type { AnnouncementItem, Bootstrap } from '../services/commonServer/types';

/**
 * 공통 서버 부팅 조회 — 앱 실행당 **단 1회**.
 *
 * 점검·버전게이트·공지를 한 번에 받아 세 소비자(진입 게이트 / 홈·설정 뱃지 / 공지 목록)에게
 * 나눠준다. 화면 전환마다 다시 부르지 않기 위해 훅이 아니라 컨텍스트로 둔다.
 *
 * 실패해도 아무것도 하지 않는다 — boot 은 null 로 남고, 게이트는 적용되지 않으며,
 * 공지 목록은 빈 상태로 보인다. 서버가 죽어도 앱의 기존 기능은 그대로 동작해야 한다.
 */

interface BootstrapValue {
  /** 조회 성공 시에만 채워진다. 실패·미설정이면 null */
  boot: Bootstrap | null;
  /** 조회 시도가 끝났는지(성공·실패 무관). 게이트 판정을 시작할 시점을 알기 위해 필요 */
  loaded: boolean;
  announcements: AnnouncementItem[];
  /** 읽음으로 기록된 공지 id. 공지 화면이 "입장 시점의 안읽음"을 스냅샷으로 뜨기 위해 필요 */
  readIds: string[];
  unreadCount: number;
  /** 공지 화면에 들어온 시점에 호출 — 목록 전체를 읽음으로 기록한다 */
  markAllNoticesRead: () => void;
}

const BootstrapContext = createContext<BootstrapValue | null>(null);

export function BootstrapProvider({ children }: { children: React.ReactNode }) {
  const [boot, setBoot] = useState<Bootstrap | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [readIds, setReadIds] = useState<string[]>([]);

  useEffect(() => {
    let alive = true;

    (async () => {
      // 저장소와 서버는 서로 기다릴 이유가 없다.
      //
      // ensureDeviceSession 도 여기 병렬로 둔다. fetchBootstrap 과 POST /v1/devices 는
      // 양쪽 다 서버에 활성 일자를 남기고(하루에 몇 번 찍혀도 1회로 처리되는 멱등 연산),
      // 순서를 맞출 이유가 없다 — 직렬로 바꾸면 부팅만 느려진다.
      // 결과는 쓰지 않는다. 실패해도(오프라인·웹) 문의가 익명으로 접수될 뿐 앱은 그대로 돈다.
      const [result, stored] = await Promise.all([
        commonServer.fetchBootstrap(),
        noticeService.getReadIds(),
        ensureDeviceSession(),
      ]);
      if (!alive) return;

      if (result.ok) setBoot(result.data);
      setReadIds(stored);
      setLoaded(true);
    })();

    return () => {
      // 조회 도중 언마운트되면 상태를 건드리지 않는다
      alive = false;
    };
  }, []);

  useEffect(() => {
    // 웜 스타트 하트비트 — 포그라운드로 돌아올 때마다 활성 신호를 보낸다(SDK 2026-09-02).
    //
    // 위 부팅 조회는 **JS 프로세스당 1회**다. 그런데 RN 에서 홈 버튼은 프로세스를 죽이지 않으므로,
    // 앱을 껐다 켜지 않고 계속 쓰는 사용자는 활성 집계에 한 번도 안 잡혔다 —
    // 자주 쓰는 사용자일수록 덜 세는, 방향이 거꾸로인 오차였다.
    //
    // 🔴 `.catch()` 를 붙이지 않는다. heartbeat 은 계약상 **절대 reject 하지 않는다**
    //    (네트워크 오류·타임아웃·미설정·세션 없음·쿨다운·파싱 실패를 전부 삼킨다).
    //    리스너 콜백은 동기라 여기서 새어 나간 rejection 은 잡을 곳이 없고,
    //    그대로 ErrorBoundary 에 걸려 **오프라인에서 오류 화면**이 된다.
    // 쿨다운 5분도 SDK 안에 있다 — 여기서 디바운스를 다시 만들지 않는다.
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void commonServer.heartbeat();
    });
    return () => sub.remove();
  }, []);

  const announcements = useMemo(() => boot?.announcements ?? [], [boot]);

  const unreadCount = useMemo(() => {
    if (announcements.length === 0) return 0;
    const read = new Set(readIds);
    return announcements.filter((a) => !read.has(a.id)).length;
  }, [announcements, readIds]);

  const markAllNoticesRead = useCallback(() => {
    if (announcements.length === 0) return;
    const serverIds = announcements.map((a) => a.id);
    // 화면은 즉시 갱신하고, 저장은 뒤따라간다(실패해도 다음 실행에 안읽음으로 되돌아갈 뿐).
    setReadIds(serverIds);
    void noticeService.setReadIds(serverIds, serverIds);
  }, [announcements]);

  const value = useMemo<BootstrapValue>(
    () => ({ boot, loaded, announcements, readIds, unreadCount, markAllNoticesRead }),
    [boot, loaded, announcements, readIds, unreadCount, markAllNoticesRead],
  );

  return <BootstrapContext.Provider value={value}>{children}</BootstrapContext.Provider>;
}

export function useBootstrap(): BootstrapValue {
  const context = useContext(BootstrapContext);
  if (!context) {
    throw new Error('useBootstrap 은 BootstrapProvider 안에서만 쓸 수 있습니다');
  }
  return context;
}
