import { commonServer } from './commonServer/client';
import type { FailReason, SupportCategory } from './commonServer/types';

/**
 * 문의하기 — 기기에 귀속되는 접수.
 *
 * 부팅 때 확보한 기기 세션(`ensureDeviceSession`)이 있으면 SDK 가 자동으로 실어 보내 **본인
 * 문의로 귀속된다** — 운영자 답변을 돌려받을 수 있다. 세션이 없으면(오프라인·웹·등록 실패)
 * 예전처럼 익명으로 접수된다. **이 모듈은 그 둘을 구분하지 않는다** — SDK 가 알아서 한다.
 *
 * 귀속에 쓰는 것은 앱이 최초 실행 때 만든 무작위 UUID 하나뿐이다. 계정도 이메일도 없고,
 * 광고 식별자(GAID)와도 무관하다. 앱을 지우면 그 연결도 끊긴다.
 * 서버가 함께 저장하는 나머지 정보는 플랫폼과 앱 버전뿐이다.
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
