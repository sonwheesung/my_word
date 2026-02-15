const sharp = require('sharp');
const path = require('path');

const BRAND_COLOR = '#6366F1';
const BRAND_LIGHT = '#818CF8';
const WHITE = '#FFFFFF';
const ASSETS_DIR = path.join(__dirname, '..', 'assets');

async function createIcon(size, filename, options = {}) {
  const { isAdaptive = false, isFavicon = false } = options;

  // SVG 기반 아이콘 생성
  const padding = Math.round(size * (isAdaptive ? 0.25 : 0.15));
  const innerSize = size - padding * 2;
  const fontSize = Math.round(innerSize * 0.38);
  const subFontSize = Math.round(innerSize * 0.13);
  const bookSize = Math.round(innerSize * 0.18);

  const cornerRadius = isFavicon ? Math.round(size * 0.15) : Math.round(size * 0.22);

  const svg = `
    <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:${BRAND_COLOR};stop-opacity:1" />
          <stop offset="100%" style="stop-color:#4F46E5;stop-opacity:1" />
        </linearGradient>
      </defs>
      ${isAdaptive
        ? `<rect width="${size}" height="${size}" fill="url(#bg)"/>`
        : `<rect width="${size}" height="${size}" rx="${cornerRadius}" fill="url(#bg)"/>`
      }
      <!-- 책 아이콘 -->
      <text x="${size / 2}" y="${size * 0.38}"
        font-family="Arial, sans-serif"
        font-size="${bookSize}"
        fill="${WHITE}"
        text-anchor="middle"
        opacity="0.9">📖</text>
      <!-- MW 텍스트 -->
      <text x="${size / 2}" y="${size * 0.62}"
        font-family="Arial Black, Arial, sans-serif"
        font-size="${fontSize}"
        font-weight="900"
        fill="${WHITE}"
        text-anchor="middle"
        letter-spacing="${Math.round(fontSize * 0.05)}">MW</text>
      <!-- 서브 텍스트 -->
      ${!isFavicon ? `
      <text x="${size / 2}" y="${size * 0.75}"
        font-family="Arial, sans-serif"
        font-size="${subFontSize}"
        fill="${WHITE}"
        text-anchor="middle"
        opacity="0.8">My Word</text>
      ` : ''}
    </svg>
  `;

  await sharp(Buffer.from(svg))
    .resize(size, size)
    .png()
    .toFile(path.join(ASSETS_DIR, filename));

  console.log(`  ✓ ${filename} (${size}x${size})`);
}

async function createSplashIcon(size, filename) {
  const svg = `
    <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
      <text x="${size / 2}" y="${size * 0.35}"
        font-family="Arial, sans-serif"
        font-size="${Math.round(size * 0.25)}"
        fill="${WHITE}"
        text-anchor="middle"
        opacity="0.95">📖</text>
      <text x="${size / 2}" y="${size * 0.62}"
        font-family="Arial Black, Arial, sans-serif"
        font-size="${Math.round(size * 0.22)}"
        font-weight="900"
        fill="${WHITE}"
        text-anchor="middle">My Word</text>
      <text x="${size / 2}" y="${size * 0.78}"
        font-family="Arial, sans-serif"
        font-size="${Math.round(size * 0.07)}"
        fill="${WHITE}"
        text-anchor="middle"
        opacity="0.7">나만의 단어장</text>
    </svg>
  `;

  await sharp(Buffer.from(svg))
    .resize(size, size)
    .png()
    .toFile(path.join(ASSETS_DIR, filename));

  console.log(`  ✓ ${filename} (${size}x${size})`);
}

async function main() {
  console.log('앱 아이콘 & 스플래시 에셋 생성 중...\n');

  // 앱 아이콘 (iOS + Android 공용)
  await createIcon(1024, 'icon.png');

  // Android 적응형 아이콘 (foreground)
  await createIcon(1024, 'adaptive-icon.png', { isAdaptive: true });

  // 스플래시 아이콘 (Expo SDK 50+ 방식)
  await createSplashIcon(288, 'splash-icon.png');

  // 웹 파비콘
  await createIcon(48, 'favicon.png', { isFavicon: true });

  console.log('\n모든 에셋 생성 완료!');
}

main().catch(console.error);
