/**
 * 서버 복구 — 서버가 준 줄을 기기 모양으로 옮기는 부분을 전수로 본다.
 *
 * 🔴 이 파일이 지키는 가장 무거운 약속: **복구는 사용자가 고른 순간에만 돈다.**
 *    `syncService`(부팅마다 조용히 도는 쪽)에서 이 서비스를 부르면 FAIL 한다 —
 *    자동 경로가 기기를 덮어쓰는 사고는 조용하고, 사용자는 단어가 사라진 것으로 겪는다.
 *
 * 🔴 두 번째 약속: **빈 것으로 기기를 덮지 않는다.** 서버가 0개를 돌려줬을 때 그대로 덮으면
 *    그건 복구가 아니라 삭제다. 네트워크가 반쯤 되는 상태에서 실제로 일어날 수 있다.
 *
 * ⚠ 서버가 주는 `meanings`·`questions`·`attempts`·`score` 는 **JSON 문자열**이다(서버가
 *   해석하지 않고 그대로 보관한다). 그걸 안 풀면 화면이 `"[\"사과\"]"` 를 뜻으로 보여 준다.
 */

declare const require: (id: string) => any;
declare const __dirname: string;

const fs = require('fs') as {
  readFileSync(p: string, enc: string): string;
  readdirSync(p: string): string[];
  statSync(p: string): { isDirectory(): boolean };
};
const path = require('path') as { join(...parts: string[]): string };

import {
  nextIdFor,
  toCategories,
  toExams,
  toResults,
  toWords,
  RESTORE_KINDS,
  RESTORE_READY,
} from '../src/services/restoreService';
import { ENABLED_KINDS, isEnabled } from '../src/services/syncService';

describe('toWords — 서버가 준 단어를 기기 모양으로', () => {
  it('JSON 문자열로 온 뜻을 푼다', () => {
    const [w] = toWords([
      {
        wordId: 101,
        categoryId: 1,
        word: 'apple',
        meanings: '["사과","애플"]',
        language: 'en',
        createdAt: '2026-10-01T00:00:00.000Z',
        updatedAt: '2026-10-02T00:00:00.000Z',
      },
    ]);
    expect(w.meanings).toEqual(['사과', '애플']);
    expect(w.word).toBe('apple');
    expect(w.language).toBe('en');
  });

  it('배열로 와도 받는다 — 서버 모양이 바뀌어도 깨지지 않는다', () => {
    expect(toWords([{ wordId: 1, categoryId: 1, meanings: ['물'] }])[0].meanings).toEqual(['물']);
  });

  it('⚠ 예문·태그·메모는 빈 값이다 — 서버에 없다', () => {
    const [w] = toWords([{ wordId: 1, categoryId: 1, word: 'a' }]);
    expect(w.examples).toEqual([]);
    expect(w.tags).toEqual([]);
    expect(w.memo).toBe('');
  });

  it('🔴 id 가 없는 줄은 버린다 — 반쯤 복원된 단어를 만들지 않는다', () => {
    expect(toWords([{ word: 'no-id' }, { wordId: 1 }, { wordId: 2, categoryId: 1 }])).toHaveLength(
      1,
    );
  });

  it('🔴 language 가 없으면 키를 아예 안 넣는다', () => {
    const [w] = toWords([{ wordId: 1, categoryId: 1, language: null }]);
    expect('language' in w).toBe(false);
  });

  it('updatedAt 이 없으면 createdAt 으로 메운다 — 밀기 커서가 빈 문자열을 못 쓴다', () => {
    const [w] = toWords([{ wordId: 1, categoryId: 1, createdAt: '2026-01-01T00:00:00.000Z' }]);
    expect(w.updatedAt).toBe('2026-01-01T00:00:00.000Z');
  });

  it('어떤 쓰레기에도 던지지 않는다', () => {
    expect(() => toWords([null, 42, 'x', [], { wordId: 'a' }] as unknown[])).not.toThrow();
    expect(toWords([null, 42, 'x'] as unknown[])).toEqual([]);
  });
});

