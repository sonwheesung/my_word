/**
 * 🔴 **서버로 밀는 종류가 개인정보처리방침을 넘지 않는다.**
 *
 * 2026-10-12 사장님 지시로 서버 백업·복구를 만들면서 알아낸 것이다. 서버에 표와 라우트를
 * 다 만들어 놓고 보니, **게시 중인** `docs/privacy-policy.html` 이 이렇게 말하고 있었다:
 *
 * ```
 * 「그 밖의 항목(메모·예문·태그·퀴즈 기록·설정)은 기기 밖으로 나가지 않습니다」
 * 「시험의 점수와 답안은 기기에만 저장되며 서버로 전송되지 않습니다」
 * ```
 *
 * 🔴 **코드를 켜는 것만으로 게시된 약속을 어기게 되는 자리다.** 타입 체크도 테스트도
 *    이런 것을 못 잡는다 — 코드는 완벽히 동작하면서 **문서가 거짓이 된다.**
 *
 * 그래서 이 가드가 `ENABLED_KINDS` 와 처리방침 본문을 **대조한다**:
 *
 * ```
 * 종류를 켰다  →  ① 그 종류를 부정하는 문장이 처리방침에서 사라졌어야 한다
 *                ② 그 종류를 가리키는 말이 처리방침에 들어왔어야 한다
 * ```
 *
 * ⚠ **문구 대조라 처리방침을 고치면 이 가드가 깨진다. 그게 설계다.**
 *   깨지면 사람이 두 문서를 나란히 놓고 보게 된다 — 조용히 어긋나는 것보다 낫다.
 *
 * ⚠ `docs/privacy-policy.html` 은 `*.md` 글롭에 안 걸린다. 정본이 HTML 이다(`.claude/SKILL.md`).
 */

declare const require: (id: string) => any;
declare const __dirname: string;

const fs = require('fs') as { readFileSync(p: string, enc: string): string };
const path = require('path') as { join(...parts: string[]): string };

import { ENABLED_KINDS } from '../src/services/syncService';

const POLICY = 'docs/privacy-policy.html';

/**
 * 처리방침 본문을 **공백까지 없앤 한 줄**로 만든다.
 *
 * 🔴 **태그를 공백으로 바꾸면 안 된다.** 본문이 `<strong>단어와 그 뜻</strong>이 회사 서버로` 처럼
 *    문장 **가운데**에 강조 태그를 쓴다. 태그를 공백으로 치환하면 `뜻 이` 가 되어
 *    `뜻이` 를 찾는 검사가 **멀쩡한 문장을 못 찾는다**(2026-10-12 에 실제로 그렇게 실패했다).
 *
 * ⚠ 공백을 아예 지우는 쪽을 골랐다. 한국어에서 이만큼 긴 문구가 공백만 달라 우연히 맞을 일은
 *   없고, 반대로 **띄어쓰기를 손보는 흔한 교정에 가드가 깨지지 않는다.**
 * ⚠ `&middot;` 등 엔티티는 글자로 되돌린다 — 본문이 가운뎃점을 그렇게 적는다.
 */
function squash(raw: string): string {
  return raw
    .replace(/&middot;/g, '·')
    .replace(/&mdash;/g, '—')
    .replace(/&ldquo;|&rdquo;/g, '"')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, '');
}

function policyText(): string {
  return squash(fs.readFileSync(path.join(__dirname, '..', POLICY), 'utf8'));
}

/**
 * 종류마다 **부정하는 문장**과 **가리키는 말**.
 *
 * 🔴 `words` 에 `forbids` 가 없는 것이 핵심이다 — 단어와 그 뜻은 2026-10-07 개정으로
 *    이미 공시됐다(제5-3항). 그래서 단어만 켜져 있다.
 */
