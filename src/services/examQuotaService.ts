import { EXAM_FREE_LEFT_KEY, EXAM_FREE_QUOTA, SUB_SEEN_KEY } from '../constants/appConfig';
import { readRaw, writeRaw } from '../utils/storage';

/**
 * 시험 진입 카드가 쓰는 **기기 쪽 기억** (시안 단어앱#19 · 2026-10-15).
 *
 * 두 가지를 적어 둔다. 둘 다 **화면을 그리기 위한 것**이지 정본이 아니다.
 *
 * ```
 * 남은 무료 판수      서버는 remaining 을 **시험을 받은 응답에만** 싣는다.
 *                     그래서 들어오기 전에는 알 길이 없어, 마지막으로 들은 값을 적어 둔다.
 * 마지막으로 본 구독   구독이 끝난 것을 **카드가 직접 말하기 위해서다.**
 * ```
 *
 * 🔴 **남은 판수는 대략이다.** 「서버에 보관된 내용 지우기」 · 구독 전환 · 로그인 뒤에는
 *    틀려질 수 있다. 그래서 **시작을 막는 데 쓰지 않는다** — 막으면 틀린 값이 사람을 가둔다.
 *    서버가 403 을 주면 그때 실패 화면이 한 번 더 안내한다(그쪽이 정본이다).
 *
 * 🔴 **구독자는 `remaining` 이 `null`(판수 제한 없음)이다. 0 과 반드시 구별한다** —
 *    `null` 을 0 으로 읽으면 구독자에게 *"다 썼어요"* 가 뜬다. 그래서 `saveFreeLeft` 는
 *    숫자만 받고, 부르는 쪽이 `null` 이면 아예 안 부른다.
 *
 * ⚠ 둘 다 **백업에 담지 않는다**(`appConfig` 의 키 주석). 학습 기록이 아니라 이 기기가
 *   마지막으로 들은 서버 상태이고, 복원한 기기에서는 다음 응답에 바로 덮인다.
 */

/** 구독이 끝난 사유. 🔴 **사유마다 사용자가 할 일이 다르다** */
export type QuotaNotice =
  /** 해지 · 만료 · 환불 — **예정된 일이다. 나무라지 않는다** */
  | 'ended'
  /** 결제 실패 — **사고다. 손쓸 길이 같이 있어야 한다** */
  | 'billing';

/** 마지막으로 본 구독 상태. `notice` 는 **아직 안 알린** 사유다 */
export interface SubSeen {
  active: boolean;
  /** 결제 유예 중이었나. 🔴 이것이 「해지」와 「결제 실패」를 가르는 유일한 단서다 */
  grace: boolean;
  notice: QuotaNotice | null;
}

/**
 * 다음에 적을 상태를 정한다. **순수 함수다** — 구독을 살 수 있기 전에는 실기기에서
 * 밟아 볼 수 없는 길이라, 여기만 따로 테스트한다.
 *
 * ```
 * 처음 본다          알릴 것이 없다. 지금 상태를 적어 두기만 한다 (과거를 모른다)
 * 지금 구독 중       알릴 것이 없다 — 돌아왔으면 하던 안내도 거둔다
 * 켜짐 → 꺼짐        유예 중이었으면 **결제 실패**, 아니면 **해지**
 * 계속 꺼짐          들고 있던 안내를 그대로 유지한다
 * ```
 *
 * 🔴 **사유를 모르면 「해지」로 읽는다.** 권한 정보에는 `active · expiresAt · willRenew ·
 *    inGracePeriod` 넷뿐이라 환불(`REFUND`)과 해지를 구분하지 못한다. *"구독이 끝나서"* 는
 *    환불에도 틀린 말이 아니고, **나무라지 않는 쪽으로 틀리는 것**이 안전하다.
 */
export function nextSeen(prev: SubSeen | null, now: { active: boolean; grace: boolean }): SubSeen {
  if (prev === null) return { active: now.active, grace: now.grace, notice: null };
  if (now.active) return { active: true, grace: now.grace, notice: null };
  if (prev.active) {
    return { active: false, grace: now.grace, notice: prev.grace ? 'billing' : 'ended' };
  }
  return { active: false, grace: now.grace, notice: prev.notice };
}

/** 🔴 어떤 입력에도 던지지 않는다. 이 값이 깨졌다고 시험 화면이 안 열리면 안 된다 */
export function parseSubSeen(raw: string | null): SubSeen | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    if (typeof o.active !== 'boolean') return null;
    const notice = o.notice === 'ended' || o.notice === 'billing' ? o.notice : null;
    return { active: o.active, grace: o.grace === true, notice };
  } catch {
    return null;
  }
}

/**
 * 적어 둔 남은 판수. **모르면 `null`** — 부르는 쪽이 「한 번도 안 봤다」를 알아야 한다.
 * ⚠ 범위 밖 값은 끌어들인다(저장본이 손상돼도 점 11개를 그리지 않게).
 */
export function parseFreeLeft(raw: string | null): number | null {
  if (raw === null || raw === '') return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(EXAM_FREE_QUOTA, Math.floor(n)));
}

export const examQuotaService = {
  /** 모르면 `EXAM_FREE_QUOTA`(아직 한 번도 안 썼다고 본다) */
  async loadFreeLeft(): Promise<number> {
    return parseFreeLeft(await readRaw(EXAM_FREE_LEFT_KEY)) ?? EXAM_FREE_QUOTA;
  },

  /**
   * ⚠ **삼킨다.** 못 적어도 시험은 멀쩡히 돌아간다 — 다음에 카드가 옛 숫자를 보여 줄 뿐이다.
   * 🚫 구독자(`remaining === null`)에게는 부르지 않는다. 숫자만 받는 이유가 그것이다.
   */
  async saveFreeLeft(left: number): Promise<void> {
    try {
      await writeRaw(EXAM_FREE_LEFT_KEY, String(Math.max(0, Math.floor(left))));
    } catch (error: any) {
      console.warn('남은 무료 판수 저장 실패:', error);
    }
  },

  /**
   * 지금 구독 상태를 보고 **알릴 것이 있으면 돌려준다.**
   * ⚠ 읽기와 쓰기를 한 번에 한다 — 화면이 들어올 때 한 번만 부른다.
   */
  async seeSubscription(now: { active: boolean; grace: boolean }): Promise<QuotaNotice | null> {
    try {
      const next = nextSeen(parseSubSeen(await readRaw(SUB_SEEN_KEY)), now);
      await writeRaw(SUB_SEEN_KEY, JSON.stringify(next));
      return next.notice;
    } catch (error: any) {
      console.warn('구독 상태 기억 실패:', error);
      return null;
    }
  },

  /**
   * 「해지 후」 안내를 거둔다. **한 번 알렸으면 됐다.**
   * 🚫 「결제 실패」는 거두지 않는다 — 그건 **아직 안 고쳐진 사고**라, 결제가 되어 구독이
   *    돌아올 때 `seeSubscription` 이 스스로 거둔다.
   */
  async dismissEndedNotice(): Promise<void> {
    try {
      const seen = parseSubSeen(await readRaw(SUB_SEEN_KEY));
      if (seen === null || seen.notice !== 'ended') return;
      await writeRaw(SUB_SEEN_KEY, JSON.stringify({ ...seen, notice: null }));
    } catch (error: any) {
      console.warn('구독 종료 안내 거두기 실패:', error);
    }
  },
};
