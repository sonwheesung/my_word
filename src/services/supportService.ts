import { commonServer } from './commonServer/client';
import type { FailReason, SupportCategory } from './commonServer/types';

/**
 * 문의하기 — 익명 단방향 접수.
 *
 * 누가 보냈는지는 보내지 않는다(계정·기기 식별자 없음). 서버가 저장하는 건 플랫폼과 앱 버전뿐이고,
 * 답변 경로도 없다 — 어떤 환경에서 난 문제인지 파악하는 용도다.
 *
 * 실제 통신은 공통 서버 SDK(`commonServer`)가 담당한다. 이 모듈은 화면이 기대하는 이름과 타입을
 * 유지하기 위한 얇은 래퍼다 — SDK 교체가 화면까지 번지지 않게 막는 경계선.
 *
 * 이 모듈은 **throw 하지 않는다**. 네트워크가 끊겨 있든 서버가 없든 화면은 조용히 안내만 하면
 * 되므로, 실패를 타입으로 돌려준다.
 */

export type { SupportCategory };

export type SupportFailReason = FailReason;

export type SupportResult = { ok: true } | { ok: false; reason: SupportFailReason };

export const supportService = {
  /** 서버 URL이 빌드에 박혀 있는지 — 화면에서 진입 자체를 막을지 판단할 때 쓴다. */
  isConfigured(): boolean {
    return commonServer.isConfigured();
  },

  async sendInquiry(category: SupportCategory, content: string): Promise<SupportResult> {
    const result = await commonServer.sendInquiry(category, content);
    return result.ok ? { ok: true } : { ok: false, reason: result.reason };
  },
};
