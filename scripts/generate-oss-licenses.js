/**
 * 오픈소스 라이선스 고지 페이지 생성기
 *
 *   node scripts/generate-oss-licenses.js   →   docs/open-source-licenses.html
 *
 * MIT·Apache-2.0·BSD 는 모두 "저작권 고지와 라이선스 전문을 배포물에 포함할 것"을
 * 요구한다. 심사에서 막는 항목은 아니지만 라이선스 자체의 의무이므로 지킨다.
 *
 * ⚠ 의존성을 추가·변경하면 이 스크립트를 다시 돌리고 결과를 커밋해야 한다.
 *
 * 대상 선정 규칙
 *   1. `npm ls --omit=dev --all` 로 프로덕션 의존성 트리를 받는다 (devDependencies 는
 *      번들에 들어가지 않으므로 제외한다)
 *   2. 그중 node_modules 에 **실제로 설치된 것만** 남긴다. optional peer 로 트리에만
 *      올라오고 설치되지 않은 패키지(@amazon-devices/* 등)는 배포물에 없으므로 뺀다
 *   3. 이름·버전 기준으로 정렬한다 — 재생성 시 diff 가 흔들리지 않아야 한다
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const NODE_MODULES = path.join(ROOT, 'node_modules');
// 기본 출력은 게시본이다. `OSS_OUT` 으로 덮어쓸 수 있는 이유는 하나 —
// scripts/check-licenses.mjs 가 **임시 파일로 생성해 게시본과 비교**하기 위해서다.
// 가드가 이 파일의 선정 규칙을 베끼면 두 기준이 갈라져 오경보가 난다(실제로 그렇게 만들었다가 버렸다).
const OUT = process.env.OSS_OUT || path.join(ROOT, 'docs', 'open-source-licenses.html');

/* 앱 버전의 진실은 app.json 이다. package.json 의 version 은 0.0.1 로 방치돼 있어
   그것을 쓰면 "My Word 0.0.1 기준" 이라는 거짓 문구가 찍힌다. */
const APP_VERSION = require(path.join(ROOT, 'app.json')).expo.version;

/** LICENSE 전문이 담겨 있을 법한 파일 이름 (우선순위 순) */
const LICENSE_FILENAMES = [
  'LICENSE', 'LICENSE.md', 'LICENSE.txt', 'LICENCE', 'LICENCE.md', 'LICENCE.txt',
  'license', 'license.md', 'license.txt', 'COPYING', 'COPYING.md',
];

/**
 * 고지에 실을 패키지 — **앱에 실제로 들어가는 것만.**
 *
 * 🔴 **2026-10-13 에 기준이 바뀌었다**(사장님 결정). 그때까지는 `npm ls --omit=dev --all` 로
 *    셌는데, 그 기준은 이 페이지가 스스로 적어 둔 문장(*"앱에 실제로 포함된 프로덕션 의존성"*)과
 *    맞지 않았다 — `@expo/devcert`·`@expo/sudo-prompt` 같은 **내 노트북에서만 도는 빌드 도구**가
 *    섞여 678개가 되고 페이지가 1.1MB 가 된다.
 *
 * 🔴 **그리고 옛 집계에는 버그가 있었다.** 트리를 걷다 이미 본 이름을 만나면 `continue` 해서
 *    **그 자식까지 건너뛰었다.** 같은 패키지가 트리의 두 자리에 나올 때 자식 없는 자리가 먼저
 *    걸리면 그 아래가 통째로 빠진다. 단서는 `react-native-purchases` 를 **더했는데 고지가
 *    221 → 205 로 줄어든 것**이었다 — 늘어나는 방향만 보고 있었다면 못 봤다.
 *    ⚠ `check:licenses` 는 생성기를 다시 돌려 바이트로 대조하므로 **둘이 같이 틀린 채 초록**이었다.
 *
 * 지금은 번들에서 뽑은 목록(`scripts/bundled-packages.json`)을 읽는다.
 * 그 목록을 만드는 방법과 「낡음」을 막는 지문은 `scripts/collect-bundled-packages.mjs` 에 있다.
 *
 * ⚠ **폴백이 없다. 목록이 없거나 지문이 어긋나면 죽는다.** 조용히 옛 값을 쓰는 것이
 *   이 프로젝트가 이미 밟은 함정이다 — *"폴백이 있는 자리는 지우는 것으로 무력화된다"*.
 */
