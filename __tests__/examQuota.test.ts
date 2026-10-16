/**
 * 시험 진입 카드가 기억하는 것 — **남은 무료 판수**와 **마지막으로 본 구독 상태**.
 *
 * 🔴 **구독을 아직 아무도 살 수 없다. 그래서 이 길은 실기기에서 밟아 볼 수가 없다.**
 *    파는 화면(시안 #20)이 생기기 전까지 `proActive` 는 늘 false 라, 「켜짐 → 꺼짐」이
 *    실제로 일어나지 않는다. 손으로 확인할 수 없는 코드는 **테스트가 유일한 눈**이다.
 *
 * 🔴 이 파일이 지키는 가장 무거운 약속 둘:
 *
 * ```
 * ① 못 물어본 것을 「끝났다」로 읽지 않는다   없는 사고를 알리는 것이 가장 나쁘다
 * ② 유예 중이었으면 「결제 실패」다          해지와 섞으면 손쓸 길을 안 주고 끝낸다
 * ```
 */
// ⚠ `@types/node` 가 없다(`flashcardService.test.ts` 와 같은 이유). 🚫 선언은 **모듈 바깥**에 둔다 —
//   describe 안에 두면 jest 는 돌지만 `tsc --noEmit` 이 「Modifiers cannot appear here」로 멈춘다
declare const require: (id: string) => any;
declare const __dirname: string;
const fs = require('fs') as { readFileSync(p: string, enc: string): string };
const path = require('path') as { join(...parts: string[]): string };

import {
  nextSeen,
  parseFreeLeft,
  parseSubSeen,
  type SubSeen,
} from '../src/services/examQuotaService';
import { EXAM_FREE_QUOTA } from '../src/constants/appConfig';

const seen = (over: Partial<SubSeen> = {}): SubSeen => ({
  active: false,
  grace: false,
  notice: null,
  ...over,
});

describe('구독 상태 변화 — 무엇을 알릴 것인가', () => {
  it('처음 본다 — 알릴 것이 없다 (과거를 모른다)', () => {
    expect(nextSeen(null, { active: false, grace: false })).toEqual({
      active: false,
      grace: false,
      notice: null,
    });
    // 🔴 구독자가 앱을 처음 깐 경우도 마찬가지다. 「끝났다」가 아니다
    expect(nextSeen(null, { active: true, grace: false }).notice).toBeNull();
  });

  it('🔴 켜짐 → 꺼짐 · 유예가 아니었다 → 해지', () => {
    expect(nextSeen(seen({ active: true }), { active: false, grace: false }).notice).toBe('ended');
  });

  it('🔴 켜짐 → 꺼짐 · 유예 중이었다 → 결제 실패', () => {
    const next = nextSeen(seen({ active: true, grace: true }), { active: false, grace: false });
    expect(next.notice).toBe('billing');
  });

  it('구독이 돌아오면 하던 안내를 거둔다', () => {
    expect(nextSeen(seen({ notice: 'billing' }), { active: true, grace: false }).notice).toBeNull();
    expect(nextSeen(seen({ notice: 'ended' }), { active: true, grace: false }).notice).toBeNull();
  });

  it('계속 꺼져 있으면 들고 있던 안내를 유지한다 — 한 번 보고 사라지면 못 본 사람이 생긴다', () => {
    expect(nextSeen(seen({ notice: 'ended' }), { active: false, grace: false }).notice).toBe('ended');
    expect(nextSeen(seen({ notice: 'billing' }), { active: false, grace: false }).notice).toBe(
      'billing',
    );
  });

  it('🔴 꺼짐 → 꺼짐은 새 안내를 만들지 않는다 (들어올 때마다 다시 뜨지 않게)', () => {
    expect(nextSeen(seen(), { active: false, grace: false }).notice).toBeNull();
  });
});

describe('적어 둔 구독 상태 읽기 — 깨져도 던지지 않는다', () => {
  it.each(['', 'null', '{', '[]', '{"active":"yes"}', '3'])('%p → null', (raw) => {
    expect(parseSubSeen(raw)).toBeNull();
  });

  it('모르는 사유는 버린다 — 화면이 그릴 수 없는 값이다', () => {
    expect(parseSubSeen('{"active":false,"grace":false,"notice":"paused"}')?.notice).toBeNull();
  });

  it('제대로 된 값은 그대로 읽는다', () => {
    expect(parseSubSeen('{"active":true,"grace":true,"notice":"billing"}')).toEqual({
      active: true,
      grace: true,
      notice: 'billing',
    });
  });
});

