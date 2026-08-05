import { Platform } from 'react-native';
import {
  APP_VERSION,
  SUPPORT_API_URL,
  SUPPORT_CONTENT_MIN,
  SUPPORT_PROJ,
} from '../constants/appConfig';

/**
 * 문의하기 — 익명 단방향 접수.
 *
 * 누가 보냈는지는 보내지 않는다(계정·기기 식별자 없음). 서버도 프로젝트별 익명 계정
 * 한 곳에 모아 저장하므로 작성자를 되짚을 수 없고, 답변 경로도 없다.
 * 함께 보내는 건 앱 버전과 플랫폼뿐 — 어떤 환경에서 난 문제인지 파악하는 용도다.
 *
 * 이 모듈은 **throw 하지 않는다**. 네트워크가 끊겨 있든 서버가 없든 화면은 조용히
 * 안내만 하면 되므로, 실패를 타입으로 돌려준다.
 */

export type SupportCategory = 'bug' | 'suggestion' | 'question' | 'etc';

export type SupportFailReason =
  | 'not-configured' // 서버 URL 미설정 빌드
  | 'offline' // 네트워크 불가 / 타임아웃
  | 'too-short' // 본문이 최소 길이 미만
  | 'rate-limited' // 접수 한도 초과
  | 'error'; // 서버 오류

export type SupportResult = { ok: true } | { ok: false; reason: SupportFailReason };

const REQ_TIMEOUT_MS = 10000;

export const supportService = {
  /** 서버 URL이 빌드에 박혀 있는지 — 화면에서 진입 자체를 막을지 판단할 때 쓴다. */
  isConfigured(): boolean {
    return SUPPORT_API_URL.length > 0;
  },

  async sendInquiry(category: SupportCategory, content: string): Promise<SupportResult> {
    const trimmed = content.trim();
    if (trimmed.length < SUPPORT_CONTENT_MIN) return { ok: false, reason: 'too-short' };
    if (!SUPPORT_API_URL) return { ok: false, reason: 'not-configured' };

    // 응답 없이 매달리지 않도록 타임아웃을 건다(사용자가 로딩에 갇히는 것 방지).
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQ_TIMEOUT_MS);

    try {
      const response = await fetch(`${SUPPORT_API_URL}/api/ticket/anon`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          proj: SUPPORT_PROJ,
          category,
          content: trimmed,
          device: { platform: Platform.OS, appVersion: APP_VERSION },
        }),
      });

      if (response.ok) return { ok: true };
      if (response.status === 429) return { ok: false, reason: 'rate-limited' };
      return { ok: false, reason: 'error' };
    } catch {
      // fetch 실패·abort 는 모두 "지금은 못 보냄"으로 묶는다 — 사용자가 할 일은 같다(나중에 재시도).
      return { ok: false, reason: 'offline' };
    } finally {
      clearTimeout(timer);
    }
  },
};
