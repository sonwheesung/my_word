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

  it('🔴 구독자의 remaining(null)을 0 으로 적지 않는다', () => {
    expect(read('src/screens/ExamScreen.tsx')).toContain(
      'if (exam.remaining !== null) await examQuotaService.saveFreeLeft(exam.remaining);',
    );
  });
});
