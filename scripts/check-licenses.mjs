#!/usr/bin/env node
/**
 * **게시 중인 오픈소스 고지가 지금 설치된 것과 맞는지** 검사한다.
 *
 * 🔴 왜 필요한가 — 두 번 당했다:
 *   2026-09-02  1.3.1 때 만든 고지(162개)가 그대로였다. expo-updates·expo-secure-store·
 *               expo-crypto 셋이 **0건**이었고, 재생성하니 176개였다.
 *   2026-09-07  똑같이 반복. expo-notifications 를 넣고 **스토어에 올리기 직전까지** 176개였고,
 *               재생성하니 215개 — 39개가 빠져 있었다.
 *
 * 두 번 다 생성기는 있었고, 그 주석에 "의존성을 바꾸면 다시 돌려라"라고 **적혀 있었다.**
 * 적어 두는 것으로는 안 닫힌다 — 기억하는 사람이 유일한 방어선이면 릴리스마다 진다.
 * (공용 PRE_LAUNCH_CHECK.md 가 "생성기 하나로는 부족하고 드리프트 가드가 있어야 한다"고
 *  적어 둔 자리다. 그 문서가 예고한 대로 두 번째도 놓쳤다.)
 *
 * 🔴 고지의 거짓은 라이선스 위반이다. **스토어에 올리기 전에 돌린다.**
 *
 * ⚠ 이 가드는 대상 선정 규칙을 **베끼지 않는다.** 생성기를 임시 파일로 한 번 돌려
 *   게시본과 바이트 비교한다. 규칙을 베꼈다가 기준이 갈라져 604개 vs 215개로 오경보가
 *   났었다(2026-09-07). 생성기가 진실이고, 가드는 "그 진실과 파일이 같은가"만 본다.
 *   생성기 출력은 이름·버전 정렬이고 타임스탬프가 없어 결정론적이다.
 *
 *   node scripts/check-licenses.mjs
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const NOTICE = 'docs/open-source-licenses.html';
const countPackages = (html) => (html.match(/<details class="pkg"/g) || []).length;
// 줄바꿈만 다른 것(CRLF/LF)으로 실패시키지 않는다 — git 설정에 따라 갈린다.
const normalize = (s) => s.replace(/\r\n/g, '\n');

let tmp;
try {
  tmp = mkdtempSync(join(tmpdir(), 'oss-'));
  const generated = join(tmp, 'generated.html');

  execFileSync('node', ['scripts/generate-oss-licenses.js'], {
    env: { ...process.env, OSS_OUT: generated },
    stdio: 'ignore',
  });

  const current = normalize(readFileSync(NOTICE, 'utf8'));
  const fresh = normalize(readFileSync(generated, 'utf8'));

  if (current === fresh) {
    console.log(`\x1b[32mALL PASS\x1b[0m  고지가 설치본과 일치한다 · 패키지 ${countPackages(fresh)}개`);
  } else {
    console.error(
      `\x1b[31mFAIL\x1b[0m  ${NOTICE} 가 지금 설치된 의존성과 다르다 — ` +
        `**이 고지는 이미 거짓이다.**\n` +
        `      게시본 ${countPackages(current)}개 · 지금 만들면 ${countPackages(fresh)}개\n` +
        `      → node scripts/generate-oss-licenses.js 로 재생성하고 **커밋·푸시**한다.\n` +
        `        (GitHub Pages 는 main 을 서빙하므로 푸시해야 게시본이 바뀐다)`,
    );
    process.exitCode = 1;
  }
} catch (error) {
  console.error(`\x1b[31mFAIL\x1b[0m  검사를 수행하지 못했다: ${error.message}`);
  process.exitCode = 1;
} finally {
  if (tmp) rmSync(tmp, { recursive: true, force: true });
}