describe('남은 무료 판수 읽기', () => {
  it('🔴 한 번도 안 봤으면 null 이다 — 0 과 다르다', () => {
    expect(parseFreeLeft(null)).toBeNull();
    expect(parseFreeLeft('')).toBeNull();
    expect(parseFreeLeft('열')).toBeNull();
  });

  it('0 은 0 으로 읽는다 (다 썼다는 뜻이고 「모른다」가 아니다)', () => {
    expect(parseFreeLeft('0')).toBe(0);
  });

  it('⚠ 범위 밖은 끌어들인다 — 저장본이 손상돼도 점을 11개 그리지 않는다', () => {
    expect(parseFreeLeft('99')).toBe(EXAM_FREE_QUOTA);
    expect(parseFreeLeft('-3')).toBe(0);
    expect(parseFreeLeft('7.9')).toBe(7);
  });
});

describe('🔴 화면이 지키는 규칙 (소스 훑기)', () => {
  const read = (rel: string) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');

  it('🔴 구독자에게는 카드를 그리지 않는다', () => {
    expect(read('src/screens/ExamSetupScreen.tsx')).toContain('{!proActive && freeLeft !== null && (');
  });

  it('🔴 `proKnown` 전에는 구독 상태를 적지 않는다 — 없는 사고를 알리게 된다', () => {
    const s = read('src/screens/ExamSetupScreen.tsx');
    const at = s.indexOf('seeSubscription');
    expect(at).toBeGreaterThan(-1);
    expect(s.slice(Math.max(0, at - 400), at)).toContain('if (!proKnown) return;');
  });

  it('🔴 남은 판수로 시험 시작을 막지 않는다 — 틀린 값이 사람을 가두면 안 된다', () => {
    const s = read('src/screens/ExamSetupScreen.tsx');
    expect(s).not.toMatch(/disabled=\{[^}]*freeLeft/);
  });

  it('🔴 숫자가 든 문구는 숫자를 넘겨 받는다 — 안 넘기면 화면에 {{total}} 이 그대로 뜬다', () => {
    /*
     * 「다 씀」 제목만 `{{total}}` 을 들고 있다(2026-10-16 · #19 카드와 같은 말로 맞췄다).
     * 그리는 쪽이 값을 안 넘기면 i18next 는 **빈칸을 글자 그대로** 내보낸다 —
     * 크래시도 경고도 없고 테스트도 안 잡는다. 화면에만 보인다.
     */
    const s = read('src/screens/ExamScreen.tsx');
    expect(s).toContain("title: '무료 시험 {{total}}번을 다 썼어요'");
    expect(s).toMatch(/t\(message\.title, \{ total: EXAM_FREE_QUOTA \}\)/);
  });

  it('🔴 구독자의 remaining(null)을 0 으로 적지 않는다', () => {
    expect(read('src/screens/ExamScreen.tsx')).toContain(
      'if (exam.remaining !== null) await examQuotaService.saveFreeLeft(exam.remaining);',
    );
  });
});

// ── 페이월 — 법으로 지켜야 하는 것들 (2026-10-16 · 시안 #20) ─────────────────