function collectShippedPackages() {
  const manifestPath = path.join(__dirname, 'bundled-packages.json');
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch (error) {
    throw new Error(
      `번들 패키지 목록을 읽을 수 없다 (${manifestPath}).\n` +
        '  → node scripts/collect-bundled-packages.mjs 를 먼저 돌린다.',
    );
  }

  // 🔴 지문 대조 — 의존성이 바뀐 뒤 목록을 다시 뽑지 않았으면 여기서 멈춘다.
  const raw = execSync('npm ls --omit=dev --all --json', {
    cwd: ROOT,
    maxBuffer: 1 << 28,
    stdio: ['ignore', 'pipe', 'ignore'],
    shell: process.platform === 'win32',
  }).toString();
  const tree = JSON.parse(raw);
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
  const fingerprint = crypto
    .createHash('sha256')
    .update([...keys].sort().join('\n'))
    .digest('hex');

  if (fingerprint !== manifest.productionFingerprint) {
    throw new Error(
      '의존성이 바뀐 뒤 번들 패키지 목록을 다시 뽑지 않았다.\n' +
        `  목록이 아는 트리: ${manifest.productionCount}개 (${String(manifest.productionFingerprint).slice(0, 12)}…)\n` +
        `  지금의 트리:      ${keys.size}개 (${fingerprint.slice(0, 12)}…)\n` +
        '  → node scripts/collect-bundled-packages.mjs 를 돌려 목록을 갱신한다.',
    );
  }

  const names = [...new Set([...(manifest.bundled || []), ...(manifest.nativeOnly || [])])].sort();
  if (names.length === 0) {
    throw new Error('번들 패키지 목록이 비어 있다 — 빈 고지를 만들지 않는다.');
  }

  const dirs = manifest.dirs || {};
  const lost = names.filter((name) => !dirs[name]);
  if (lost.length > 0) {
    throw new Error(
      `번들 목록에 설치 경로가 없는 패키지: ${lost.join(', ')}\n` +
        '  → node scripts/collect-bundled-packages.mjs 를 다시 돌린다(옛 형식의 목록이다).',
    );
  }

  return names.map((name) => ({ name, dir: dirs[name] }));
}

/**
 * 🔴 **이름이 아니라 경로를 받는다.** 최상위 `node_modules/<이름>` 을 가정하면 중첩 설치된
 *    패키지를 못 찾고, 옛 생성기는 그런 패키지를 **조용히 빼고** 고지를 만들었다
 *    (2026-10-13 실측: `@expo/cli` · `@react-native/virtualized-lists` 둘).
 *    경로는 `scripts/bundled-packages.json` 의 `dirs` 가 들고 있다.
 */
function readPackageJson(relDir) {
  try {
    return JSON.parse(fs.readFileSync(path.join(ROOT, relDir, 'package.json'), 'utf8'));
  } catch (error) {
    return null;
  }
}

function readLicenseText(relDir) {
  const dir = path.join(ROOT, relDir);
  for (const filename of LICENSE_FILENAMES) {
    const file = path.join(dir, filename);
    try {
      const text = fs.readFileSync(file, 'utf8').trim();
      if (text) return text;
    } catch (error) {
      /* 다음 후보로 넘어간다 */
    }
  }
  return null;
}

