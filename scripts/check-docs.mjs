#!/usr/bin/env node
/**
 * 목록을 적은 문서가 코드와 같은 목록을 말하는지 잰다. 셀 수 있는 부분만 본다.
 *
 * 🔴 왜 필요한가. 2026-09-18 에 실제로 본 것:
 *   `docs/screens.md` · `architecture.md` 가 **화면 9개**를 적고 있었다. 실제는 15개였다.
 *   `data-model.md` 는 저장 키 4개(실제 14개), `services-api.md` 는 서비스 4개(실제 13개)였다.
 *   README 는 "화면 13개" 라 적었다. 한 사실에 세 값이었다.
 *   알림 · 간격 복습 · 백업 · 다국어 · 플래시카드가 설계 문서에 통째로 없었다.
 *   타입 검사도 테스트 288개도 문서를 읽지 않으므로 반년 가까이 아무것도 빨개지지 않았다.
 *
 * 그래서 **이름 집합**을 양쪽에서 뽑아 차집합을 본다. 개수만 세면 하나 빠지고 하나 늘 때 못 잡는다.
 *
 * ⚠ 이 가드가 보는 것은 "이름이 문서에 있나" 까지다. 그 화면 설명이 맞는지는 못 본다.
 *   설명의 정확성은 `.claude/skills/doc-consistency` 가 사람 눈으로 본다.
 *
 *   node scripts/check-docs.mjs
 */
import { readFileSync, readdirSync } from 'node:fs';

const read = (p) => readFileSync(p, 'utf8');
const ls = (dir, re) => readdirSync(dir).filter((f) => re.test(f)).sort();

const failures = [];
const passes = [];

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * 코드 쪽 목록이 문서에 전부 나오나.
 * 🔴 부분 문자열로 찾으면 안 된다. `@my_word_srs` 가 `@my_word_srs_old` 안에서 찾아져 초록이 된다
 *    (2026-09-18 회귀 주입에서 실제로 그랬다). 이름 뒤에 식별자 글자가 이어지면 다른 이름이다.
 */
function mustMention(label, docPath, names) {
  const doc = read(docPath);
  const missing = names.filter((n) => !new RegExp(`(?<![A-Za-z0-9_@])${escape(n)}(?![A-Za-z0-9_])`).test(doc));
  if (missing.length) failures.push(`${label}: ${docPath} 에 없다 → ${missing.join(', ')}`);
  else passes.push(`${label}: ${docPath} (${names.length}개)`);
}

/** 문서가 적은 이름이 코드에 실재하나 (지운 것이 문서에 남는 쪽) */
function mustExist(label, docPath, re, actual) {
  const doc = read(docPath);
  const cited = [...new Set([...doc.matchAll(re)].map((m) => m[1]))];
  const ghost = cited.filter((n) => !actual.includes(n));
  if (ghost.length) failures.push(`${label}: ${docPath} 가 없는 것을 적었다 → ${ghost.join(', ')}`);
}

/** 손으로 적은 개수가 실측과 같은가 */
function mustCount(label, docPath, re, actual) {
  const doc = read(docPath);
  const bad = [...doc.matchAll(re)].map((m) => Number(m[1])).filter((n) => n !== actual);
  if (bad.length) failures.push(`${label}: ${docPath} 가 ${bad.join(', ')} 로 적었다 (실제 ${actual})`);
}

// ── 화면 ──
const screens = ls('src/screens', /Screen\.tsx$/);
for (const doc of ['docs/screens.md', 'docs/architecture.md']) {
  mustMention('화면 파일', doc, screens);
  mustExist('화면 파일', doc, /\b([A-Z][A-Za-z]+Screen\.tsx)\b/g, screens);
}
for (const doc of ['README.md', 'docs/architecture.md', 'docs/screens.md']) {
  mustCount('화면 개수', doc, /화면 (\d+)개/g, screens.length);
}

// ── 서비스 ──
const services = ls('src/services', /\.ts$/).map((f) => f.replace(/\.ts$/, ''));
mustMention('서비스', 'docs/services-api.md', [...services.map((s) => `${s}.ts`), 'commonServer']);
mustMention('서비스', 'docs/architecture.md', [...services.map((s) => `${s}.ts`), 'commonServer']);

// ── 컴포넌트 (.web.tsx 는 짝의 대체 구현이라 따로 세지 않는다) ──
const components = ls('src/components', /\.tsx$/).filter((f) => !f.endsWith('.web.tsx'));
mustMention('컴포넌트', 'docs/architecture.md', components);

// ── 저장 키 ──
const srcFiles = [];
(function walk(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = `${dir}/${e.name}`;
    if (e.isDirectory()) walk(p);
    else if (/\.(ts|tsx)$/.test(e.name)) srcFiles.push(p);
  }
})('src');
const keyRe = /['"`](@my_word_[a-z_]+)['"`]/g;
const keys = [...new Set(srcFiles.flatMap((f) => [...read(f).matchAll(keyRe)].map((m) => m[1])))].sort();
mustMention('저장 키', 'docs/data-model.md', keys);
for (const doc of ['docs/data-model.md', 'README.md', 'CLAUDE.md', 'docs/services-api.md']) {
  mustExist('저장 키', doc, /(@my_word_[a-z_]+)/g, keys);
}

// ── 보고 ──
for (const p of passes) console.log(`  ok  ${p}`);
if (failures.length) {
  console.log('');
  for (const f of failures) console.log(`\x1b[31mFAIL\x1b[0m  ${f}`);
  console.log(`\n문서가 코드와 다른 목록을 말한다. 문서를 코드에 맞춘다(설명까지 함께 본다).`);
  process.exit(1);
}
console.log(`\n\x1b[32mALL PASS\x1b[0m  화면 ${screens.length} · 서비스 ${services.length} · 컴포넌트 ${components.length} · 저장 키 ${keys.length}`);
