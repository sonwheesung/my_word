const sharp = require('sharp');
const path = require('path');

const ASSETS_DIR = path.join(__dirname, '..', 'assets');

// ========================================
// 디자인 컨셉: 잔잔한 공부 느낌
// - 부드러운 세이지 그린 그라데이션 배경
// - 미니멀한 펼쳐진 책 (흰색, 부드러운 곡선)
// - 책 중앙에서 자라나는 작은 새싹/잎사귀
// - 따뜻하고 차분한 분위기
// ========================================

const NEW_BRAND_COLOR = '#8CC5A0'; // splash/adaptive 배경색

function createIconSVG(size, options = {}) {
  const { noRadius = false, isFavicon = false } = options;
  const s = size / 1024;
  const rr = noRadius ? 0 : Math.round(size * (isFavicon ? 0.18 : 0.22));

  return `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="${size}" y2="${size}" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#C6E2CF"/>
      <stop offset="45%" stop-color="#A3CFAF"/>
      <stop offset="100%" stop-color="#7AB892"/>
    </linearGradient>
  </defs>

  <!-- 배경 -->
  <rect width="${size}" height="${size}" rx="${rr}" fill="url(#bg)"/>

  <!-- ====== 펼쳐진 책 ====== -->
  <!-- 왼쪽 페이지 -->
  <path d="
    M ${290 * s} ${405 * s}
    C ${290 * s} ${378 * s} ${308 * s} ${365 * s} ${330 * s} ${365 * s}
    L ${496 * s} ${365 * s}
    C ${507 * s} ${365 * s} ${512 * s} ${372 * s} ${512 * s} ${384 * s}
    L ${512 * s} ${675 * s}
    L ${496 * s} ${668 * s}
    L ${330 * s} ${668 * s}
    C ${308 * s} ${668 * s} ${290 * s} ${655 * s} ${290 * s} ${635 * s}
    Z
  " fill="white" opacity="0.88"/>

  <!-- 오른쪽 페이지 -->
  <path d="
    M ${734 * s} ${405 * s}
    C ${734 * s} ${378 * s} ${716 * s} ${365 * s} ${694 * s} ${365 * s}
    L ${528 * s} ${365 * s}
    C ${517 * s} ${365 * s} ${512 * s} ${372 * s} ${512 * s} ${384 * s}
    L ${512 * s} ${675 * s}
    L ${528 * s} ${668 * s}
    L ${694 * s} ${668 * s}
    C ${716 * s} ${668 * s} ${734 * s} ${655 * s} ${734 * s} ${635 * s}
    Z
  " fill="white" opacity="0.94"/>

  <!-- 책등 중앙선 -->
  <line x1="${512 * s}" y1="${376 * s}" x2="${512 * s}" y2="${670 * s}"
    stroke="#8BBF9E" stroke-width="${2.5 * s}" opacity="0.3"/>

  <!-- 왼쪽 페이지 줄 -->
  <line x1="${338 * s}" y1="${425 * s}" x2="${478 * s}" y2="${425 * s}" stroke="#BAD5C4" stroke-width="${3.5 * s}" stroke-linecap="round"/>
  <line x1="${338 * s}" y1="${465 * s}" x2="${458 * s}" y2="${465 * s}" stroke="#BAD5C4" stroke-width="${3.5 * s}" stroke-linecap="round"/>
  <line x1="${338 * s}" y1="${505 * s}" x2="${472 * s}" y2="${505 * s}" stroke="#BAD5C4" stroke-width="${3.5 * s}" stroke-linecap="round"/>
  <line x1="${338 * s}" y1="${545 * s}" x2="${445 * s}" y2="${545 * s}" stroke="#BAD5C4" stroke-width="${3.5 * s}" stroke-linecap="round"/>
  <line x1="${338 * s}" y1="${585 * s}" x2="${468 * s}" y2="${585 * s}" stroke="#BAD5C4" stroke-width="${3.5 * s}" stroke-linecap="round"/>
  <line x1="${338 * s}" y1="${625 * s}" x2="${450 * s}" y2="${625 * s}" stroke="#BAD5C4" stroke-width="${3.5 * s}" stroke-linecap="round"/>

  <!-- 오른쪽 페이지 줄 -->
  <line x1="${546 * s}" y1="${425 * s}" x2="${686 * s}" y2="${425 * s}" stroke="#BAD5C4" stroke-width="${3.5 * s}" stroke-linecap="round"/>
  <line x1="${546 * s}" y1="${465 * s}" x2="${670 * s}" y2="${465 * s}" stroke="#BAD5C4" stroke-width="${3.5 * s}" stroke-linecap="round"/>
  <line x1="${546 * s}" y1="${505 * s}" x2="${680 * s}" y2="${505 * s}" stroke="#BAD5C4" stroke-width="${3.5 * s}" stroke-linecap="round"/>
  <line x1="${546 * s}" y1="${545 * s}" x2="${660 * s}" y2="${545 * s}" stroke="#BAD5C4" stroke-width="${3.5 * s}" stroke-linecap="round"/>
  <line x1="${546 * s}" y1="${585 * s}" x2="${676 * s}" y2="${585 * s}" stroke="#BAD5C4" stroke-width="${3.5 * s}" stroke-linecap="round"/>

  <!-- ====== 새싹 / 잎사귀 ====== -->
  <!-- 줄기 -->
  <path d="
    M ${512 * s} ${365 * s}
    C ${512 * s} ${330 * s} ${514 * s} ${295 * s} ${518 * s} ${258 * s}
  " fill="none" stroke="#437A55" stroke-width="${3.8 * s}" stroke-linecap="round"/>

  <!-- 오른쪽 잎 -->
  <path d="
    M ${517 * s} ${300 * s}
    C ${538 * s} ${270 * s} ${565 * s} ${252 * s} ${585 * s} ${238 * s}
    C ${572 * s} ${262 * s} ${550 * s} ${282 * s} ${520 * s} ${312 * s}
    Z
  " fill="#4E9467" opacity="0.82"/>

  <!-- 왼쪽 잎 -->
  <path d="
    M ${514 * s} ${322 * s}
    C ${494 * s} ${295 * s} ${468 * s} ${278 * s} ${450 * s} ${266 * s}
    C ${466 * s} ${288 * s} ${488 * s} ${306 * s} ${512 * s} ${332 * s}
    Z
  " fill="#5AA878" opacity="0.76"/>

  <!-- 꼭대기 작은 잎 -->
  <path d="
    M ${518 * s} ${258 * s}
    C ${526 * s} ${237 * s} ${540 * s} ${223 * s} ${551 * s} ${212 * s}
    C ${542 * s} ${230 * s} ${532 * s} ${246 * s} ${521 * s} ${265 * s}
    Z
  " fill="#4A8B60" opacity="0.72"/>

  <!-- 잎맥 (미세) -->
  <line x1="${519 * s}" y1="${306 * s}" x2="${552 * s}" y2="${265 * s}"
    stroke="#3A6E4A" stroke-width="${1.2 * s}" opacity="0.2"/>
  <line x1="${513 * s}" y1="${325 * s}" x2="${478 * s}" y2="${290 * s}"
    stroke="#3A6E4A" stroke-width="${1.2 * s}" opacity="0.18"/>

  <!-- 은은한 장식 점 -->
  <circle cx="${370 * s}" cy="${220 * s}" r="${4.5 * s}" fill="white" opacity="0.12"/>
  <circle cx="${660 * s}" cy="${195 * s}" r="${3.5 * s}" fill="white" opacity="0.1"/>
  <circle cx="${710 * s}" cy="${790 * s}" r="${5 * s}" fill="white" opacity="0.08"/>
  <circle cx="${310 * s}" cy="${770 * s}" r="${3.5 * s}" fill="white" opacity="0.1"/>
</svg>`;
}