const RULES: Record<string, { forbids: readonly string[]; requires: readonly string[] }> = {
  words: {
    forbids: [],
    // 제5-3항 「전송하는 정보」의 첫 줄
    requires: ['단어 — 단어, 뜻, 단어의 언어, 단어장(카테고리) 번호'],
  },
  categories: {
    // 🔴 2026-10-20 개정 전의 문장. 되살아나면 단어장 밀기가 거짓이 된다
    forbids: ['그 밖의 항목(메모·예문·태그·퀴즈 기록·설정)은 기기 밖으로 나가지 않습니다'],
    requires: ['단어장 — 단어장 이름, 설명, 표시 순서'],
  },
  results: {
    forbids: [
      '퀴즈 기록·설정)은 기기 밖으로 나가지 않습니다',
      '퀴즈 점수와 학습 통계는 전송하지 않습니다',
    ],
    requires: ['퀴즈 결과 — 어떤 단어를 맞혔는지'],
  },
  exams: {
    forbids: ['시험의 점수와 답안은 기기에만 저장되며 서버로 전송되지 않습니다'],
    requires: ['AI 단어 시험 성적표 — 받으신 문제와 이용자의 답안, 점수'],
  },
};

/**
 * 🔴 **이 가드가 아는 최신 개정.** 처리방침을 개정하면 **여기도 같이 고친다.**
 *
 * 본문 대조만으로는 **시행일 전에 켜는 것**을 못 막는다. 개정본을 예고로 먼저 게시하면
 * 본문에는 새 항목이 들어와 있으므로 가드가 *"공시됐다"* 고 읽는데, 약관 제3조는 시행일
 * 7일 전 게시를 정하고 있어 **그 기간에는 아직 효력이 없다.**
 *
 * 🔴 **왜 본문에서 「가장 최근 시행일」을 뽑아 쓰지 않고 상수로 박았나** (2026-10-13 변이에서 잡았다):
 *    본문에서 첫 `개정 시행일` 을 읽게 했더니, 그 줄을 **지우자 가드가 그 다음(옛) 시행일로
 *    조용히 내려앉아 통과**했다. 폴백이 있는 자리는 지우는 것으로 무력화된다.
 *    상수로 두고 **본문과 일치하는지 대조**하면 지우는 것도 새로 더하는 것도 빨개진다.
 */
const LATEST_REVISION = { label: '2026년 10월 20일', at: new Date(2026, 9, 20) };

/** 본문의 **첫** 개정 시행일(목록이 최신순이다) */
function newestEffectiveDate(squashed: string): string | null {
  const m = /개정시행일:(\d{4}년\d{1,2}월\d{1,2}일)/.exec(squashed);
  return m ? m[1] : null;
}

