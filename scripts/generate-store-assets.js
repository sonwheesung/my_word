const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

// ─── 브랜드 컬러 ───────────────────────────────────────
const BRAND = '#6366F1';
const BRAND_DARK = '#4F46E5';
const BRAND_LIGHT = '#818CF8';
const BRAND_LIGHTER = '#C4B5FD';
const BRAND_LIGHTEST = '#EEF2FF';
const BG = '#F8F9FA';
const SURFACE = '#FFFFFF';
const TEXT_PRIMARY = '#1A1A1A';
const TEXT_SECONDARY = '#6B7280';
const TEXT_TERTIARY = '#9CA3AF';
const BORDER = '#E5E7EB';
const SUCCESS = '#10B981';
const ERROR = '#EF4444';
const WARNING = '#F59E0B';

const STORE_DIR = path.join(__dirname, '..', 'assets', 'store');

// ─── 유틸리티 ─────────────────────────────────────────
function esc(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function roundRect(x, y, w, h, r, fill, stroke = '', strokeWidth = 0, opacity = 1) {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" ry="${r}" fill="${fill}" ${stroke ? `stroke="${stroke}" stroke-width="${strokeWidth}"` : ''} opacity="${opacity}"/>`;
}

function shadow(x, y, w, h, r) {
  return `<rect x="${x + 2}" y="${y + 3}" width="${w}" height="${h}" rx="${r}" ry="${r}" fill="#000" opacity="0.06"/>`;
}

function text(x, y, content, size, color, opts = {}) {
  const {
    anchor = 'start',
    weight = 'normal',
    family = 'Segoe UI, Malgun Gothic, Arial, sans-serif',
    opacity = 1,
    maxWidth = 0,
  } = opts;
  return `<text x="${x}" y="${y}" font-family="${family}" font-size="${size}" font-weight="${weight}" fill="${color}" text-anchor="${anchor}" opacity="${opacity}" ${maxWidth ? `textLength="${maxWidth}" lengthAdjust="spacingAndGlyphs"` : ''}>${esc(content)}</text>`;
}

function circle(cx, cy, r, fill) {
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}"/>`;
}

// ─── 상태바 ───────────────────────────────────────────
function statusBar(w, scale = 1) {
  const h = 44 * scale;
  const fs = 14 * scale;
  const py = 30 * scale;
  return `
    ${roundRect(0, 0, w, h, 0, SURFACE)}
    ${text(w * 0.05, py, '9:41', fs, TEXT_PRIMARY, { weight: '600' })}
    ${text(w * 0.95, py, '100%', fs, TEXT_PRIMARY, { anchor: 'end' })}
    ${circle(w * 0.88, py - 4 * scale, 4 * scale, TEXT_PRIMARY)}
    ${circle(w * 0.84, py - 4 * scale, 3 * scale, TEXT_PRIMARY)}
    ${circle(w * 0.80, py - 4 * scale, 2.5 * scale, TEXT_SECONDARY)}
  `;
}