function createSplashIconSVG(size) {
  const s = size / 1024;

  return `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
  <!-- 스플래시: 컬러 배경 위에 흰색 아이콘 -->

  <!-- 펼쳐진 책 -->
  <path d="
    M ${290 * s} ${420 * s}
    C ${290 * s} ${393 * s} ${308 * s} ${380 * s} ${330 * s} ${380 * s}
    L ${496 * s} ${380 * s}
    C ${507 * s} ${380 * s} ${512 * s} ${387 * s} ${512 * s} ${399 * s}
    L ${512 * s} ${690 * s}
    L ${496 * s} ${683 * s}
    L ${330 * s} ${683 * s}
    C ${308 * s} ${683 * s} ${290 * s} ${670 * s} ${290 * s} ${650 * s}
    Z
  " fill="white" opacity="0.88"/>

  <path d="
    M ${734 * s} ${420 * s}
    C ${734 * s} ${393 * s} ${716 * s} ${380 * s} ${694 * s} ${380 * s}
    L ${528 * s} ${380 * s}
    C ${517 * s} ${380 * s} ${512 * s} ${387 * s} ${512 * s} ${399 * s}
    L ${512 * s} ${690 * s}
    L ${528 * s} ${683 * s}
    L ${694 * s} ${683 * s}
    C ${716 * s} ${683 * s} ${734 * s} ${670 * s} ${734 * s} ${650 * s}
    Z
  " fill="white" opacity="0.94"/>

  <!-- 책등 -->
  <line x1="${512 * s}" y1="${392 * s}" x2="${512 * s}" y2="${685 * s}"
    stroke="white" stroke-width="${2 * s}" opacity="0.25"/>

  <!-- 줄기 -->
  <path d="
    M ${512 * s} ${380 * s}
    C ${512 * s} ${345 * s} ${514 * s} ${310 * s} ${518 * s} ${272 * s}
  " fill="none" stroke="white" stroke-width="${4 * s}" stroke-linecap="round" opacity="0.88"/>

  <!-- 오른쪽 잎 -->
  <path d="
    M ${517 * s} ${316 * s}
    C ${538 * s} ${286 * s} ${565 * s} ${268 * s} ${585 * s} ${254 * s}
    C ${572 * s} ${278 * s} ${550 * s} ${298 * s} ${520 * s} ${328 * s}
    Z
  " fill="white" opacity="0.82"/>

  <!-- 왼쪽 잎 -->
  <path d="
    M ${514 * s} ${338 * s}
    C ${494 * s} ${310 * s} ${468 * s} ${294 * s} ${450 * s} ${282 * s}
    C ${466 * s} ${303 * s} ${488 * s} ${322 * s} ${512 * s} ${348 * s}
    Z
  " fill="white" opacity="0.78"/>

  <!-- 꼭대기 작은 잎 -->
  <path d="
    M ${518 * s} ${272 * s}
    C ${526 * s} ${252 * s} ${540 * s} ${238 * s} ${551 * s} ${226 * s}
    C ${542 * s} ${244 * s} ${532 * s} ${260 * s} ${521 * s} ${279 * s}
    Z
  " fill="white" opacity="0.74"/>
</svg>`;
}

