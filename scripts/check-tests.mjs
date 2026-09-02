#!/usr/bin/env node
/**
 * 테스트가 **실제로 돌았는지** 검사한다. `npm test` 가 초록인 것만으로는 부족하다.
 *
 * 🔴 왜 필요한가 — 2026-09-01 에 실제로 당한 것:
 *   기기 식별자를 붙이며 expo-crypto·expo-secure-store 를 추가했는데 jest 목을 안 넣었다.
 *   두 모듈이 expo-modules-core 를 끌어와 **스위트 7개가 로드 단계에서 통째로 죽었다.**
 *   그런데 죽은 스위트의 테스트는 "실패"가 아니라 **세어지지도 않는다** — jest 가
 *
 *       Tests: 26 passed, 26 total        ← 26/26 전부 통과처럼 보인다
 *
 *   로 찍었다. 1.3.1 때 140개였던 것이 26개로 줄었는데 그 숫자를 아무도 대조하지 않았고,
 *   **1.3.3 이 테스트 3분의 2가 죽은 채로 프로덕션에 나갔다.**
 *
 * 그래서 "통과했나"가 아니라 **"몇 개가 돌았나"** 를 바닥값으로 못박는다.
 * ⚠ 검사를 늘리면 이 숫자도 올려야 한다 — **귀찮은 것이 요점이다.** 안 올리면
 *   다음에 스위트가 죽어도 안 걸린다.
 *
 *   node scripts/check-tests.mjs
 */
import { execFileSync } from 'node:child_process';

/**
 * 지금 실제로 **통과하는** 개수. 검사를 추가하면 함께 올린다.
 *
 * 🔴 `numTotalTests` 가 아니라 `numPassedTests` 를 잰다. jest 는 **스킵된 테스트도 total 에 센다** —
 *    누가 `.skip` 하나를 붙이면 total 은 그대로, 실패는 0 이라 바닥값을 그냥 통과한다.
 *    "안 도는 것이 늘었는데 더 초록이 되는" 바로 그 자리다. passed 는 스킵도 로드 실패도 함께 깎인다.
 */
const MIN_PASSING = 141;
const MIN_SUITES = 9;

/**
 * 로드가 안 되는 것을 아는 스위트. **여기 없는 스위트가 죽으면 FAIL 이다.**
 * 🔴 "1개까지는 봐준다" 식으로 개수만 세면 새 고장이 옛 고장 뒤에 숨는다 — 이름으로 잡는다.
 */
const KNOWN_BROKEN = new Map([
  [
    '__tests__/App.test.tsx',
    'preset 이 react-native 라 Expo 네이티브 모듈을 모른다. App 이 전 화면을 끌어와 ' +
      'expo-clipboard·expo-iap 까지 만난다. 해법은 jest-expo preset 도입(회귀 위험 검토 필요) — jest.setup.js 말미 참조',
  ],
]);

const fail = (msg) => {
  console.error(`\x1b[31mFAIL\x1b[0m  ${msg}`);
  process.exitCode = 1;
};

let raw;
try {
  raw = execFileSync('npx', ['jest', '--json', '--silent'], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    shell: process.platform === 'win32',
  });
} catch (e) {
  // jest 는 실패한 스위트가 있으면 exit 1 이지만 stdout 에 JSON 은 그대로 낸다.
  raw = e.stdout ?? '';
  if (!raw.trim()) {
    fail('jest 를 실행하지 못했다 — 출력이 비어 있다.');
    process.exit(1);
  }
}

const r = JSON.parse(raw.slice(raw.indexOf('{')));
const norm = (p) => p.replace(/\\/g, '/').split('my_word/').pop();

const broken = r.testResults
  .filter((t) => t.status !== 'passed' || t.testExecError)
  .map((t) => norm(t.name));
const unexpected = broken.filter((p) => !KNOWN_BROKEN.has(p));
const healed = [...KNOWN_BROKEN.keys()].filter((p) => !broken.includes(p));

const skipped = (r.numPendingTests ?? 0) + (r.numTodoTests ?? 0);

if (r.numPassedTests < MIN_PASSING) {
  fail(
    `통과한 테스트가 줄었다 — ${r.numPassedTests}개 (최소 ${MIN_PASSING}). ` +
      '스위트가 로드 단계에서 죽으면 그 테스트는 세어지지도 않는다. 목이 빠졌는지 본다.',
  );
}
if (r.numTotalTestSuites < MIN_SUITES) {
  fail(`스위트가 줄었다 — ${r.numTotalTestSuites}개 (최소 ${MIN_SUITES}).`);
}
if (r.numFailedTests > 0) fail(`실패한 테스트 ${r.numFailedTests}개.`);
// 🔴 스킵은 "실패가 아니다"라서 조용하다 — 그래서 명시적으로 막는다. 지금 이 저장소에
//    정당한 조건부 스킵은 하나도 없다(환경변수로 갈리는 검사가 없다). 나중에 생기면
//    개수로 봐주지 말고 **이름으로** 등록하는 쪽으로 바꾼다(KNOWN_BROKEN 과 같은 이유).
if (skipped > 0) {
  fail(
    `스킵된 테스트 ${skipped}개 — 스킵은 실패로 잡히지 않고 total 에는 그대로 남는다. ` +
      '되살리거나, 정당한 조건부 스킵이면 이 스크립트에 이름으로 등록한다.',
  );
}
for (const p of unexpected) fail(`알려지지 않은 스위트가 죽었다 — ${p}`);

if (healed.length) {
  console.log(
    `\x1b[33mNOTE\x1b[0m  고쳐진 스위트가 있다: ${healed.join(', ')}\n` +
      '      → KNOWN_BROKEN 에서 지운다. 안 지우면 다시 죽어도 안 걸린다.',
  );
}

const ok = process.exitCode !== 1;
console.log(
  `${ok ? '\x1b[32mALL PASS\x1b[0m' : '\x1b[31mFAILED\x1b[0m'}  ` +
    `통과 ${r.numPassedTests}/${MIN_PASSING} · 스위트 ${r.numPassedTestSuites}/${r.numTotalTestSuites}` +
    (skipped ? ` · \x1b[33m스킵 ${skipped}\x1b[0m` : '') +
    (KNOWN_BROKEN.size ? ` · 알려진 고장 ${KNOWN_BROKEN.size}개` : ''),
);