function licenseIdOf(pkg) {
  if (!pkg) return 'UNKNOWN';
  if (typeof pkg.license === 'string') return pkg.license;
  if (pkg.license && pkg.license.type) return pkg.license.type;
  if (Array.isArray(pkg.licenses) && pkg.licenses[0] && pkg.licenses[0].type) {
    return pkg.licenses[0].type;
  }
  return 'UNKNOWN';
}

function homepageOf(pkg) {
  if (!pkg) return '';
  if (pkg.homepage) return pkg.homepage;
  const repo = pkg.repository;
  const url = typeof repo === 'string' ? repo : repo && repo.url;
  if (!url) return '';
  return url
    .replace(/^git\+/, '')
    .replace(/\.git$/, '')
    .replace(/^git:\/\//, 'https://')
    .replace(/^ssh:\/\/git@/, 'https://');
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function build() {
  const entries = collectShippedPackages()
    .map(({ name, dir }) => {
      const pkg = readPackageJson(dir);
      /*
       * 🔴 **여기서 조용히 버리지 않는다.** 옛 코드는 `return null` 로 걸러서, 경로를
       *    못 찾은 패키지가 고지에서 **빠진 줄도 모르게** 사라졌다. 번들에 실린 것은
       *    반드시 고지에 있어야 하므로, 못 읽으면 멈춘다.
       */
      if (!pkg) {
        throw new Error(`package.json 을 읽을 수 없다: ${name} (${dir})`);
      }
      return {
        name,
        version: pkg.version || '',
        license: licenseIdOf(pkg),
        homepage: homepageOf(pkg),
        text: readLicenseText(dir),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version));

  const byLicense = new Map();
  for (const entry of entries) {
    byLicense.set(entry.license, (byLicense.get(entry.license) || 0) + 1);
  }
  const summary = [...byLicense.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

  const summaryRows = summary
    .map(([license, count]) => `                <li><code>${escapeHtml(license)}</code> — ${count}</li>`)
    .join('\n');

  const packageBlocks = entries
    .map((entry) => {
      // ⚠ summary 안에 <a> 를 넣지 않는다. 이름을 누르면 펼쳐지는 대신 링크로 나가버린다.
      //   홈페이지 링크는 펼친 안쪽에 따로 둔다.
      const homepageLink = entry.homepage
        ? `            <p class="pkg-home"><a href="${escapeHtml(entry.homepage)}" target="_blank" rel="noopener">${escapeHtml(entry.homepage)}</a></p>\n`
        : '';
      // ⚠ <pre> 안은 공백이 그대로 보이므로 들여쓰기를 넣지 않는다.
      //   보기 좋으라고 정렬하면 라이선스 전문이 실제로 변형된다.
      const body = entry.text
        ? `<pre>${escapeHtml(entry.text)}</pre>`
        : `            <p class="no-text"><span class="lang lang-ko">이 패키지는 배포물에 라이선스 전문 파일을 포함하지 않습니다. 위 저장소 주소에서 확인하실 수 있습니다.</span><span class="lang lang-en">This package does not ship a license text file. You can find it at the repository address above.</span></p>`;
      return `        <details class="pkg">
            <summary><span class="pkg-name">${escapeHtml(entry.name)}</span> <span class="pkg-meta">${escapeHtml(entry.version)} · ${escapeHtml(entry.license)}</span></summary>
${homepageLink}${body}
        </details>`;
    })
    .join('\n');

  return { entries, summary, summaryRows, packageBlocks };
}

const { entries, summary, summaryRows, packageBlocks } = build();

const html = `<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>My Word - 오픈소스 라이선스</title>
    <!-- 이 파일은 scripts/generate-oss-licenses.js 가 생성합니다. 직접 수정하지 마세요. -->
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            line-height: 1.8;
            color: #333;
            background: #f9fafb;
            padding: 20px;
        }
        .container {
            max-width: 800px;
            margin: 0 auto;
            background: #fff;
            border-radius: 12px;
            padding: 40px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.06);
        }
        h1 { font-size: 28px; color: #6366F1; margin-bottom: 8px; }
        .app-name { font-size: 14px; color: #6b7280; margin-bottom: 32px; }
        h2 {
            font-size: 20px;
            color: #1a1a1a;
            margin-top: 32px;
            margin-bottom: 12px;
            padding-bottom: 8px;
            border-bottom: 1px solid #e5e7eb;
        }
        p, li { font-size: 15px; color: #374151; margin-bottom: 8px; }
        ul { padding-left: 24px; margin-bottom: 16px; }
        a { color: #4f46e5; }
        code {
            font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
            font-size: 14px;
            background: #f3f4f6;
            border-radius: 4px;
            padding: 1px 5px;
        }
        .notice {
            background: #f9fafb;
            border-left: 3px solid #6366F1;
            border-radius: 6px;
            padding: 14px 18px;
            margin: 12px 0 16px;
        }
        .notice p:last-child { margin-bottom: 0; }
        .pkg {
            border: 1px solid #e5e7eb;
            border-radius: 8px;
            padding: 10px 14px;
            margin-bottom: 8px;
        }
        .pkg summary { cursor: pointer; font-size: 15px; }
        .pkg-name { font-weight: 600; color: #1a1a1a; }
        .pkg-meta { color: #6b7280; font-size: 13px; }
        .pkg pre {
            font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
            font-size: 12px;
            line-height: 1.6;
            color: #4b5563;
            background: #f9fafb;
            border-radius: 6px;
            padding: 12px 14px;
            margin-top: 10px;
            white-space: pre-wrap;
            word-break: break-word;
        }
        .pkg-home { font-size: 12px; margin-top: 8px; word-break: break-all; }
        .no-text { font-size: 13px; color: #6b7280; margin-top: 10px; }
        .date { font-size: 13px; color: #9ca3af; margin-top: 40px; text-align: center; }
        .langbar { display: none; justify-content: flex-end; gap: 8px; margin-bottom: 20px; }
        html[data-js] .langbar { display: flex; }
        .lang-btn {
            font-family: inherit;
            font-size: 13px;
            line-height: 1.4;
            padding: 6px 14px;
            border: 1px solid #e5e7eb;
            background: #fff;
            color: #6b7280;
            border-radius: 999px;
            cursor: pointer;
        }
        .lang-btn:hover { border-color: #c7d2fe; color: #4f46e5; }
        .lang-btn.is-active { background: #6366F1; border-color: #6366F1; color: #fff; }
        .lang-en { display: none; }
        html[data-lang="en"] .lang-ko { display: none; }
        html[data-lang="en"] .lang-en { display: block; }
        /* 패키지 목록 안의 안내 문구는 인라인이라 block 으로 켜면 줄이 깨진다 */
        .no-text .lang-en { display: none; }
        html[data-lang="en"] .no-text .lang-ko { display: none; }
        html[data-lang="en"] .no-text .lang-en { display: inline; }
    </style>
    <script>
    (function () {
        var KEY = 'myword.legal.lang';
        var root = document.documentElement;
        var lang = null;
        try {
            var m = /[?&]lang=(ko|en)/i.exec(window.location.search);
            if (m) {
                lang = m[1].toLowerCase();
                try { window.localStorage.setItem(KEY, lang); } catch (e) {}
            }
        } catch (e) {}
        if (!lang) {
            try {
                var s = window.localStorage.getItem(KEY);
                if (s === 'ko' || s === 'en') lang = s;
            } catch (e) {}
        }
        if (!lang) {
            var nav = ((navigator.language || navigator.userLanguage || '') + '').toLowerCase();
            lang = nav.indexOf('ko') === 0 ? 'ko' : 'en';
        }
        root.setAttribute('data-js', '1');
        root.setAttribute('data-lang', lang);
        root.lang = lang;
    })();
    </script>
</head>
<body>
    <div class="container">
        <div class="langbar" role="group" aria-label="Language / 언어">
            <button type="button" class="lang-btn" data-set-lang="ko" lang="ko">한국어</button>
            <button type="button" class="lang-btn" data-set-lang="en" lang="en">English</button>
        </div>

        <div class="lang lang-ko" lang="ko">
        <h1>오픈소스 라이선스</h1>
        <p class="app-name">My Word (패키지명: com.myword.front)</p>

        <p>My Word는 아래 오픈소스 소프트웨어를 사용해 만들었습니다. 각 소프트웨어의 저작권은 원저작자에게 있으며, 해당 라이선스가 요구하는 저작권 고지와 라이선스 전문을 여기에 함께 싣습니다.</p>

        <div class="notice">
            <p>목록은 앱에 <strong>실제로 포함되는 패키지</strong>만 담았습니다. 배포되는 자바스크립트 번들에 들어간 패키지와, 자바스크립트는 없지만 안드로이드 코드가 앱에 포함되는 패키지입니다. 개발·빌드·테스트에만 쓰이고 배포물에 들어가지 않는 패키지는 제외했습니다.</p>
            <p>총 <strong>${entries.length}개</strong> 패키지 · 라이선스 종류별 개수:</p>
            <ul>
${summaryRows}
            </ul>
        </div>

        <h2>패키지 목록</h2>
        <p>패키지를 누르면 저장소 주소와 라이선스 전문이 펼쳐집니다.</p>
        </div>

        <div class="lang lang-en" lang="en">
        <h1>Open Source Licenses</h1>
        <p class="app-name">My Word (package: com.myword.front)</p>

        <p>My Word is built with the open source software listed below. Copyright in each package remains with its original authors, and the copyright notices and license texts required by those licenses are reproduced here.</p>

        <div class="notice">
            <p>The list covers only the packages <strong>actually included in the app</strong>: those present in the shipped JavaScript bundle, and those that contribute Android code to the app even without JavaScript. Packages used only for development, build tooling or testing, which are not shipped, are excluded.</p>
            <p><strong>${entries.length}</strong> packages in total · count by license:</p>
            <ul>
${summaryRows}
            </ul>
        </div>

        <h2>Packages</h2>
        <p>Select a package to expand its repository address and full license text.</p>
        </div>

${packageBlocks}

        <p class="date">
            <span class="lang lang-ko">My Word ${APP_VERSION} 기준</span>
            <span class="lang lang-en">As of My Word ${APP_VERSION}</span>
        </p>
    </div>

    <script>
    (function () {
        var KEY = 'myword.legal.lang';
        var TITLES = { ko: 'My Word - 오픈소스 라이선스', en: 'My Word - Open Source Licenses' };
        var root = document.documentElement;
        var buttons = document.querySelectorAll('.lang-btn');

        function apply(lang) {
            if (lang !== 'en') lang = 'ko';
            root.setAttribute('data-lang', lang);
            root.lang = lang;
            if (TITLES[lang]) document.title = TITLES[lang];
            for (var i = 0; i < buttons.length; i++) {
                var active = buttons[i].getAttribute('data-set-lang') === lang;
                buttons[i].className = active ? 'lang-btn is-active' : 'lang-btn';
                buttons[i].setAttribute('aria-pressed', active ? 'true' : 'false');
            }
        }

        for (var i = 0; i < buttons.length; i++) {
            (function (btn) {
                btn.addEventListener('click', function () {
                    try { window.localStorage.setItem(KEY, btn.getAttribute('data-set-lang')); } catch (e) {}
                    apply(btn.getAttribute('data-set-lang'));
                });
            })(buttons[i]);
        }

        apply(root.getAttribute('data-lang'));
    })();
    </script>
</body>
</html>
`;

fs.writeFileSync(OUT, html, 'utf8');
console.log(`생성: ${path.relative(ROOT, OUT)}`);
console.log(`패키지 ${entries.length}개 · 라이선스 ${summary.length}종`);
for (const [license, count] of summary) console.log(`  ${license.padEnd(24)} ${count}`);
