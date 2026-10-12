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
    // 제5-3항. 이 문장이 있어야 단어 밀기가 공시된 것이다
    requires: ['단어와 그 뜻이 회사 서버로 전송되어 보관됩니다'],
  },
  categories: {
    forbids: [],
    // 단어장(카테고리) 이름이 서버로 간다는 말이 본문에 있어야 한다
    requires: ['단어장'],
  },
  results: {
    // 🔴 이 문장이 남아 있는 동안 퀴즈 기록을 밀면 게시된 약속을 어긴다
    forbids: ['퀴즈 기록·설정)은 기기 밖으로 나가지 않습니다'],
    requires: ['퀴즈 기록'],
  },
  exams: {
    forbids: ['시험의 점수와 답안은 기기에만 저장되며 서버로 전송되지 않습니다'],
    requires: ['시험'],
  },
};

describe('🔴 밀기 범위 — 처리방침을 넘지 않는다', () => {
  const text = policyText();

  it('⚠ 가드가 처리방침을 실제로 읽었다', () => {
    expect(text.length).toBeGreaterThan(5000);
    expect(text).toContain('개인정보');
  });

  it('⚠ 지금 처리방침은 퀴즈 기록·시험을 부정하고 있다 (이 가드가 볼 수 있다는 증거)', () => {
    /*
     * 🔴 이 검사가 **가드 자체의 가드**다. 문구가 바뀌어 `forbids` 가 아무것도 못 찾게 되면
     *    아래 본 검사가 **전부 통과**해 버린다 — 0개를 검사하고 초록이 되는 고장이다.
     *    처리방침을 개정해 이 두 문장을 지우면 여기가 먼저 빨개진다. 그때 함께 고친다.
     */
    for (const kind of ['results', 'exams'] as const) {
      if (ENABLED_KINDS.includes(kind)) continue; // 이미 개정됐다면 이 줄은 건너뛴다
      for (const sentence of RULES[kind].forbids) {
        expect(text).toContain(squash(sentence));
      }
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
     */
    expect([...ENABLED_KINDS]).toEqual(['words']);
  });
});