async function main() {
  console.log('잔잔한 공부 느낌 아이콘 생성 중...\n');

  // 1. icon.png (1024x1024) - iOS 앱 아이콘
  console.log('1/4 icon.png (1024x1024)...');
  await sharp(Buffer.from(createIconSVG(1024)))
    .png()
    .toFile(path.join(ASSETS_DIR, 'icon.png'));
  console.log('  ✓ icon.png');

  // 2. adaptive-icon.png (1024x1024) - Android 적응형 아이콘
  console.log('2/4 adaptive-icon.png (1024x1024)...');
  await sharp(Buffer.from(createIconSVG(1024, { noRadius: true })))
    .png()
    .toFile(path.join(ASSETS_DIR, 'adaptive-icon.png'));
  console.log('  ✓ adaptive-icon.png');

  // 3. splash-icon.png (288x288) - 스플래시 아이콘
  console.log('3/4 splash-icon.png (288x288)...');
  await sharp(Buffer.from(createSplashIconSVG(288)))
    .png()
    .toFile(path.join(ASSETS_DIR, 'splash-icon.png'));
  console.log('  ✓ splash-icon.png');

  // 4. favicon.png (48x48) - 웹 파비콘
  console.log('4/4 favicon.png (48x48)...');
  await sharp(Buffer.from(createIconSVG(48, { isFavicon: true })))
    .png()
    .toFile(path.join(ASSETS_DIR, 'favicon.png'));
  console.log('  ✓ favicon.png');

  console.log('\n✓ 모든 아이콘 생성 완료!');
  console.log(`  추천 스플래시/적응형 배경색: ${NEW_BRAND_COLOR}`);
}

main().catch(err => {
  console.error('아이콘 생성 실패:', err);
  process.exit(1);
});