describe('🔴 밀기 범위 — 처리방침을 넘지 않는다', () => {
  const text = policyText();

  it('⚠ 가드가 처리방침을 실제로 읽었다', () => {
    expect(text.length).toBeGreaterThan(5000);
    expect(text).toContain('개인정보');
  });

  it('⚠ 가드 자체의 가드 — toContain 이 아무거나 통과시키지 않는다', () => {
    /*
     * 🔴 **0개를 검사하고 초록이 되는 것이 이 종류 가드의 유일한 고장 방식이다.**
     *    2026-10-12 에는 `forbids` 문장들이 본문에 **있는지**를 확인하는 것으로 그 고장을 막았다.
     *    2026-10-20 개정으로 그 문장들이 사라졌으므로 방법을 바꾼다 — **음성 대조**다.
     *
     * ① 없는 문장은 없다고 나와야 한다(대조 자체가 동작한다는 증거)
     * ② 각 종류의 `requires` 는 우연히 맞을 수 없을 만큼 길어야 한다
     * ③ 제5-3항이 실제로 열려 있어야 한다 — 절이 통째로 사라지면 `requires` 도 같이 사라진다
     */
    expect(text).not.toContain(squash('이 문장은 처리방침에 없습니다 음성 대조용'));
    for (const kind of Object.keys(RULES)) {
      for (const need of RULES[kind].requires) {
        expect(squash(need).length).toBeGreaterThan(12);
      }
    }
    expect(text).toContain(squash('5-3. 학습 데이터의 서버 보관(분석 및 복원 목적)'));
  });

  it('🔴 게시된 처리방침이 네 종류를 전부 공시하고, 부정하는 문장이 없다', () => {
    /*
     * ⚠ **꺼져 있는 종류의 문구도 못 박는다**(2026-10-13 변이에서 잡았다).
     *   아래 「켜져 있으면 공시돼 있어야 한다」는 꺼진 종류를 건너뛰므로, 그 상태에서
     *   본문의 공시 줄을 지워도 **아무것도 안 빨개졌다.** 그러면 나중에 켜는 사람이
     *   "가드가 초록이네" 하고 켠 뒤에야 깨진다.
     *
     * 🔴 2026-10-20 개정으로 **네 종류가 전부 공시됐다.** 그 사실 자체를 여기서 지킨다 —
     *    본문에서 한 줄이라도 빠지면 지금 당장 빨개지고, 사람이 두 문서를 나란히 놓게 된다.
     */
    for (const kind of Object.keys(RULES)) {
      for (const need of RULES[kind].requires) {
        expect(text).toContain(squash(need));
      }
      /*
       * 🔴 **부정하는 문장도 꺼진 종류까지 본다.** 되살아나면 처리방침이 **스스로 모순**된다 —
       *    「전송하는 정보」에 성적표를 적어 놓고 아래에서 「서버로 전송되지 않습니다」라고 말하는 꼴이다.
       *    켤 때까지 기다리면 그 모순이 게시된 채로 남는다.
       */
      for (const banned of RULES[kind].forbids) {
        expect(text).not.toContain(squash(banned));
      }
    }
  });

  it('🔴 시행일이 오지 않은 개정으로는 종류를 켜지 않는다', () => {
    // 🔴 본문의 최신 시행일과 이 가드가 아는 시행일이 **같아야 한다.**
    //    지워도(옛 날짜로 내려앉는다) 새로 더해도(모르는 날짜가 앞에 온다) 여기서 걸린다.
    expect(newestEffectiveDate(text)).toBe(squash(LATEST_REVISION.label));

    if (Date.now() < LATEST_REVISION.at.getTime()) {
      /*
       * 아직 시행 전이다 — 본문에 새 항목이 들어와 있어도 **효력이 없다.**
       * 이 기간에 켤 수 있는 것은 직전 개정으로 이미 공시된 `words` 뿐이다.
       */
      expect([...ENABLED_KINDS]).toEqual(['words']);
    } else {
      // 시행됐다 — 아래 본 검사(본문 대조)가 판정한다. 여기서는 빈 배열만 막는다
      expect(ENABLED_KINDS.length).toBeGreaterThan(0);
    }
  });

  it('켜 둔 종류는 전부 RULES 에 적혀 있다', () => {
    for (const kind of ENABLED_KINDS) {
      expect(Object.keys(RULES)).toContain(kind);
    }
  });

  it.each(['words', 'categories', 'results', 'exams'])(
    '%s — 켜져 있으면 공시돼 있어야 한다',
    (kind) => {
      if (!ENABLED_KINDS.includes(kind as never)) return; // 꺼져 있으면 볼 것이 없다
      const rule = RULES[kind];
      for (const sentence of rule.forbids) {
        expect(text).not.toContain(squash(sentence));
      }
      for (const word of rule.requires) {
        expect(text).toContain(squash(word));
      }
    },
  );

  it('🔴 단어 외에는 아직 켜지 않았다 — 켤 때 이 줄을 같이 고친다', () => {
    /*
     * ⚠ 이 검사는 "지금 상태"를 못 박는다. 처리방침을 개정해 종류를 켜면 **여기가 빨개진다** —
     *   그때 이 기대값을 함께 고치면서 `docs/SERVER_RESTORE_PLAN.md` §8 의 단계를 갱신한다.
     *   기대값을 고치는 손이 설계서를 고치는 손과 같아야 한다는 뜻이다.
     *
     * 🔴 **개정은 2026-10-20 시행이다.** 그날이 지나야 셋을 켤 수 있고, 위 「시행일」 검사가
     *    그 전에 켜는 것을 막는다. 켜는 날 이 줄과 `ENABLED_KINDS` 를 함께 고친다.
     */
    expect([...ENABLED_KINDS]).toEqual(['words']);
  });
});