describe('toCategories', () => {
  it('설명이 비면 키를 안 넣는다', () => {
    const [c] = toCategories([{ categoryId: 1, categoryName: '영어', description: null }]);
    expect('description' in c).toBe(false);
    expect(c.displayOrder).toBe(0);
  });

  it('순서를 그대로 옮긴다', () => {
    const [c] = toCategories([{ categoryId: 2, categoryName: '일본어', displayOrder: 5 }]);
    expect(c).toMatchObject({ categoryId: 2, categoryName: '일본어', displayOrder: 5 });
  });

  it('id 가 없으면 버린다', () => {
    expect(toCategories([{ categoryName: '없음' }])).toEqual([]);
  });
});

describe('toResults', () => {
  it('정답 여부를 불린으로 받는다', () => {
    const rows = toResults([
      { resultId: 1, wordId: 101, isCorrect: true, quizType: 'multiple', takenAt: 'T' },
      { resultId: 2, wordId: 101, isCorrect: false, quizType: 'multiple', takenAt: 'T' },
    ]);
    expect(rows.map((r) => r.isCorrect)).toEqual([true, false]);
  });

  it('🔴 isCorrect 가 문자열이면 오답으로 본다 — 틀린 것을 맞다고 세지 않는다', () => {
    /*
     * 정답률이 부풀는 쪽보다 깎이는 쪽이 덜 나쁘다. 부풀면 사용자가 자기 실력을 잘못 알고,
     * 그 숫자로 복습을 그만둔다(플래시카드 절이 같은 이유로 채점을 거부한다).
     */
    expect(toResults([{ resultId: 1, wordId: 1, isCorrect: 'true', takenAt: 'T' }])[0].isCorrect).toBe(
      false,
    );
  });

  it('⚠ 내가 쓴 답은 서버에 없다 — 키가 아예 없다', () => {
    const [r] = toResults([{ resultId: 1, wordId: 1, takenAt: 'T' }]);
    expect('userAnswer' in r).toBe(false);
    expect('correctAnswer' in r).toBe(false);
    expect('word' in r).toBe(false);
  });

  it('quizType 이 없으면 unknown — 통계가 키로 쪼개다 빈 문자열을 만들지 않는다', () => {
    expect(toResults([{ resultId: 1, wordId: 1, takenAt: 'T' }])[0].quizType).toBe('unknown');
  });
});

describe('toExams — 회차가 진실이다', () => {
  it('JSON 문자열 셋을 전부 푼다', () => {
    const [e] = toExams([
      {
        examId: 'e1',
        language: 'en',
        takenAt: 'T',
        questions: '[{"q":"1"}]',
        attempts: '[{"score":{"correct":3}}]',
        score: '{"correct":3,"total":5}',
      },
    ]) as Array<Record<string, unknown>>;
    expect(e.questions).toEqual([{ q: '1' }]);
    expect(e.attempts).toEqual([{ score: { correct: 3 } }]);
    expect(e.score).toEqual({ correct: 3, total: 5 });
  });

  it('깨진 JSON 이면 빈 값 — 성적표 한 판 때문에 복구가 멈추지 않는다', () => {
    const [e] = toExams([{ examId: 'e1', questions: '{{{', score: 'nope' }]) as Array<
      Record<string, unknown>
    >;
    expect(e.questions).toEqual([]);
    expect(e.score).toEqual({});
  });

  it('examId 가 없으면 버린다', () => {
    expect(toExams([{ language: 'en' }])).toEqual([]);
  });
});

describe('🔴 nextIdFor — 이 한 줄을 틀리면 조용히 망가진다', () => {
  it('셋 중 가장 큰 id + 1', () => {
    expect(
      nextIdFor(
        [{ wordId: 10 }] as never,
        [{ categoryId: 777 }] as never,
        [{ resultId: 120 }] as never,
      ),
    ).toBe(778);
  });

  it('🔴 퀴즈 결과의 id 도 센다 — 같은 카운터를 쓴다', () => {
    /*
     * `resultId` 를 빼고 세면 다음에 추가하는 단어가 이미 쓰인 id 를 받고,
     * **기존 퀴즈 결과가 그 새 단어에 붙는다.** 정답률이 엉뚱한 단어에 표시되고 오류는 안 난다.
     */
    expect(nextIdFor([{ wordId: 3 }] as never, [], [{ resultId: 5000 }] as never)).toBe(5001);
  });

  it('전부 비면 1', () => {
    expect(nextIdFor([], [], [])).toBe(1);
  });
});

