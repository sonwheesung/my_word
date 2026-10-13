/**
 * 앱에 **실제로 실리는 패키지**만 뽑아 `scripts/bundled-packages.json` 에 적는다.
 *
 * ## 🔴 왜 이 단계가 따로 있나 (2026-10-13 · 사장님 결정)
 *
 * 오픈소스 고지는 *"앱에 실제로 포함된 프로덕션 의존성"* 이라고 **스스로 적고 있다.**
 * 그런데 그걸 `npm ls --omit=dev` 로 세면 그 문장이 거짓이 된다:
 *
 * ```
 * npm ls --omit=dev --all   678개 — @expo/devcert · @expo/sudo-prompt 같은
 *                                 **내 노트북에서만 도는 빌드 도구**까지 센다
 * 버그 있던 옛 집계           205개 — 트리를 덜 걷어서 실제보다 **적었다**
 * 🟢 번들 + 네이티브          108개 — 사용자 폰에 들어가는 것
 * ```
 *
 * 🔴 **적은 쪽이 위반이다.** MIT·Apache-2.0 은 고지 포함을 조건으로 달고, 그 고지는
 *    앱에서 링크되어 게시돼 있다(`common/GAME_ASSET_SOURCING.md` §3.3). 많은 쪽은 위반이
 *    아니지만 페이지가 1.1MB 가 되고 **자기 설명이 거짓**이 된다. 그래서 기준을 바꿨다.
 *
 * ## 세는 방법 — 기계로 확인되는 것만 센다
 *
 * ```
 * ① Hermes 번들의 소스맵에서 node_modules/<패키지> 를 뽑는다  ← 실제로 실린 JS
 * ② 그 중 가장 깊은 중첩을 패키지로 본다(중첩 설치를 부모로 세지 않는다)
 * ③ android/build.gradle 이 있는데 ①에 없는 것을 더한다      ← JS 없이 APK 에 들어가는 것
 * ```
 *
 * ## 🔴 이 목록이 낡는 것을 어떻게 막나
 *
 * 번들을 굽는 데 1~2분이 걸려서 매 검사마다 돌릴 수 없다. 그래서 **의존성 지문**을 함께
 * 적는다 — 프로덕션 의존성 전체의 `이름@버전` 을 정렬해 해시한 값이다.
 * `generate-oss-licenses.js` 가 그 지문을 **지금 트리와 대조**하고, 다르면 **멈춘다.**
 *
 * ⚠ **폴백을 두지 않았다.** 목록이 없거나 지문이 어긋나면 생성기는 에러로 죽는다.
 *   이 프로젝트가 같은 함정을 이미 밟았다 — *"폴백이 있는 자리는 지우는 것으로 무력화된다"*
 *   (`__tests__/syncDisclosure.test.ts`). 조용히 옛 값을 쓰는 것보다 죽는 것이 낫다.
 *
 * ## 쓰는 법
 *
 * ```bash
 * node scripts/collect-bundled-packages.mjs            # 번들을 새로 굽는다
 * node scripts/collect-bundled-packages.mjs --reuse    # dist/ 가 있으면 그걸 쓴다
 * node scripts/generate-oss-licenses.js                # 그 목록으로 고지를 만든다
 * ```
 *
 * 🔴 **의존성을 더하거나 버전을 올릴 때마다 이 스크립트를 다시 돌린다.** 안 돌리면
 *    `npm run check:licenses` 가 지문 불일치로 빨개진다 — 그게 이 설계의 전부다.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const OUT = path.join(HERE, 'bundled-packages.json');
const DIST = path.join(ROOT, 'dist');

const reuse = process.argv.includes('--reuse');
const LINES = /\r?\n/;
const WIN_SEP = /\\/g;

const npmOut = (args) =>
  execSync(`npm ls --omit=dev --all ${args}`, {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
    shell: process.platform === 'win32',
  });

/** `node_modules/a/node_modules/b` 에서 **가장 깊은** 패키지 이름을 꺼낸다. */
const PKG_RE = /node_modules[\\/](@[^\\/]+[\\/][^\\/]+|[^\\/@][^\\/]*)/g;
function deepestPackage(source) {
  const norm = source.replace(WIN_SEP, '/');
  let last = null;
  let m;
  PKG_RE.lastIndex = 0;
  while ((m = PKG_RE.exec(norm)) !== null) last = m[1];
  return last;
}

/**
 * 프로덕션 의존성 전체의 지문.
 *
 * 🔴 **트리를 걷을 때 이미 본 이름이라고 자식까지 건너뛰지 않는다.** 옛 생성기가 그렇게 해서
 *    같은 패키지가 트리에 두 번 나올 때 **자식 없는 자리가 먼저 걸리면 그 아래가 통째로
 *    빠졌다**(2026-10-13 에 패키지를 더했는데 고지가 221 → 205 로 **줄어든 것**이 단서였다).
 *    지문이 그 버그를 물려받으면 의존성이 바뀌어도 지문이 안 바뀌는 날이 생긴다.
 */
function productionFingerprint() {
  const tree = JSON.parse(npmOut('--json'));
  const keys = new Set();
  const walked = new Set();
  (function walk(node) {
    for (const [name, info] of Object.entries(node.dependencies || {})) {
      keys.add(`${name}@${(info && info.version) || '?'}`);
      if (info && info.dependencies && !walked.has(info)) {
        walked.add(info);
        walk(info);
      }
    }
  })(tree);
  const sorted = [...keys].sort();
  return {
    hash: crypto.createHash('sha256').update(sorted.join('\n')).digest('hex'),
    count: sorted.length,
  };
}

