const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const ASSETS_DIR = path.join(__dirname, '..', 'assets');
const OUT = path.join(ASSETS_DIR, 'notification-icon.png');
const RES_DIR = path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'res');

// app.json 의 expo-notifications 플러그인 `color` 와 **반드시 같아야 한다.**
const ACCENT = '#4E9467';
const COLOR_NAME = 'notification_icon_color';

// ========================================
// 안드로이드 알림 **작은 아이콘**(status bar small icon)
//
// 🔴 앱 아이콘을 그대로 쓰면 안 된다. 안드로이드는 이 아이콘의 **알파 채널만** 읽어
//    불투명한 곳을 전부 흰색으로 칠한다. adaptive-icon.png 은 배경이 꽉 찬 사각형이라
//    그대로 넘기면 상태바에 **흰 사각형 덩어리**가 뜬다(전형적인 "white blob" 버그).
//
// 그래서 같은 브랜드 마크(펼쳐진 책 + 새싹)를 **실루엣 전용으로 다시 그린다**:
//   - 색·그라데이션·투명도 없음 → 전부 흰색 단색. 어차피 알파만 남는다
//   - 페이지 줄(1024 기준 3.5)·잎맥(1.2)·장식 점은 **뺀다** — 96px 로 줄이면
//     1024 의 10.7 단위가 1px 이라 저 굵기는 회색 얼룩이 되거나 사라진다
//   - 남기는 선은 전부 ≥ 24 단위(≈2.2px)로 잡는다
//   - 책등은 선을 긋는 대신 **투명한 틈**으로 표현한다(흰 위에 흰 선은 안 보인다)
//
// generate-icons.js 와 좌표계(1024 뷰박스)를 맞춰 두어 나중에 마크가 바뀌면
// 양쪽을 같이 고치면 된다.
// ========================================

const SIZE = 96; // expo-notifications 플러그인이 이 원본에서 밀도별 리소스를 만든다

function createNotificationIconSVG(size) {
  const s = size / 1024;

  return `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
  <!-- 펼쳐진 책 — 왼쪽 페이지. 아래쪽 중앙 단차는 뺐다(24dp 에서는 얼룩으로만 보인다) -->
  <rect x="${150 * s}" y="${392 * s}" width="${344 * s}" height="${396 * s}"
    rx="${58 * s}" fill="#ffffff"/>

  <!-- 오른쪽 페이지. 책등은 흰 선이 아니라 두 도형 사이의 **투명한 틈**이다 -->
  <rect x="${530 * s}" y="${392 * s}" width="${344 * s}" height="${396 * s}"
    rx="${58 * s}" fill="#ffffff"/>

  <!-- 새싹 — 줄기 -->
  <path d="
    M ${512 * s} ${408 * s}
    C ${512 * s} ${350 * s} ${514 * s} ${296 * s} ${518 * s} ${244 * s}
  " fill="none" stroke="#ffffff" stroke-width="${34 * s}" stroke-linecap="round"/>

  <!-- 새싹 — 잎 두 장. 곡선 두 개로 만든 얇은 칼날 대신 **회전한 타원**으로 둔다.
       칼날 모양은 96px 로 줄이는 순간 1px 밑으로 내려가 사라진다 -->
  <ellipse cx="${610 * s}" cy="${262 * s}" rx="${104 * s}" ry="${50 * s}"
    transform="rotate(-34 ${610 * s} ${262 * s})" fill="#ffffff"/>
  <ellipse cx="${420 * s}" cy="${296 * s}" rx="${92 * s}" ry="${44 * s}"
    transform="rotate(34 ${420 * s} ${296 * s})" fill="#ffffff"/>
</svg>`;
}

async function main() {
  const svg = createNotificationIconSVG(SIZE);

  // density 를 올려 고해상도로 래스터화한 뒤 96 으로 줄인다(계단 현상 방지).
  // 🔴 resize 를 빼면 density 배율 그대로 512px 이 나온다 — 실제로 그렇게 나왔다.
  await sharp(Buffer.from(svg), { density: 384 }).resize(SIZE, SIZE).png().toFile(OUT);
  console.log(`알림 아이콘 생성: ${OUT} (${SIZE}x${SIZE}, 흰색/투명)`);

  // ── 안드로이드 리소스도 여기서 만든다 ────────────────────────────────
  // 🔴 `android/` 는 gitignore 이고 이 프로젝트는 **prebuild 를 돌리지 않는다.**
  //    그래서 expo-notifications 의 config plugin 이 실행되지 않고, 플러그인이
  //    대신 해 줬을 일(밀도별 drawable + 색 리소스)을 아무도 안 한다.
  //    app.json 의 plugins 항목만 믿으면 **아이콘이 조용히 기본값(흰 사각형)이 된다.**
  //    복구를 손에 맡기지 않으려고 이 스크립트가 함께 만든다.
  if (!fs.existsSync(RES_DIR)) {
    console.log('android/ 가 없어 네이티브 리소스는 건너뛴다.');
    return;
  }

  // 플러그인과 **같은 규격**으로 맞춘다(withNotificationsAndroid.js 의 dpiValues).
  // 기준 24dp × 배율, 파일명 notification_icon.png, drawable-<dpi>/ 아래.
  const DPI = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
  for (const [dpi, scale] of Object.entries(DPI)) {
    const px = Math.round(24 * scale);
    const dir = path.join(RES_DIR, `drawable-${dpi}`);
    fs.mkdirSync(dir, { recursive: true });
    // 96px 원본을 줄이지 않고 **SVG 에서 각 크기로 직접 래스터화**한다 — 작은 크기일수록 선명하다.
    await sharp(Buffer.from(svg), { density: 384 }).resize(px, px).png()
      .toFile(path.join(dir, 'notification_icon.png'));
  }
  console.log(`네이티브 아이콘 생성: drawable-{${Object.keys(DPI).join(',')}}/notification_icon.png`);

  // 색 리소스 — 알림 그늘에서 작은 아이콘을 물들이는 강조색.
  // ⚠ 앱 안의 6가지 테마를 따라갈 수 없다(빌드 시점 네이티브 값이다). 그래서
  //    사용자가 고르는 테마색이 아니라 **브랜드 마크의 색**을 쓴다.
  const colorsPath = path.join(RES_DIR, 'values', 'colors.xml');
  let colors = fs.readFileSync(colorsPath, 'utf8');
  if (colors.includes(`name="${COLOR_NAME}"`)) {
    colors = colors.replace(
      new RegExp(`<color name="${COLOR_NAME}">[^<]*</color>`),
      `<color name="${COLOR_NAME}">${ACCENT}</color>`,
    );
  } else {
    colors = colors.replace('</resources>', `  <color name="${COLOR_NAME}">${ACCENT}</color>
</resources>`);
  }
  fs.writeFileSync(colorsPath, colors, 'utf8');
  console.log(`색 리소스 반영: ${COLOR_NAME} = ${ACCENT}`);
}

main().catch((error) => {
  console.error('알림 아이콘 생성 실패:', error);
  process.exit(1);
});