// ── 🔴 소스를 훑어 규칙을 기계로 지킨다 ─────────────────────────────────────

const read = (rel: string): string => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');

/** `src/` 아래 모든 .ts · .tsx 를 레포 기준 경로로 돌려준다(가드가 파일을 놓치지 않게) */
const listSources = (): string[] => {
  const out: string[] = [];
  const walk = (rel: string): void => {
    for (const name of fs.readdirSync(path.join(__dirname, '..', rel))) {
      const next = rel + '/' + name;
      if (fs.statSync(path.join(__dirname, '..', next)).isDirectory()) walk(next);
      else if (/\.tsx?$/.test(name)) out.push(next);
    }
  };
  walk('src');
  return out;
};
const stripComments = (src: string): string =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/\/\/[^\n]*/g, (m) => ' '.repeat(m.length));

describe('🔴 복구는 자동으로 돌지 않는다 (소스 훑기)', () => {
  it('⚠ 가드가 실제로 읽었다', () => {
    expect(read('src/services/restoreService.ts')).toContain('export const restoreService');
    expect(read('src/services/syncService.ts')).toContain('export const syncService');
  });

  it('🔴 밀기 쪽이 복구를 부르지 않는다', () => {
    const src = stripComments(read('src/services/syncService.ts'));
    expect(src).not.toContain('restoreService');
    expect(src).not.toContain('syncPull');
    expect(src).not.toContain('syncCounts');
  });

  it('🔴 복구는 받아서 조립만 한다 — 기기에 쓰지 않는다', () => {
    /*
     * 2026-10-13: 여기 있던 `apply()`(= `backupService.restore` 한 줄)를 지웠다.
     * 부르는 곳이 0건이었고, 남아 있으면 다음 사람이 그걸 부르면서 **안전 사본과
     * 재시작을 같이 건너뛴다.** 쓰는 자리는 설정 화면의 `runRestore` 하나다.
     */
    const src = stripComments(read('src/services/restoreService.ts'));
    for (const banned of [
      'backupService.restore',
      'backupRepo',
      'writeRaw',
      'wordStorage',
      'categoryStorage',
    ]) {
      expect(src).not.toContain(banned);
    }
  });

  it('🔴 빈 것으로 기기를 덮지 않는다', () => {
    const src = stripComments(read('src/services/restoreService.ts'));
    expect(src).toContain("reason: 'empty'");
  });

  it('🔴 당기는 루프에 상한이 있다 — 서버가 커서를 잘못 줘도 멈춘다', () => {
    const src = stripComments(read('src/services/restoreService.ts'));
    expect(src).toMatch(/MAX_PAGES\s*=\s*\d+/);
    expect(src).toContain('page < MAX_PAGES');
    // 커서가 앞으로 가지 않으면 멈춘다
    expect(src).toContain('res.nextAfter <= after');
  });
});

// ── 🔴 D 단계: 복구 화면이 안전 사본을 건너뛸 수 없게 한다 (2026-10-13) ───────────

const SETTINGS = 'src/screens/SettingsScreen.tsx';