/**
 * 패키지 이름 → **실제 설치 경로**.
 *
 * 🔴 **최상위 `node_modules/<이름>` 을 가정하면 안 된다.** 중첩 설치된 패키지는 거기에 없다.
 *    2026-10-13 실측: `@expo/cli` 와 `@react-native/virtualized-lists` 가 그랬고,
 *    옛 생성기는 그 둘을 **조용히 빼고** 고지를 만들었다
 *    (`@react-native/virtualized-lists` 는 FlatList 구현체라 번들에 확실히 들어간다).
 *    그래서 이름이 아니라 **경로**를 적어 둔다.
 */
function installedDirs() {
  const map = new Map();
  for (const line of npmOut('--parseable').split(LINES)) {
    const abs = line.trim();
    if (!abs) continue;
    const norm = abs.replace(WIN_SEP, '/');
    const i = norm.lastIndexOf('/node_modules/');
    if (i < 0) continue;
    const name = norm.slice(i + '/node_modules/'.length);
    // 먼저 나온 것(얕은 쪽)을 쓴다 — 호이스팅된 자리가 우선이다.
    if (!map.has(name)) map.set(name, path.relative(ROOT, abs).replace(WIN_SEP, '/'));
  }
  return map;
}

function exportBundle() {
  if (reuse && fs.existsSync(DIST)) {
    console.log('dist/ 를 그대로 쓴다 (--reuse)');
    return;
  }
  console.log('번들을 굽는다 — 1~2분 걸린다');
  fs.rmSync(DIST, { recursive: true, force: true });
  execSync('npx expo export --platform android --source-maps --clear', {
    cwd: ROOT,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
}

function bundledFromSourceMap() {
  const dir = path.join(DIST, '_expo', 'static', 'js', 'android');
  const maps = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.map')) : [];
  if (maps.length === 0) {
    throw new Error(
      `소스맵이 없다 (${dir}). --source-maps 없이 구웠거나 export 가 실패했다. ` +
        '🔴 여기서 빈 목록으로 넘어가면 고지가 통째로 비면서 초록이 된다.',
    );
  }
  const found = new Set();
  let appModules = 0;
  for (const file of maps) {
    const map = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
    for (const source of map.sources || []) {
      const pkg = deepestPackage(source);
      if (pkg) found.add(pkg);
      else appModules += 1;
    }
  }
  if (found.size === 0) {
    throw new Error('소스맵에서 패키지를 하나도 못 찾았다 — 경로 모양이 바뀌었다.');
  }
  return { bundled: [...found].sort(), appModules, maps };
}

/**
 * JS 가 번들에 없는데 **안드로이드 코드는 APK 에 들어가는** 패키지.
 * 🔴 이쪽을 빼먹으면 `react-native-reanimated` 처럼 네이티브 비중이 큰 라이브러리의
 *    고지가 사라진다 — 번들만 보면 안 보이는 자리다.
 */
function nativeOnly(bundled, dirs) {
  const inBundle = new Set(bundled);
  const out = [];
  for (const [name, rel] of [...dirs.entries()].sort()) {
    if (inBundle.has(name)) continue;
    if (fs.existsSync(path.join(ROOT, rel, 'android', 'build.gradle'))) out.push(name);
  }
  return out;
}

exportBundle();
const { bundled, appModules, maps } = bundledFromSourceMap();
const dirs = installedDirs();
const native = nativeOnly(bundled, dirs);

// 🔴 경로를 못 찾은 패키지가 있으면 **멈춘다.** 그대로 두면 고지에서 조용히 빠진다.
const names = [...new Set([...bundled, ...native])].sort();
const lost = names.filter((n) => !dirs.has(n));
if (lost.length > 0) {
  throw new Error(`설치 경로를 못 찾은 패키지: ${lost.join(', ')}`);
}

const fingerprint = productionFingerprint();

const manifest = {
  // 🔴 사람이 손으로 고치는 파일이 아니다. 아래 명령으로 다시 만든다.
  _generatedBy: 'node scripts/collect-bundled-packages.mjs',
  generatedAt: new Date().toISOString(),
  sourceMaps: maps,
  appModules,
  productionFingerprint: fingerprint.hash,
  productionCount: fingerprint.count,
  bundled,
  nativeOnly: native,
  // 🔴 이름이 아니라 경로를 적는다(중첩 설치 때문 — `installedDirs` 주석).
  dirs: Object.fromEntries(names.map((n) => [n, dirs.get(n)])),
};
fs.writeFileSync(OUT, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

console.log('');
console.log(`앱 자체 모듈      ${appModules}개 (고지 대상 아님)`);
console.log(`번들에 실린 패키지 ${bundled.length}개`);
console.log(`네이티브만        ${native.length}개  ${native.join(' ')}`);
console.log(`→ 고지 대상       ${names.length}개`);
console.log(`프로덕션 트리     ${fingerprint.count}개 (지문 ${fingerprint.hash.slice(0, 12)}…)`);
console.log(`적었다: ${path.relative(ROOT, OUT)}`);