// ─── 헤더 ─────────────────────────────────────────────
function header(w, y, title, scale = 1, hasBack = false) {
  const h = 56 * scale;
  const fs = 20 * scale;
  const py = y + h * 0.65;
  let svg = `
    ${roundRect(0, y, w, h, 0, SURFACE)}
    <line x1="0" y1="${y + h}" x2="${w}" y2="${y + h}" stroke="${BORDER}" stroke-width="1"/>
  `;
  if (hasBack) {
    const arrowX = 20 * scale;
    const arrowY = y + h / 2;
    const arrowSize = 10 * scale;
    svg += `<path d="M${arrowX + arrowSize} ${arrowY - arrowSize} L${arrowX} ${arrowY} L${arrowX + arrowSize} ${arrowY + arrowSize}" stroke="${BRAND}" stroke-width="${2.5 * scale}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
    svg += text(w / 2, py, title, fs, TEXT_PRIMARY, { anchor: 'middle', weight: '600' });
  } else {
    svg += text(w * 0.05, py, title, fs, TEXT_PRIMARY, { weight: 'bold' });
  }
  return { svg, height: h };
}

// ─── 카드 컴포넌트 ────────────────────────────────────
function card(x, y, w, h, content, scale = 1) {
  return `
    ${shadow(x, y, w, h, 12 * scale)}
    ${roundRect(x, y, w, h, 12 * scale, SURFACE)}
    ${content}
  `;
}

// ─── 홈 화면 ──────────────────────────────────────────
function homeScreen(w, h, scale = 1) {
  const statusH = 44 * scale;
  const { svg: headerSvg, height: headerH } = header(w, statusH, 'My Word', scale);
  let contentY = statusH + headerH + 30 * scale;

  // 인사 카드
  const greetH = 80 * scale;
  const greetPad = 20 * scale;
  const greetContent = `
    ${text(greetPad * 2 + 5 * scale, contentY + 35 * scale, '반갑습니다!', 24 * scale, TEXT_PRIMARY, { weight: 'bold' })}
    ${text(greetPad * 2 + 5 * scale, contentY + 60 * scale, '오늘도 단어를 학습해 보세요', 14 * scale, TEXT_SECONDARY)}
  `;
  const greetCard = card(greetPad, contentY, w - greetPad * 2, greetH, greetContent, scale);

  contentY += greetH + 25 * scale;

  // 메뉴 카드들
  const menuItems = [
    { icon: '+', iconBg: '#6366F1', title: '단어 추가', sub: '새로운 단어를 등록하세요' },
    { icon: 'W', iconBg: '#8B5CF6', title: '단어장', sub: '저장된 단어를 관리하세요' },
    { icon: 'Q', iconBg: '#EC4899', title: '학습하기', sub: '퀴즈로 단어를 복습하세요' },
    { icon: 'S', iconBg: '#10B981', title: '통계', sub: '학습 현황을 확인하세요' },
    { icon: 'M', iconBg: '#F59E0B', title: '마이페이지', sub: '나의 학습 기록' },
  ];

  const cardPad = 20 * scale;
  const cardH = 80 * scale;
  const cardGap = 14 * scale;
  let menuCards = '';

  menuItems.forEach((item, i) => {
    const cy = contentY + i * (cardH + cardGap);
    const iconR = 22 * scale;
    const iconCx = cardPad + 30 * scale;
    const iconCy = cy + cardH / 2;
    const content = `
      ${circle(iconCx, iconCy, iconR, item.iconBg)}
      ${text(iconCx, iconCy + 6 * scale, item.icon, 18 * scale, SURFACE, { anchor: 'middle', weight: 'bold' })}
      ${text(iconCx + iconR + 16 * scale, iconCy - 6 * scale, item.title, 17 * scale, TEXT_PRIMARY, { weight: '600' })}
      ${text(iconCx + iconR + 16 * scale, iconCy + 16 * scale, item.sub, 13 * scale, TEXT_SECONDARY)}
    `;
    menuCards += card(cardPad, cy, w - cardPad * 2, cardH, content, scale);
  });

  return `
    <svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
      ${roundRect(0, 0, w, h, 0, BG)}
      ${statusBar(w, scale)}
      ${headerSvg}
      ${greetCard}
      ${menuCards}
    </svg>
  `;
}

// ─── 단어장 화면 ──────────────────────────────────────
function wordScreen(w, h, scale = 1) {
  const statusH = 44 * scale;
  const { svg: headerSvg, height: headerH } = header(w, statusH, '단어장', scale, true);
  let contentY = statusH + headerH + 16 * scale;
  const pad = 16 * scale;

  // 카테고리 패널 (왼쪽)
  const leftW = w * 0.32;
  const rightW = w - leftW - pad * 3;
  const panelH = h - contentY - pad;

  const categories = [
    { name: '전체', count: 28, active: false },
    { name: '영어', count: 15, active: true },
    { name: '일본어', count: 8, active: false },
    { name: '중국어', count: 5, active: false },
  ];

  let catContent = '';
  categories.forEach((cat, i) => {
    const cy = contentY + 12 * scale + i * (50 * scale);
    const catBg = cat.active ? BRAND_LIGHTEST : 'transparent';
    const catBorder = cat.active ? BRAND : 'transparent';
    const catTextColor = cat.active ? BRAND : TEXT_PRIMARY;
    catContent += `
      ${roundRect(pad + 6 * scale, cy, leftW - 12 * scale, 42 * scale, 8 * scale, catBg, catBorder, cat.active ? 1.5 : 0)}
      ${text(pad + 16 * scale, cy + 27 * scale, cat.name, 15 * scale, catTextColor, { weight: cat.active ? '600' : 'normal' })}
      ${text(pad + leftW - 20 * scale, cy + 27 * scale, String(cat.count), 13 * scale, TEXT_TERTIARY, { anchor: 'end' })}
    `;
  });

  const catPanel = `
    ${shadow(pad, contentY, leftW, panelH, 12 * scale)}
    ${roundRect(pad, contentY, leftW, panelH, 12 * scale, SURFACE)}
    ${catContent}
  `;

  // 검색바
  const searchY = contentY;
  const searchH = 42 * scale;
  const rightX = pad + leftW + pad;

  const searchBar = `
    ${roundRect(rightX, searchY, rightW, searchH, 10 * scale, SURFACE, BORDER, 1)}
    ${text(rightX + 16 * scale, searchY + 27 * scale, '단어 검색...', 14 * scale, TEXT_TERTIARY)}
  `;

  // 단어 카드들
  const words = [
    { word: 'apple', pron: '[ǽpəl]', meaning: '사과' },
    { word: 'beautiful', pron: '[bjúːtəfəl]', meaning: '아름다운' },
    { word: 'knowledge', pron: '[nɑ́lidʒ]', meaning: '지식, 학문' },
    { word: 'practice', pron: '[prǽktis]', meaning: '연습, 실행' },
    { word: 'remember', pron: '[rimémbər]', meaning: '기억하다' },
  ];

  const wordStartY = searchY + searchH + 14 * scale;
  const wordCardH = 72 * scale;
  const wordGap = 10 * scale;
  let wordCards = '';

  words.forEach((item, i) => {
    const wy = wordStartY + i * (wordCardH + wordGap);
    if (wy + wordCardH > h - pad) return;
    const content = `
      ${text(rightX + 16 * scale, wy + 25 * scale, item.word, 17 * scale, TEXT_PRIMARY, { weight: '600' })}
      ${text(rightX + 16 * scale, wy + 45 * scale, item.pron, 12 * scale, BRAND_LIGHT)}
      ${text(rightX + 16 * scale, wy + 63 * scale, item.meaning, 14 * scale, TEXT_SECONDARY)}
    `;
    wordCards += card(rightX, wy, rightW, wordCardH, content, scale);
  });

  return `
    <svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
      ${roundRect(0, 0, w, h, 0, BG)}
      ${statusBar(w, scale)}
      ${headerSvg}
      ${catPanel}
      ${searchBar}
      ${wordCards}
    </svg>
  `;
}

// ─── 퀴즈 화면 ────────────────────────────────────────
function quizScreen(w, h, scale = 1) {
  const statusH = 44 * scale;
  const { svg: headerSvg, height: headerH } = header(w, statusH, '학습하기', scale, true);
  let contentY = statusH + headerH + 20 * scale;
  const pad = 24 * scale;

  // 진행 상황
  const progressText = `
    ${text(pad, contentY + 16 * scale, '3 / 10', 16 * scale, BRAND, { weight: '600' })}
    ${text(w - pad, contentY + 16 * scale, '30%', 14 * scale, TEXT_SECONDARY, { anchor: 'end' })}
  `;
  contentY += 30 * scale;

  // 프로그레스 바
  const barH = 8 * scale;
  const progressBar = `
    ${roundRect(pad, contentY, w - pad * 2, barH, barH / 2, BORDER)}
    ${roundRect(pad, contentY, (w - pad * 2) * 0.3, barH, barH / 2, BRAND)}
  `;
  contentY += barH + 40 * scale;

  // 퀴즈 카드
  const quizCardH = 360 * scale;
  const quizCardW = w - pad * 2;
  const qx = pad;

  // 퀴즈 타입 배지
  const badgeW = 160 * scale;
  const badgeH = 30 * scale;
  const badge = `
    ${roundRect(qx + quizCardW / 2 - badgeW / 2, contentY + 20 * scale, badgeW, badgeH, badgeH / 2, BRAND_LIGHTEST)}
    ${text(qx + quizCardW / 2, contentY + 20 * scale + badgeH * 0.68, '단어 > 뜻', 13 * scale, BRAND, { anchor: 'middle', weight: '600' })}
  `;

  // 질문
  const question = text(qx + quizCardW / 2, contentY + 100 * scale, '다음 단어의 뜻을 입력하세요', 16 * scale, TEXT_SECONDARY, { anchor: 'middle' });

  // 단어 표시
  const wordDisplay = text(qx + quizCardW / 2, contentY + 165 * scale, 'beautiful', 36 * scale, TEXT_PRIMARY, { anchor: 'middle', weight: 'bold' });

  // 발음
  const pronDisplay = text(qx + quizCardW / 2, contentY + 200 * scale, '[bjúːtəfəl]', 14 * scale, BRAND_LIGHT, { anchor: 'middle' });

  // 입력 필드
  const inputY = contentY + 240 * scale;
  const inputH = 50 * scale;
  const inputPad = 30 * scale;
  const inputField = `
    ${roundRect(qx + inputPad, inputY, quizCardW - inputPad * 2, inputH, 10 * scale, SURFACE, BRAND, 2)}
    ${text(qx + inputPad + 16 * scale, inputY + 32 * scale, '답을 입력하세요...', 15 * scale, TEXT_TERTIARY)}
  `;

  // 확인 버튼
  const btnY = inputY + inputH + 20 * scale;
  const btnH = 48 * scale;
  const btnW = quizCardW - inputPad * 2;
  const submitBtn = `
    ${roundRect(qx + inputPad, btnY, btnW, btnH, 10 * scale, BRAND)}
    ${text(qx + inputPad + btnW / 2, btnY + 31 * scale, '확인', 17 * scale, SURFACE, { anchor: 'middle', weight: '600' })}
  `;

  const quizContent = `${badge}${question}${wordDisplay}${pronDisplay}${inputField}${submitBtn}`;
  const quizCard = card(qx, contentY, quizCardW, quizCardH, quizContent, scale);

  return `
    <svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
      ${roundRect(0, 0, w, h, 0, BG)}
      ${statusBar(w, scale)}
      ${headerSvg}
      ${progressText}
      ${progressBar}
      ${quizCard}
    </svg>
  `;
}

// ─── 통계 화면 ────────────────────────────────────────
function statsScreen(w, h, scale = 1) {
  const statusH = 44 * scale;
  const { svg: headerSvg, height: headerH } = header(w, statusH, '통계', scale, true);
  let contentY = statusH + headerH + 20 * scale;
  const pad = 20 * scale;

  // 통계 카드 그리드 (2x2)
  const gridGap = 12 * scale;
  const cardW = (w - pad * 2 - gridGap) / 2;
  const cardH = 100 * scale;

  const stats = [
    { label: '전체 단어', value: '28', color: BRAND, bg: BRAND_LIGHTEST },
    { label: '카테고리', value: '3', color: '#8B5CF6', bg: '#F3E8FF' },
    { label: '정답률', value: '85%', color: SUCCESS, bg: '#D1FAE5' },
    { label: '퀴즈 횟수', value: '42', color: WARNING, bg: '#FEF3C7' },
  ];

  let statsCards = '';
  stats.forEach((s, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const sx = pad + col * (cardW + gridGap);
    const sy = contentY + row * (cardH + gridGap);
    const content = `
      ${circle(sx + 20 * scale, sy + 25 * scale, 8 * scale, s.color)}
      ${text(sx + 16 * scale, sy + 55 * scale, s.value, 30 * scale, s.color, { weight: 'bold' })}
      ${text(sx + 16 * scale, sy + 80 * scale, s.label, 14 * scale, TEXT_SECONDARY)}
    `;
    statsCards += `
      ${shadow(sx, sy, cardW, cardH, 12 * scale)}
      ${roundRect(sx, sy, cardW, cardH, 12 * scale, SURFACE)}
      ${content}
    `;
  });

  contentY += 2 * (cardH + gridGap) + 10 * scale;

  // 정답/오답 카드
  const answerCardH = 60 * scale;
  const answerCardW = (w - pad * 2 - gridGap) / 2;

  const correctCard = `
    ${shadow(pad, contentY, answerCardW, answerCardH, 10 * scale)}
    ${roundRect(pad, contentY, answerCardW, answerCardH, 10 * scale, '#D1FAE5')}
    ${text(pad + 16 * scale, contentY + 25 * scale, '정답', 13 * scale, SUCCESS, { weight: '600' })}
    ${text(pad + 16 * scale, contentY + 48 * scale, '126문제', 18 * scale, SUCCESS, { weight: 'bold' })}
  `;
  const wrongCard = `
    ${shadow(pad + answerCardW + gridGap, contentY, answerCardW, answerCardH, 10 * scale)}
    ${roundRect(pad + answerCardW + gridGap, contentY, answerCardW, answerCardH, 10 * scale, '#FEE2E2')}
    ${text(pad + answerCardW + gridGap + 16 * scale, contentY + 25 * scale, '오답', 13 * scale, ERROR, { weight: '600' })}
    ${text(pad + answerCardW + gridGap + 16 * scale, contentY + 48 * scale, '22문제', 18 * scale, ERROR, { weight: 'bold' })}
  `;

  contentY += answerCardH + 30 * scale;

  // 동기부여 카드
  const motivH = 80 * scale;
  const motivContent = `
    ${text(w / 2, contentY + 35 * scale, '꾸준히 학습하고 계시네요!', 18 * scale, TEXT_PRIMARY, { anchor: 'middle', weight: '600' })}
    ${text(w / 2, contentY + 60 * scale, '정답률이 높아지고 있어요. 이 조자를 유지하세요!', 13 * scale, TEXT_SECONDARY, { anchor: 'middle' })}
  `;
  const motivCard = card(pad, contentY, w - pad * 2, motivH, motivContent, scale);

  contentY += motivH + 30 * scale;

  // 취약 단어 섹션
  const weakTitle = text(pad, contentY + 18 * scale, '취약한 단어', 18 * scale, TEXT_PRIMARY, { weight: 'bold' });
  contentY += 35 * scale;

  const weakWords = [
    { word: 'knowledge', accuracy: '40%', color: ERROR },
    { word: 'practice', accuracy: '55%', color: WARNING },
    { word: 'beautiful', accuracy: '60%', color: WARNING },
  ];

  let weakCards = '';
  weakWords.forEach((ww, i) => {
    const wy = contentY + i * (52 * scale);
    if (wy + 50 * scale > h - 20 * scale) return;
    const content = `
      ${text(pad + 16 * scale, wy + 30 * scale, ww.word, 16 * scale, TEXT_PRIMARY, { weight: '500' })}
      ${roundRect(w - pad - 70 * scale, wy + 12 * scale, 54 * scale, 28 * scale, 14 * scale, ww.color + '20')}
      ${text(w - pad - 43 * scale, wy + 32 * scale, ww.accuracy, 13 * scale, ww.color, { anchor: 'middle', weight: '600' })}
    `;
    weakCards += card(pad, wy, w - pad * 2, 46 * scale, content, scale);
  });

  return `
    <svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
      ${roundRect(0, 0, w, h, 0, BG)}
      ${statusBar(w, scale)}
      ${headerSvg}
      ${statsCards}
      ${correctCard}
      ${wrongCard}
      ${motivCard}
      ${weakTitle}
      ${weakCards}
    </svg>
  `;
}

// ─── 마이페이지 화면 ──────────────────────────────────
function myPageScreen(w, h, scale = 1) {
  const statusH = 44 * scale;
  const { svg: headerSvg, height: headerH } = header(w, statusH, '마이페이지', scale, true);
  let contentY = statusH + headerH + 30 * scale;
  const pad = 24 * scale;

  // 프로필 섹션
  const avatarR = 40 * scale;
  const avatarCx = w / 2;
  const avatarCy = contentY + avatarR;
  const profileSection = `
    ${circle(avatarCx, avatarCy, avatarR + 3, BRAND_LIGHTER)}
    ${circle(avatarCx, avatarCy, avatarR, BRAND)}
    ${text(avatarCx, avatarCy + 14 * scale, 'M', 36 * scale, SURFACE, { anchor: 'middle', weight: 'bold' })}
    ${text(avatarCx, avatarCy + avatarR + 30 * scale, 'My Word 학습자', 20 * scale, TEXT_PRIMARY, { anchor: 'middle', weight: '600' })}
    ${text(avatarCx, avatarCy + avatarR + 55 * scale, '학습 15일째', 14 * scale, TEXT_SECONDARY, { anchor: 'middle' })}
  `;

  contentY = avatarCy + avatarR + 80 * scale;

  // 요약 통계 카드
  const summaryH = 80 * scale;
  const summaryW = w - pad * 2;
  const thirdW = summaryW / 3;
  const summaryItems = [
    { label: '등록 단어', value: '28' },
    { label: '퀴즈 횟수', value: '42' },
    { label: '연속 학습', value: '5일' },
  ];

  let summaryContent = '';
  summaryItems.forEach((item, i) => {
    const sx = pad + thirdW * i + thirdW / 2;
    summaryContent += `
      ${text(sx, contentY + 35 * scale, item.value, 26 * scale, BRAND, { anchor: 'middle', weight: 'bold' })}
      ${text(sx, contentY + 58 * scale, item.label, 13 * scale, TEXT_SECONDARY, { anchor: 'middle' })}
    `;
    if (i < 2) {
      summaryContent += `<line x1="${pad + thirdW * (i + 1)}" y1="${contentY + 15 * scale}" x2="${pad + thirdW * (i + 1)}" y2="${contentY + summaryH - 15 * scale}" stroke="${BORDER}" stroke-width="1"/>`;
    }
  });
  const summaryCard = card(pad, contentY, summaryW, summaryH, summaryContent, scale);

  contentY += summaryH + 30 * scale;

  // 학습 활동 히트맵 타이틀
  const heatmapTitle = text(pad, contentY + 18 * scale, '학습 활동', 18 * scale, TEXT_PRIMARY, { weight: 'bold' });
  contentY += 35 * scale;

  // 히트맵
  const heatmapW = w - pad * 2;
  const heatmapH = 140 * scale;
  const cellSize = Math.min(14 * scale, (heatmapW - 40 * scale) / 15);
  const cellGap = 3 * scale;
  const heatColors = ['#E5E7EB', BRAND_LIGHTEST, '#C4B5FD', BRAND_LIGHT, BRAND];

  let heatmapContent = '';
  const dayLabels = ['일', '월', '화', '수', '목', '금', '토'];
  const startX = pad + 30 * scale;
  const startY = contentY + 25 * scale;

  // 요일 라벨
  for (let d = 0; d < 7; d++) {
    if (d % 2 === 0) {
      heatmapContent += text(pad + 8 * scale, startY + d * (cellSize + cellGap) + cellSize * 0.75, dayLabels[d], 10 * scale, TEXT_TERTIARY, { anchor: 'middle' });
    }
  }

  // 히트맵 셀
  // 시드 기반 의사 랜덤으로 일관된 패턴 생성
  const pattern = [
    [0,0,1,0,2,3,1],
    [0,1,2,0,3,4,0],
    [1,2,1,3,2,4,0],
    [0,1,3,2,4,3,0],
    [1,0,2,4,3,2,1],
    [0,2,3,1,4,3,0],
    [1,1,2,3,2,4,0],
    [0,3,4,2,3,4,1],
    [2,1,3,4,2,3,0],
    [0,2,2,3,4,4,1],
    [1,3,4,2,3,4,0],
    [2,2,3,4,4,3,1],
    [0,1,2,3,4,4,2],
    [1,3,3,4,3,4,0],
    [2,4,3,4,4,4,1],
  ];

  for (let week = 0; week < 15; week++) {
    for (let day = 0; day < 7; day++) {
      const level = pattern[week][day];
      const cx = startX + week * (cellSize + cellGap);
      const cy = startY + day * (cellSize + cellGap);
      heatmapContent += roundRect(cx, cy, cellSize, cellSize, 2 * scale, heatColors[level]);
    }
  }

  const heatmapCard = card(pad, contentY, heatmapW, heatmapH, heatmapContent, scale);
  contentY += heatmapH + 20 * scale;

  // 스트릭 배지
  const streakH = 50 * scale;
  const streakContent = `
    ${circle(pad + 25 * scale, contentY + streakH / 2, 16 * scale, '#FEF3C7')}
    ${text(pad + 25 * scale, contentY + streakH / 2 + 6 * scale, '*', 20 * scale, WARNING, { anchor: 'middle', weight: 'bold' })}
    ${text(pad + 50 * scale, contentY + streakH / 2 + 6 * scale, '5일 연속 학습 중!', 16 * scale, TEXT_PRIMARY, { weight: '600' })}
  `;
  const streakCard = card(pad, contentY, heatmapW, streakH, streakContent, scale);

  return `
    <svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
      ${roundRect(0, 0, w, h, 0, BG)}
      ${statusBar(w, scale)}
      ${headerSvg}
      ${profileSection}
      ${summaryCard}
      ${heatmapTitle}
      ${heatmapCard}
      ${streakCard}
    </svg>
  `;
}

// ─── 그래픽 이미지 (Feature Graphic) ──────────────────
function featureGraphic() {
  const w = 1024;
  const h = 500;

  // 장식 원들
  const decorCircles = `
    ${circle(150, 400, 180, '#4F46E5')}
    ${circle(900, 100, 150, '#818CF8')}
    ${circle(50, 80, 60, '#4F46E5')}
    ${circle(980, 420, 80, '#4F46E5')}
  `;

  // 앱 아이콘 (왼쪽)
  const iconSize = 120;
  const iconX = 160;
  const iconY = h / 2 - iconSize / 2;
  const appIcon = `
    ${roundRect(iconX, iconY, iconSize, iconSize, 28, SURFACE, '', 0, 0.95)}
    <defs>
      <linearGradient id="iconGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" style="stop-color:${BRAND};stop-opacity:1" />
        <stop offset="100%" style="stop-color:${BRAND_DARK};stop-opacity:1" />
      </linearGradient>
    </defs>
    ${roundRect(iconX + 8, iconY + 8, iconSize - 16, iconSize - 16, 22, 'url(#iconGrad)')}
    ${text(iconX + iconSize / 2, iconY + iconSize * 0.6, 'MW', 36, SURFACE, { anchor: 'middle', weight: '900' })}
    ${text(iconX + iconSize / 2, iconY + iconSize * 0.8, 'My Word', 10, SURFACE, { anchor: 'middle', opacity: 0.8 })}
  `;

  // 텍스트 (오른쪽)
  const textX = 340;
  const mainText = `
    ${text(textX, h / 2 - 30, 'My Word', 64, SURFACE, { weight: 'bold' })}
    ${text(textX, h / 2 + 25, '나만의 단어 학습 플랫폼', 24, SURFACE, { opacity: 0.9 })}
    ${text(textX, h / 2 + 65, '단어 저장 · 퀴즈 학습 · 통계 분석', 18, SURFACE, { opacity: 0.7 })}
  `;

  // 작은 기능 카드들 (오른쪽)
  const miniCardX = 700;
  const miniCards = [
    { y: 140, label: '단어 추가', icon: '+', bg: '#4F46E5' },
    { y: 220, label: '퀴즈 학습', icon: 'Q', bg: '#4F46E5' },
    { y: 300, label: '통계 분석', icon: 'S', bg: '#4F46E5' },
  ];

  let miniCardsSvg = '';
  miniCards.forEach((mc) => {
    miniCardsSvg += `
      ${roundRect(miniCardX, mc.y, 220, 55, 12, SURFACE, '', 0, 0.15)}
      ${circle(miniCardX + 30, mc.y + 28, 16, SURFACE + '30')}
      ${text(miniCardX + 30, mc.y + 34, mc.icon, 16, SURFACE, { anchor: 'middle', weight: 'bold' })}
      ${text(miniCardX + 60, mc.y + 34, mc.label, 16, SURFACE, { weight: '500', opacity: 0.95 })}
    `;
  });

  return `
    <svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:${BRAND};stop-opacity:1" />
          <stop offset="50%" style="stop-color:${BRAND_DARK};stop-opacity:1" />
          <stop offset="100%" style="stop-color:#3730A3;stop-opacity:1" />
        </linearGradient>
      </defs>
      ${roundRect(0, 0, w, h, 0, 'url(#bgGrad)')}
      ${decorCircles}
      ${appIcon}
      ${mainText}
      ${miniCardsSvg}
    </svg>
  `;
}

// ─── 메인 실행 ────────────────────────────────────────
async function saveSvg(svgString, filename) {
  await sharp(Buffer.from(svgString)).png().toFile(path.join(STORE_DIR, filename));
  console.log(`  ✓ ${filename}`);
}

async function main() {
  // 출력 디렉토리 생성
  if (!fs.existsSync(STORE_DIR)) {
    fs.mkdirSync(STORE_DIR, { recursive: true });
  }

  console.log('스토어 등록용 에셋 생성 중...\n');

  // ─── 그래픽 이미지 (1024x500) ────────────────────
  console.log('[그래픽 이미지]');
  await saveSvg(featureGraphic(), 'feature-graphic.png');

  // ─── 휴대전화 스크린샷 (1080x1920) ───────────────
  console.log('\n[휴대전화 스크린샷]');
  const phoneW = 1080;
  const phoneH = 1920;
  const phoneScale = 2.5;

  await saveSvg(homeScreen(phoneW, phoneH, phoneScale), 'phone-screenshot-1-home.png');
  await saveSvg(wordScreen(phoneW, phoneH, phoneScale), 'phone-screenshot-2-words.png');
  await saveSvg(quizScreen(phoneW, phoneH, phoneScale), 'phone-screenshot-3-quiz.png');
  await saveSvg(statsScreen(phoneW, phoneH, phoneScale), 'phone-screenshot-4-stats.png');
  await saveSvg(myPageScreen(phoneW, phoneH, phoneScale), 'phone-screenshot-5-mypage.png');

  // ─── 7인치 태블릿 스크린샷 (1200x1920) ──────────
  console.log('\n[7인치 태블릿 스크린샷]');
  const tab7W = 1200;
  const tab7H = 1920;
  const tab7Scale = 2.2;

  await saveSvg(homeScreen(tab7W, tab7H, tab7Scale), 'tablet-7-screenshot-1-home.png');
  await saveSvg(wordScreen(tab7W, tab7H, tab7Scale), 'tablet-7-screenshot-2-words.png');
  await saveSvg(quizScreen(tab7W, tab7H, tab7Scale), 'tablet-7-screenshot-3-quiz.png');
  await saveSvg(statsScreen(tab7W, tab7H, tab7Scale), 'tablet-7-screenshot-4-stats.png');
  await saveSvg(myPageScreen(tab7W, tab7H, tab7Scale), 'tablet-7-screenshot-5-mypage.png');

  // ─── 10인치 태블릿 스크린샷 (1600x2560) ─────────
  console.log('\n[10인치 태블릿 스크린샷]');
  const tab10W = 1600;
  const tab10H = 2560;
  const tab10Scale = 3.0;

  await saveSvg(homeScreen(tab10W, tab10H, tab10Scale), 'tablet-10-screenshot-1-home.png');
  await saveSvg(wordScreen(tab10W, tab10H, tab10Scale), 'tablet-10-screenshot-2-words.png');
  await saveSvg(quizScreen(tab10W, tab10H, tab10Scale), 'tablet-10-screenshot-3-quiz.png');
  await saveSvg(statsScreen(tab10W, tab10H, tab10Scale), 'tablet-10-screenshot-4-stats.png');
  await saveSvg(myPageScreen(tab10W, tab10H, tab10Scale), 'tablet-10-screenshot-5-mypage.png');

  console.log(`\n모든 스토어 에셋 생성 완료!`);
  console.log(`출력 경로: ${STORE_DIR}`);
  console.log(`\n생성된 파일:`);
  console.log(`  - feature-graphic.png (1024x500) : 그래픽 이미지`);
  console.log(`  - phone-screenshot-*.png (1080x1920) : 휴대전화 스크린샷 5장`);
  console.log(`  - tablet-7-screenshot-*.png (1200x1920) : 7인치 태블릿 스크린샷 5장`);
  console.log(`  - tablet-10-screenshot-*.png (1600x2560) : 10인치 태블릿 스크린샷 5장`);
}

main().catch(console.error);