describe('🔴 복구 화면 (소스 훑기)', () => {
  it('⚠ 가드가 실제로 읽었다 — 빈 파일을 지키며 초록이 되지 않는다', () => {
    const src = read(SETTINGS);
    expect(src.length).toBeGreaterThan(5000);
    expect(src).toContain('handleServerRestore');
    expect(src).toContain('restoreService.fetchAll');
  });

  it('🔴 복구를 부르는 곳은 이 화면 하나다 — 자동으로 도는 길이 없다', () => {
    /*
     * 가장 무서운 사고는 **자동 경로가 언젠가 기기를 덮어쓰는 것**이고, 그 사고는 조용하다.
     * 그래서 부르는 자리를 소스 전체에서 센다. 부팅·동기화·화면 복귀 어디에도 없어야 한다.
     */
    const found = listSources()
      .filter((rel) => rel !== 'src/services/restoreService.ts')
      .filter((rel) => stripComments(read(rel)).includes('restoreService'));
    expect(found).toEqual([SETTINGS]);
  });

  it('🔴 덮어쓰기 직전에 안전 사본을 남긴다 — 자리로 잰다', () => {
    /*
     * ⚠ 「파일에 writeSafetyCopy 가 있다」로는 부족하다. 그 호출이 **쓰기보다 뒤에**
     *   있어도 통과해 버린다. 그래서 위치로 본다(오늘 아침 await 가드와 같은 교훈).
     */
    const src = stripComments(read(SETTINGS)).replace(/\s+/g, '');
    const safety = src.indexOf('backupFile.writeSafetyCopy()');
    const write = src.indexOf('backupService.restore(');
    expect(safety).toBeGreaterThanOrEqual(0);
    expect(write).toBeGreaterThan(safety);
  });

  it('🔴 서버 복구와 백업 복원이 같은 쓰기 함수를 쓴다 — 두 벌이면 한쪽만 고쳐진다', () => {
    const src = stripComments(read(SETTINGS));
    // 쓰는 자리는 하나뿐이다
    expect(src.split('backupService.restore(').length - 1).toBe(1);
    // 서버 쪽도 그 자리로 들어간다
    expect(src).toMatch(/serverCandidate\)\s*void runRestore\(serverCandidate\)/);
  });

  it('⚠ 받기에 실패하면 기기를 건드리지 않는다', () => {
    const src = stripComments(read(SETTINGS)).replace(/\s+/g, '');
    expect(src).toContain('if(!got.ok){showToast(describeRestoreFail(got.reason)');
    // 실패 분기가 쓰기보다 앞이다
    expect(src.indexOf('if(!got.ok)')).toBeLessThan(src.indexOf('runRestore(got.backup)'));
  });

  it('🔴 못 되돌리는 것을 버튼 위에서 말한다 — 누른 뒤에 알게 하지 않는다', () => {
    const src = read(SETTINGS);
    expect(src).toMatch(/note=\{t\('예문 · 태그 · 메모[^']*'\)\}/);
  });

  it('잃을 것이 없으면 묻지 않는다 — 백업 복원과 같은 규칙', () => {
    const src = stripComments(read(SETTINGS)).replace(/\s+/g, '');
    const rule = "current.words===0&&current.categories===0&&current.quizResults===0";
    expect(src.split(rule).length - 1).toBe(2); // 백업 파일 · 서버 둘 다
  });

  it('서버가 설정돼 있지 않으면 줄을 띄우지 않는다 — 영원히 실패할 버튼을 두지 않는다', () => {
    const src = stripComments(read(SETTINGS)).replace(/\s+/g, '');
    expect(src).toContain("setServerCounts('off')");
    expect(src).toContain("serverCounts==='off'?null:(");
  });
});

// ── 🔴 서버 사본 지우기 — 게시된 처리방침이 약속한 길 (2026-10-13) ──────────────

describe('🔴 서버에 보관된 내용 지우기 (소스 훑기)', () => {
  it('⚠ 가드가 실제로 읽었다', () => {
    expect(read(SETTINGS)).toContain('handleEraseServer');
  });

  it('🔴 되돌릴 수 없으므로 확인을 받는다 — danger 로', () => {
    const src = stripComments(read(SETTINGS)).replace(/\s+/g, '');
    expect(src).toContain('visible={confirmErase}');
    expect(src).toContain('tone="danger"');
    // 줄을 누르면 바로 지우지 않는다. 시트를 연다
    expect(src).toContain('onPress={()=>setConfirmErase(true)}');
    expect(src).not.toContain('onPress={()=>voidhandleEraseServer()}');
  });

  it('🔴 장부를 함께 비운다 — 안 비우면 새 식별자의 서버가 영원히 빈 채로 남는다', () => {
    /*
     * 지운 뒤 다음 부팅은 **새 주체**를 만든다. 그런데 장부가 "이미 다 올렸다"고 적혀
     * 있으면 `pickChanged` 가 아무것도 안 고르고, 그 기기는 복구 수단을 잃은 채로 돈다.
     * 되감기가 잡아 주기는 하지만 **저절로 되는 것에 기대지 않는다.**
     */
    const src = stripComments(read(SETTINGS)).replace(/\s+/g, '');
    const del = src.indexOf('commonServer.deleteAccount()');
    const reset = src.indexOf('syncService.saveState(EMPTY_STATE)');
    expect(del).toBeGreaterThanOrEqual(0);
    expect(reset).toBeGreaterThan(del); // 성공한 뒤에 비운다
  });

  it('🔴 기기는 건드리지 않는다 — 서버 사본만 지운다', () => {
    const src = stripComments(read(SETTINGS));
    const body = src.slice(
      src.indexOf('const handleEraseServer'),
      src.indexOf('const handleExportBackup'),
    );
    expect(body.length).toBeGreaterThan(200);
    for (const banned of ['clearAllData', 'backupService.restore', 'wordRepo', 'Updates.reload']) {
      expect(body).not.toContain(banned);
    }
  });
});

// ── 🔴 복구가 **삭제**가 되는 자리 (2026-10-13 실물에서 잡았다) ────────────────────

describe('🔴 서버가 일부만 들고 있으면 복구를 내놓지 않는다', () => {
  it('RESTORE_KINDS 는 네 종류 전부다 — 하나라도 빠지면 그 종류가 지워진다', () => {
    expect([...RESTORE_KINDS].sort()).toEqual(['categories', 'exams', 'results', 'words']);
  });

  it('🔴 판정이 밀기와 같은 한 줄에 묶여 있다 — 따로 기억할 것을 만들지 않는다', () => {
    expect(RESTORE_READY).toBe(RESTORE_KINDS.every(isEnabled));
  });

  it('⚠ 지금은 단어만 켜져 있으므로 복구가 꺼져 있다 (10-20 에 함께 켜진다)', () => {
    /*
     * 🔴 10-20 에 `ENABLED_KINDS` 를 넷으로 고치는 순간 이 검사가 빨개진다. 그게 목적이다 —
     *    그날 이 줄과 `SERVER_RESTORE_PLAN.md` §8 을 **같은 커밋에서** 고치게 만든다.
     */
    expect([...ENABLED_KINDS]).toEqual(['words']);
    expect(RESTORE_READY).toBe(false);
  });

  it('🔴 줄을 가리는 것과 별개로, 누르는 순간 다시 센다', () => {
    /*
     * 한 종류의 밀기만 실패해 있어도 같은 사고가 난다. 켜고 끄는 판정 하나에 기대지 않는다.
     */
    const src = stripComments(read(SETTINGS)).replace(/\s+/g, '');
    expect(src).toContain('current.categories>0&&got.counts.categories===0');
    expect(src).toContain('current.quizResults>0&&got.counts.results===0');
    // 그 검사가 쓰기보다 앞이다
    expect(src.indexOf('got.counts.categories===0')).toBeLessThan(
      src.indexOf('runRestore(got.backup)'),
    );
  });

  it('🔴 준비가 안 됐으면 줄 자체를 안 띄운다', () => {
    const src = stripComments(read(SETTINGS)).replace(/\s+/g, '');
    expect(src).toContain("serverCounts==='off'||!RESTORE_READY?null:(");
  });
});

/*
 * ─────────── 🔴 구독을 켜는 날 함께 고쳐야 하는 자리 (2026-10-13) ───────────
 *
 * `common/GLOBAL_DATA_COMPLIANCE.md` §6.1 이 요구한다 — **구독이 있으면 「계정 삭제 ≠ 구독
 * 해지」를 별도로 안내해야 한다.** 지금 확인 시트는 광고 제거만 말하고 **구독을 말하지 않는다.**
 *
 * 🔴 지금은 그게 맞다. 구독을 **살 길이 아직 없다**(페이월·결제 코드가 없다).
 *    문제는 **켜는 날 이 줄을 잊는 것**이고, 잊으면 돈을 내는 사람이 「지우면 해지된다」고
 *    믿은 채 누른다. 그 사고는 조용하다 — 결제는 계속 나가고 앱은 구독자로 안 본다.
 *
 * ⚠ 그래서 **기억에 맡기지 않고 조건부로 막는다.** 아래 테스트는 지금 초록이고,
 *   **구독을 사는 길이 생기는 순간 빨개진다.** 주석이 아니라 가드여야 하는 이유다.
 */
describe('🔴 구독을 살 수 있게 되면 지우기 시트가 구독을 말해야 한다', () => {
  /** 구독을 사는 길이 생겼는지 — 페이월 화면이나 구독 구매 호출 중 하나라도 있으면 생긴 것이다 */
  const subscriptionSellable = (): string[] => {
    const signals: string[] = [];
    const screens = path.join(__dirname, '..', 'src', 'screens');
    for (const file of fs.readdirSync(screens)) {
      if (/paywall|subscri|구독/i.test(file)) signals.push(`화면 ${file}`);
    }
    /*
     * 🔴 **보는 파일을 늘렸다**(2026-10-16). 전에는 `PurchaseContext.tsx` 한 곳만 봤는데,
     *    그날 구독 결제를 **`subscriptionService.ts` 에** 깔았더니 **가드가 안 울렸다.**
     *    지켜야 할 일이 실제로 일어났는데 초록이었다. 이 종류 가드의 유일한 고장 방식이다.
     */
    for (const rel of ['src/contexts/PurchaseContext.tsx', 'src/services/subscriptionService.ts']) {
      const src = stripComments(read(rel));
      for (const call of ['requestSubscription', 'purchasePackage', 'getSubscriptions', "'subs'"]) {
        if (src.includes(call)) signals.push(`결제 호출 ${call}`);
      }
    }
    return signals;
  };

  it('⚠ 가드가 실제로 읽었다 — 시트 문구를 찾을 수 있다', () => {
    expect(stripComments(read(SETTINGS))).toContain('서버에서 지워져요');
  });

  /*
   * 🔴 **2026-10-16 에 이 가드의 모양이 바뀌었다.**
   *    전에는 「살 길이 생기면 **무조건** 던진다」였다. 그때는 그게 맞았다 — 시트에 무엇을
   *    적을지 정해지지 않았으니 **사람을 불러 세우는 것**이 일이었다.
   *    이제 시안 #24 가 승인돼 시트가 구독을 말한다. 그래서 **판정하는 가드**로 바꾼다.
   */
  it('🔴 구독을 살 길이 생겼으면 지우기 시트가 구독을 말한다', () => {
    const sheet = stripComments(read(SETTINGS));
    const signals = subscriptionSellable();
    if (signals.length === 0) {
      // 아직 팔 길이 없다. 시트가 구독을 말하지 않는 것이 맞다.
      expect(sheet.includes('구독')).toBe(false);
      return;
    }
    // 🔴 「말한다」로는 모자라다. **무엇을 말하는가**를 본다
    const need: Array<[string, string]> = [
      ['결제가 멈추지 않는다는 사실', '구독 결제는 멈추지 않아요'],
      ['어디서 멈추는지', 'Play 스토어에서 해지'],
      ['거기로 가는 길', 'Play 구독 관리 열기'],
    ];
    const missing = need.filter((x) => !sheet.includes(x[1])).map((x) => x[0]);
    expect(missing.length === 0 ? '' : '시트에 빠진 것: ' + missing.join(' / ')).toBe('');
  });

  it('🚫 구독 안내를 구독자가 아닌 사람에게 보여 주지 않는다', () => {
    // 구독이 없는 사람에게 해지 이야기를 하면 헷갈린다(시안 #24)
    const sheet = stripComments(read(SETTINGS));
    const at = sheet.indexOf('구독 결제는 멈추지 않아요');
    expect(at).toBeGreaterThan(-1);
    expect(sheet.slice(Math.max(0, at - 700), at)).toContain('proActive &&');
  });

  it('🚫 무료 시험 횟수가 돌아온다는 말을 시트에 적지 않는다', () => {
    // 적으면 「지우면 무료 10회가 다시 생겨요」라는 광고가 된다(시안 #24)
    const sheet = stripComments(read(SETTINGS));
    expect(/무료[\s\S]{0,12}(횟수|시험)[\s\S]{0,14}(돌아|다시)/.test(sheet)).toBe(false);
  });
});