describe('🔴 구독 결제 화면이 법에서 온 셋을 지킨다', () => {
  const src = (rel: string) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
  /** 주석 안의 글자에 속지 않는다 — 규칙은 **화면에 나가는 코드**에만 걸린다 */
  const stripComments = (t: string) =>
    t.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
  const paywall = () => src('src/screens/PaywallScreen.tsx');

  it('⚠ 가드가 실제로 읽었다', () => {
    expect(paywall()).toContain('구독하고 계속 시험 보기');
  });

  it('🔴 요금제를 미리 골라 두지 않는다 — 전자상거래법 다크패턴 「특정 옵션 사전선택」', () => {
    /*
     * 2025-02-14 개정 · 공정위 지침 2025-10-24. 기본값을 `'yearly'` 로 바꾸는 한 글자가
     * **법 위반**이 된다. 보기에는 친절해져서, 리뷰에서도 그냥 지나가기 쉽다.
     */
    expect(paywall()).toMatch(/useState<SubPlanKind \| null>\(null\)/);
    // 고르기 전에는 버튼이 파는 말을 하지 않는다
    expect(paywall()).toContain("t('요금제를 골라 주세요')");
  });

  it('🔴 가격을 지어내지 않는다 — Play 가 준 것만 쓴다', () => {
    const s = stripComments(paywall());
    // 화면 소스에 가격 숫자가 박혀 있으면 안 된다(나라마다 다르고, 바뀌면 거짓이 된다)
    expect(s).not.toMatch(/39[,.]?000/);
    expect(s).not.toMatch(/4[,.]?900/);
    // 할인율도 글자로 박지 않는다 — 두 가격으로 계산한다
    expect(s).not.toContain('34%');
    expect(s).toContain('savePercent');
  });

  it('🔴 고지가 버튼 **바로 아래** 있다 — 다른 화면에 숨기면 심사에서 걸린다', () => {
    const s = stripComments(paywall());
    const legal = s.indexOf('자동으로 갱신돼요');
    const cta = s.indexOf('구독하기');
    expect(legal).toBeGreaterThan(-1);
    expect(cta).toBeGreaterThan(-1);
    expect(legal).toBeGreaterThan(cta);
    // 🔴 사실 둘이 모두 남아 있어야 한다(KOREAN_WRITING §4.3 — 문체만 바꾸고 사실은 못 뺀다)
    expect(s).toContain('해지해도 결제한 기간 끝까지 쓸 수 있어요');
  });

  it('🚫 「무제한」이라고 쓰지 않는다 — 구독이 여는 것은 판수 제한뿐이다', () => {
    // ⚠ 주석을 걷고 본다. 「쓰지 않는다」고 적은 주석 자신이 걸렸다(2026-10-16)
    expect(stripComments(paywall())).not.toContain('무제한');
  });

  it('🔴 결제가 어긋나는 길을 하나로 접지 않는다', () => {
    const s = stripComments(paywall());
    for (const reason of ['cancelled', 'already-owned', 'not-allowed', 'unavailable']) {
      expect(s).toContain(reason);
    }
    // 🚫 「돈은 나가지 않았어요」라고 단정하지 않는다
    expect(s).not.toContain('돈은 나가지 않');
  });

  it('🔴 「확인 중」이 못 물어본 것을 「아니다」로 읽지 않는다', () => {
    const s = stripComments(paywall());
    expect(s).toContain('pro === true');
    // 오래 걸려도 실패로 보여 주지 않고, 다시 결제하는 길도 주지 않는다
    expect(s).toContain('오래 걸리면 아래 구매 복원을 눌러 주세요');
  });
});

// ── 구독 관리 · 해지 (2026-10-16 · 시안 #21) ────────────────────────────────

describe('🔴 구독 관리 화면이 지키는 것', () => {
  const src = (rel: string) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
  const strip = (t: string) =>
    t.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
  const sub = () => src('src/screens/SubscriptionScreen.tsx');

  it('⚠ 가드가 실제로 읽었다', () => {
    expect(sub()).toContain('구독을 해지할까요?');
  });

  it('🔴 판정 순서 — 유예가 먼저다', () => {
    /*
     * 결제가 실패한 뒤 해지까지 누른 사람은 둘 다 참이다. 「해지 예약」을 보여 주면
     * *"11월 13일까지 쓸 수 있어요"* 라고 말하는데 실제로는 **유예가 끝나는 날 끊긴다.**
     * 마음을 바꿔도 그때는 늦다.
     */
    const s = strip(sub());
    const grace = s.indexOf("return 'grace'");
    const canceled = s.indexOf("return 'canceled'");
    expect(grace).toBeGreaterThan(-1);
    expect(canceled).toBeGreaterThan(grace);
  });

  it('🚫 해지를 붙잡지 않는다 — 확인은 한 번이고 할인을 내밀지 않는다', () => {
    const s = strip(sub());
    // 확인 시트는 하나뿐이다
    expect((s.match(/<ConfirmSheet/g) ?? []).length).toBe(1);
    for (const banned of ['할인', '정말', '잠깐만', '설문']) {
      expect(s).not.toContain(banned);
    }
  });

  it('🔴 금액을 적지 않는다 — 서버가 주지 않고, 지금 파는 가격은 그 사람 가격이 아니다', () => {
    const s = strip(sub());
    expect(s).not.toMatch(/39[,.]?000/);
    expect(s).not.toMatch(/4[,.]?900/);
    expect(s).not.toContain('priceString');
  });

  it('🔴 날짜를 지어내지 않는다 — 못 읽으면 그 줄을 통째로 뺀다', () => {
    const s = strip(sub());
    expect(s).toContain("if (iso === null) return '';");
    expect(s).toContain('Number.isNaN(d.getTime())');
    expect(s).toContain("until !== '' &&");
  });

  it('🚫 해지 버튼을 빨강으로 겁주지 않는다 — 되돌릴 수 있는 일이다', () => {
    const s = strip(sub());
    const at = s.indexOf("t('구독 해지')");
    expect(at).toBeGreaterThan(-1);
    expect(s.slice(Math.max(0, at - 400), at)).not.toContain('danger');
  });
});

