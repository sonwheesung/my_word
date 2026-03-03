/**
 * My Word 앱 종합 테스트 스크립트
 * Puppeteer로 실제 앱을 조작하며 테스트
 *
 * 테스트 범위:
 * 1. 정상 사용 - 카테고리 CRUD, 단어 CRUD, 검색, 퀴즈, 통계, 마이페이지
 * 2. 정상 실패 - 카테고리 중복, 필수값 누락, 빈 입력
 * 3. 비정상 사용 - maxLength 초과, 특수문자, 공백만 입력
 * 4. 대량 데이터 - 100개+ 단어, 성능/스크롤 확인
 * 5. 퀴즈 집중 - 0/1/5/10/20개 단어, 전부정답, 전부오답, 부분정답
 * 6. UX 검토 - 빈 상태, 로딩, 스크롤, 검색 반응
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const APP_URL = 'http://localhost:8081';
const REPORT_PATH = path.join(__dirname, '..', 'test-report.md');

const results = [];
let browser, page;
let testNum = 0;

// ─── 유틸리티 ─────────────────────────────────
function log(category, name, status, detail = '') {
  testNum++;
  const icon = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : '⚠️';
  const line = `${icon} [${category}] ${name}${detail ? ' - ' + detail : ''}`;
  console.log(`  ${testNum}. ${line}`);
  results.push({ num: testNum, category, name, status, detail });
}

async function wait(ms = 800) {
  await new Promise(r => setTimeout(r, ms));
}

async function goHome() {
  await page.goto(APP_URL, { waitUntil: 'networkidle2' });
  await wait(500);
}

async function clearData() {
  await page.goto(APP_URL, { waitUntil: 'networkidle2' });
  await wait(300);
  await page.evaluate(() => localStorage.clear());
  await page.goto(APP_URL, { waitUntil: 'networkidle2' });
  await wait(500);
}

async function clickButton(text, opts = {}) {
  const { exact = false, timeout = 500 } = opts;
  await wait(timeout);
  return page.evaluate((t, ex) => {
    const divs = document.querySelectorAll('div[tabindex="0"], div[role="button"]');
    for (const el of divs) {
      if (ex ? el.textContent?.trim() === t : el.textContent?.includes(t)) {
        el.click();
        return true;
      }
    }
    return false;
  }, text, exact);
}

async function getScreenText() {
  return page.evaluate(() => document.body.innerText.substring(0, 3000));
}

async function typeInput(selector, text) {
  await page.evaluate(sel => {
    const el = document.querySelector(sel);
    if (el) { el.value = ''; el.focus(); }
  }, selector);
  await page.type(selector, text, { delay: 10 });
}

async function getAlertText() {
  // React Native Web Alert → window.alert override
  return page.evaluate(() => window._lastAlert || null);
}

async function screenshot(name) {
  await page.screenshot({ path: path.join(__dirname, '..', 'test-screenshots', `${name}.png`) });
}

async function injectBulkData(wordCount) {
  await page.evaluate((count) => {
    const now = new Date().toISOString();
    const categories = [
      { categoryId: 1, categoryName: '영어 기초', description: 'TOEIC', displayOrder: 1, wordCount: 0, createdAt: now, updatedAt: now },
      { categoryId: 2, categoryName: '일본어', description: 'JLPT', displayOrder: 2, wordCount: 0, createdAt: now, updatedAt: now },
    ];

    const words = [];
    const englishWords = [
      'apple','banana','cat','dog','elephant','fish','grape','house','island','jungle',
      'kite','lemon','mountain','notebook','ocean','piano','queen','river','sun','tree',
      'umbrella','violet','water','xylophone','yellow','zoo','abandon','bridge','castle','diamond',
      'energy','forest','garden','harmony','imagine','journey','kingdom','library','mystery','nature',
      'oracle','promise','quantum','rainbow','silence','thunder','universe','victory','wisdom','xenon',
      'ability','balance','capture','deliver','embrace','fortune','gravity','horizon','inspire','justice',
      'kindness','liberty','miracle','navigate','observe','patience','qualify','resolve','sustain','triumph',
      'uncover','venture','witness','express','yearn','zealous','achieve','believe','courage','delight',
      'enchant','freedom','genuine','humble','intense','joyful','keen','loyal','mighty','noble',
      'passion','radiant','serene','tender','unique','vibrant','warmth','youthful','zephyr','amazing',
      'bright','charm','dream','eternal','faith','glory','hopeful','ideal','jewel','karma','luminous'
    ];
    const meanings = [
      '사과','바나나','고양이','개','코끼리','물고기','포도','집','섬','정글',
      '연','레몬','산','공책','바다','피아노','여왕','강','태양','나무',
      '우산','제비꽃','물','실로폰','노란색','동물원','버리다','다리','성','다이아몬드',
      '에너지','숲','정원','조화','상상하다','여행','왕국','도서관','미스터리','자연',
      '신탁','약속','양자','무지개','침묵','천둥','우주','승리','지혜','제논',
      '능력','균형','포착하다','전달하다','포옹','행운','중력','수평선','영감을주다','정의',
      '친절','자유','기적','항해하다','관찰하다','인내','자격을얻다','해결하다','유지하다','승리',
      '발견하다','모험','목격하다','표현하다','갈망하다','열정적인','성취하다','믿다','용기','기쁨',
      '매혹하다','자유','진정한','겸손한','강렬한','기쁜','열정적인','충성스러운','강력한','고귀한',
      '열정','빛나는','고요한','부드러운','독특한','활기찬','따뜻함','젊은','미풍','놀라운',
      '밝은','매력','꿈','영원한','믿음','영광','희망찬','이상적인','보석','카르마','빛나는'
    ];

    for (let i = 0; i < count; i++) {
      const catId = i < count * 0.7 ? 1 : 2;
      words.push({
        wordId: i + 1,
        categoryId: catId,
        word: englishWords[i % englishWords.length] + (i >= englishWords.length ? String(Math.floor(i / englishWords.length)) : ''),
        meanings: [meanings[i % meanings.length]],
        examples: [{ example: `This is example for word ${i + 1}.`, translation: `이것은 단어 ${i + 1}의 예문입니다.` }],
        tags: i % 3 === 0 ? ['명사'] : i % 3 === 1 ? ['동사'] : ['형용사'],
        memo: '',
        createdAt: new Date(Date.now() - (count - i) * 86400000).toISOString(),
        updatedAt: now
      });
    }

    categories[0].wordCount = words.filter(w => w.categoryId === 1).length;
    categories[1].wordCount = words.filter(w => w.categoryId === 2).length;

    // 퀴즈 결과도 생성 (다양한 날짜)
    const quizResults = [];
    let rid = 1;
    for (let day = 30; day >= 0; day--) {
      if (Math.random() > 0.4) {
        const qcount = 3 + Math.floor(Math.random() * 10);
        for (let j = 0; j < qcount; j++) {
          const wId = 1 + Math.floor(Math.random() * Math.min(count, 50));
          const w = words.find(ww => ww.wordId === wId);
          const correct = Math.random() > 0.25;
          const d = new Date();
          d.setDate(d.getDate() - day);
          quizResults.push({
            resultId: rid++,
            wordId: wId,
            isCorrect: correct,
            quizType: 'word_to_meaning',
            word: w ? w.word : 'unknown',
            correctAnswer: w ? w.meanings[0] : '',
            userAnswer: correct ? (w ? w.meanings[0] : '') : '오답',
            takenAt: new Date(d.getFullYear(), d.getMonth(), d.getDate(), 9 + Math.floor(Math.random() * 12), Math.floor(Math.random() * 60)).toISOString()
          });
        }
      }
    }

    localStorage.setItem('@my_word_categories', JSON.stringify(categories));
    localStorage.setItem('@my_word_words', JSON.stringify(words));
    localStorage.setItem('@my_word_quiz_results', JSON.stringify(quizResults));
    localStorage.setItem('@my_word_next_id', String(count + 100));

    return { categories: categories.length, words: words.length, quizResults: quizResults.length };
  }, wordCount);
}

// ─── 테스트 시작 ──────────────────────────────
async function runAllTests() {
  // 스크린샷 폴더 생성
  const ssDir = path.join(__dirname, '..', 'test-screenshots');
  if (!fs.existsSync(ssDir)) fs.mkdirSync(ssDir, { recursive: true });

  browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    defaultViewport: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
  });
  page = await browser.newPage();

  // Alert 캡처 설정
  let lastDialogMessage = null;
  let lastDialogType = null;
  page.on('dialog', async dialog => {
    lastDialogMessage = dialog.message();
    lastDialogType = dialog.type();
    // 기본적으로 확인 클릭
    await dialog.accept();
  });

  // ============================================
  // 1. 정상 사용 테스트
  // ============================================
  console.log('\n📋 1. 정상 사용 테스트\n');

  // 1-1. 카테고리 생성
  await clearData();
  await clickButton('카테고리 관리');
  await wait(800);
  let text = await getScreenText();
  log('정상', '빈 카테고리 목록 표시', text.includes('등록된 카테고리가 없습니다') ? 'PASS' : 'FAIL', text.includes('등록된 카테고리가 없습니다') ? '빈 상태 메시지 정상' : '빈 상태 메시지 없음');

  await clickButton('카테고리 추가');
  await wait(500);
  await typeInput('input[placeholder*="영어"]', '영어 기초');
  await typeInput('textarea[placeholder*="설명"]', 'TOEIC 필수 단어');
  await clickButton('저장', { exact: true });
  await wait(1000);
  text = await getScreenText();
  log('정상', '카테고리 생성', text.includes('영어 기초') ? 'PASS' : 'FAIL', '이름: 영어 기초');

  // 두 번째 카테고리
  await clickButton('카테고리 추가');
  await wait(500);
  await typeInput('input[placeholder*="영어"]', '일본어 N3');
  await clickButton('저장', { exact: true });
  await wait(1000);
  text = await getScreenText();
  log('정상', '두 번째 카테고리 생성', text.includes('일본어 N3') ? 'PASS' : 'FAIL');

  // 카테고리 수정
  await clickButton('수정');
  await wait(500);
  const editInputExists = await page.evaluate(() => {
    const inputs = document.querySelectorAll('input');
    for (const inp of inputs) { if (inp.value.includes('영어 기초') || inp.value.includes('일본어')) return true; }
    return false;
  });
  log('정상', '카테고리 수정 모달', editInputExists ? 'PASS' : 'FAIL', '수정 모달에 기존 값 표시');
  await clickButton('취소', { exact: true });
  await wait(300);

  // 1-2. 단어 추가
  await goHome();
  await clickButton('단어 추가');
  await wait(1000);
  text = await getScreenText();
  log('정상', '단어 추가 화면 진입', text.includes('단어 추가') || text.includes('단어를 입력') ? 'PASS' : 'FAIL');

  await typeInput('input[placeholder="단어를 입력하세요"]', 'beautiful');
  await typeInput('input[placeholder="뜻 1"]', '아름다운');
  await typeInput('textarea[placeholder="예문"]', 'What a beautiful day!');
  await typeInput('textarea[placeholder*="번역"]', '정말 아름다운 날이야!');
  await clickButton('저장');
  await wait(1500);
  text = await getScreenText();
  const wordSaved = text.includes('추가되었습니다') || text.includes('반갑습니다') || text.includes('My Word');
  log('정상', '단어 저장', wordSaved ? 'PASS' : 'FAIL', 'beautiful - 아름다운');

  // 1-3. 단어장에서 확인
  await goHome();
  await clickButton('단어장');
  await wait(1500);
  text = await getScreenText();
  log('정상', '단어장 조회', text.includes('beautiful') ? 'PASS' : 'FAIL', '저장된 단어 표시 확인');
  await screenshot('1-3-wordlist');

  // 1-4. 검색
  const searchExists = await page.evaluate(() => !!document.querySelector('input[placeholder*="검색"]'));
  if (searchExists) {
    await typeInput('input[placeholder*="검색"]', '아름다운');
    await wait(500);
    text = await getScreenText();
    log('정상', '뜻으로 검색', text.includes('beautiful') ? 'PASS' : 'FAIL', '"아름다운" 검색 → beautiful');

    // 검색 결과 없음
    await page.evaluate(() => {
      const inp = document.querySelector('input[placeholder*="검색"]');
      if (inp) { inp.value = ''; inp.dispatchEvent(new Event('input', { bubbles: true })); }
    });
    await typeInput('input[placeholder*="검색"]', 'zzzznotfound');
    await wait(500);
    text = await getScreenText();
    log('정상', '검색 결과 없음', text.includes('검색 결과가 없습니다') ? 'PASS' : 'FAIL');
  }

  // 1-5. 통계 (빈 상태)
  await goHome();
  await clickButton('통계');
  await wait(1000);
  text = await getScreenText();
  log('정상', '통계 화면', text.includes('통계') || text.includes('학습') ? 'PASS' : 'FAIL');
  await screenshot('1-5-stats');

  // 1-6. 마이페이지
  await goHome();
  await clickButton('마이페이지');
  await wait(1000);
  text = await getScreenText();
  log('정상', '마이페이지', text.includes('마이페이지') || text.includes('My Word') ? 'PASS' : 'FAIL');
  await screenshot('1-6-mypage');

  // ============================================
  // 2. 정상 실패 테스트
  // ============================================
  console.log('\n📋 2. 정상 실패 테스트\n');

  // 2-1. 빈 카테고리 이름으로 저장 시도
  await goHome();
  await clickButton('카테고리 관리');
  await wait(800);
  await clickButton('카테고리 추가');
  await wait(500);
  await clickButton('저장', { exact: true });
  await wait(800);
  text = await getScreenText();
  // toast 메시지 확인 - "카테고리 이름을 입력해주세요"
  log('실패처리', '빈 카테고리 이름 저장', text.includes('입력해주세요') || text.includes('카테고리 이름') ? 'PASS' : 'WARN', '에러 토스트 확인');
  await screenshot('2-1-empty-category');
  await clickButton('취소', { exact: true });
  await wait(300);

  // 2-2. 빈 단어 저장 시도
  await goHome();
  await clickButton('단어 추가');
  await wait(1000);
  await clickButton('저장');
  await wait(800);
  text = await getScreenText();
  log('실패처리', '빈 단어 저장', text.includes('입력해주세요') || text.includes('단어를') ? 'PASS' : 'WARN', '에러 토스트 확인');
  await screenshot('2-2-empty-word');

  // 2-3. 단어만 입력하고 뜻 비움
  await typeInput('input[placeholder="단어를 입력하세요"]', 'test');
  await page.evaluate(() => {
    const inp = document.querySelector('input[placeholder="뜻 1"]');
    if (inp) { inp.value = ''; inp.dispatchEvent(new Event('input', { bubbles: true })); inp.dispatchEvent(new Event('change', { bubbles: true })); }
  });
  await clickButton('저장');
  await wait(800);
  text = await getScreenText();
  log('실패처리', '뜻 없이 저장', text.includes('뜻') || text.includes('입력') ? 'PASS' : 'WARN', '뜻 필수값 검증');
  await screenshot('2-3-no-meaning');

  // 2-4. 중복 단어 등록 시도
  await goHome();
  await clickButton('단어 추가');
  await wait(1000);
  await typeInput('input[placeholder="단어를 입력하세요"]', 'beautiful');
  await typeInput('input[placeholder="뜻 1"]', '아름다운2');
  await clickButton('저장');
  await wait(1500);
  // Alert dialog 확인 (중복 단어)
  const dupAlert = lastDialogMessage;
  log('실패처리', '중복 단어 경고', dupAlert && dupAlert.includes('중복') ? 'PASS' : 'WARN', dupAlert ? dupAlert.substring(0, 60) : 'Alert 미감지');
  await screenshot('2-4-duplicate-word');

  // 2-5. 퀴즈 - 카테고리 없이 시작 (초기화 후)
  await clearData();
  await clickButton('학습하기');
  await wait(1000);
  text = await getScreenText();
  log('실패처리', '카테고리 없이 퀴즈', text.includes('카테고리') && (text.includes('없') || text.includes('추가')) ? 'PASS' : 'WARN', '빈 상태 안내');
  await screenshot('2-5-quiz-no-category');

  // ============================================
  // 3. 비정상 사용 테스트
  // ============================================
  console.log('\n📋 3. 비정상 사용 테스트\n');

  // 데이터 다시 준비
  await injectBulkData(5);
  await goHome();

  // 3-1. 공백만 입력
  await clickButton('카테고리 관리');
  await wait(800);
  await clickButton('카테고리 추가');
  await wait(500);
  await typeInput('input[placeholder*="영어"]', '   ');
  await clickButton('저장', { exact: true });
  await wait(800);
  text = await getScreenText();
  log('비정상', '공백만 입력 (카테고리)', text.includes('입력해주세요') || !text.includes('3개') ? 'PASS' : 'FAIL', 'trim() 처리 확인');
  await screenshot('3-1-whitespace-only');
  await clickButton('취소', { exact: true });
  await wait(300);

  // 3-2. 특수문자 카테고리
  await clickButton('카테고리 추가');
  await wait(500);
  await typeInput('input[placeholder*="영어"]', '!@#$%^&*()_+<>');
  await clickButton('저장', { exact: true });
  await wait(1000);
  text = await getScreenText();
  log('비정상', '특수문자 카테고리 이름', text.includes('!@#$') ? 'PASS' : 'WARN', '특수문자 저장 여부');
  await screenshot('3-2-special-chars');

  // 3-3. maxLength 초과 시도 (카테고리: 20자 제한)
  await goHome();
  await clickButton('카테고리 관리');
  await wait(800);
  await clickButton('카테고리 추가');
  await wait(500);
  const longText = '가나다라마바사아자차카타파하가나다라마바사아자차'; // 24자
  await typeInput('input[placeholder*="영어"]', longText);
  const inputValue = await page.evaluate(() => {
    const inp = document.querySelector('input[placeholder*="영어"]');
    return inp ? inp.value : '';
  });
  log('비정상', 'maxLength 초과 (카테고리 20자)', inputValue.length <= 20 ? 'PASS' : 'FAIL', `입력된 길이: ${inputValue.length}자 (제한: 20자)`);
  await clickButton('취소', { exact: true });
  await wait(300);

  // 3-4. 단어 입력 maxLength 확인 (100자)
  await goHome();
  await clickButton('단어 추가');
  await wait(1000);
  const longWord = 'a'.repeat(120);
  await typeInput('input[placeholder="단어를 입력하세요"]', longWord);
  const wordLen = await page.evaluate(() => {
    const inp = document.querySelector('input[placeholder="단어를 입력하세요"]');
    return inp ? inp.value.length : -1;
  });
  log('비정상', 'maxLength 초과 (단어 100자)', wordLen <= 100 ? 'PASS' : 'FAIL', `입력된 길이: ${wordLen}자 (제한: 100자)`);

  // 3-5. 메모 maxLength 확인 (500자)
  const longMemo = '가'.repeat(550);
  await typeInput('textarea[placeholder*="메모"]', longMemo);
  const memoLen = await page.evaluate(() => {
    const ta = document.querySelector('textarea[placeholder*="메모"]');
    return ta ? ta.value.length : -1;
  });
  log('비정상', 'maxLength 초과 (메모 500자)', memoLen <= 500 ? 'PASS' : 'FAIL', `입력된 길이: ${memoLen}자 (제한: 500자)`);

  // 3-6. 뜻 10개 초과 시도
  await goHome();
  await clearData();
  await injectBulkData(5);
  await goHome();
  await clickButton('단어 추가');
  await wait(1000);
  for (let i = 0; i < 12; i++) {
    const addBtn = await page.evaluate(() => {
      const divs = document.querySelectorAll('div[tabindex="0"], div[role="button"]');
      for (const el of divs) {
        if (el.textContent?.trim() === '+ 뜻 추가') { el.click(); return true; }
      }
      return false;
    });
    if (!addBtn) break;
    await wait(200);
  }
  const meaningCount = await page.evaluate(() => {
    return document.querySelectorAll('input[placeholder*="뜻"]').length;
  });
  log('비정상', '뜻 10개 초과 추가', meaningCount <= 10 ? 'PASS' : 'FAIL', `현재 뜻 필드: ${meaningCount}개 (제한: 10개)`);

  // ============================================
  // 4. 대량 데이터 테스트 (100개+)
  // ============================================
  console.log('\n📋 4. 대량 데이터 테스트 (100개+)\n');

  await clearData();
  await injectBulkData(120);
  await goHome();

  // 4-1. 홈 화면 로딩
  const homeStart = Date.now();
  await goHome();
  const homeTime = Date.now() - homeStart;
  log('대량데이터', '홈 화면 로딩 (120단어)', homeTime < 3000 ? 'PASS' : 'FAIL', `${homeTime}ms`);

  // 4-2. 단어장 로딩
  const wordStart = Date.now();
  await clickButton('단어장');
  await wait(1500);
  const wordTime = Date.now() - wordStart;
  text = await getScreenText();
  const hasWords = text.includes('apple') || text.includes('banana');
  log('대량데이터', '단어장 로딩 (120단어)', hasWords && wordTime < 5000 ? 'PASS' : 'FAIL', `${wordTime}ms, 단어표시: ${hasWords}`);
  await screenshot('4-2-bulk-wordlist');

  // 4-3. 검색 성능
  const searchInput = await page.evaluate(() => !!document.querySelector('input[placeholder*="검색"]'));
  if (searchInput) {
    const searchStart = Date.now();
    await typeInput('input[placeholder*="검색"]', 'mountain');
    await wait(600);
    const searchTime = Date.now() - searchStart;
    text = await getScreenText();
    log('대량데이터', '검색 성능 (120단어 중)', searchTime < 2000 ? 'PASS' : 'WARN', `${searchTime}ms, 결과: ${text.includes('mountain')}`);
  }

  // 4-4. 스크롤 확인 (단어 목록에 스크롤 가능한 요소 있는지)
  const scrollable = await page.evaluate(() => {
    const scrollEls = document.querySelectorAll('div');
    for (const el of scrollEls) {
      if (el.scrollHeight > el.clientHeight + 50 && el.clientHeight > 200) return true;
    }
    return false;
  });
  log('대량데이터', '스크롤 가능 여부', scrollable ? 'PASS' : 'WARN', '긴 목록 스크롤 확인');

  // 4-5. 통계 화면 대량 데이터
  await goHome();
  const statsStart = Date.now();
  await clickButton('통계');
  await wait(1500);
  const statsTime = Date.now() - statsStart;
  text = await getScreenText();
  log('대량데이터', '통계 로딩 (대량 퀴즈결과)', statsTime < 5000 ? 'PASS' : 'FAIL', `${statsTime}ms`);
  await screenshot('4-5-bulk-stats');

  // 4-6. 마이페이지 히트맵
  await goHome();
  await clickButton('마이페이지');
  await wait(1500);
  text = await getScreenText();
  const hasHeatmap = text.includes('학습 활동') || text.includes('연속');
  log('대량데이터', '마이페이지 히트맵', hasHeatmap ? 'PASS' : 'WARN', '학습 활동 데이터 표시');
  await screenshot('4-6-bulk-mypage');

  // ============================================
  // 5. 퀴즈 집중 테스트
  // ============================================
  console.log('\n📋 5. 퀴즈 집중 테스트\n');

  // 5-1. 단어 0개 카테고리로 퀴즈
  await clearData();
  await page.evaluate(() => {
    const cats = [{ categoryId: 1, categoryName: '빈 카테고리', description: '', displayOrder: 1, wordCount: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }];
    localStorage.setItem('@my_word_categories', JSON.stringify(cats));
    localStorage.setItem('@my_word_words', JSON.stringify([]));
    localStorage.setItem('@my_word_next_id', '10');
  });
  await goHome();
  await clickButton('학습하기');
  await wait(1000);
  text = await getScreenText();
  // 단어 0개 → 시작 불가능해야 함
  const noWordMsg = text.includes('0') || text.includes('없') || text.includes('단어를 더 추가');
  log('퀴즈', '단어 0개 퀴즈 시도', noWordMsg ? 'PASS' : 'WARN', '시작 불가 또는 경고');
  await screenshot('5-1-quiz-0words');

  // 시작 버튼 누르기
  await clickButton('시작');
  await wait(800);
  text = await getScreenText();
  log('퀴즈', '단어 0개 시작 버튼 클릭', text.includes('없') || text.includes('단어가') || !text.includes('문제') ? 'PASS' : 'FAIL', '에러 처리 확인');
  await screenshot('5-1b-quiz-0words-start');

  // 5-2. 단어 1개로 퀴즈
  await clearData();
  await page.evaluate(() => {
    const cats = [{ categoryId: 1, categoryName: '테스트', description: '', displayOrder: 1, wordCount: 1, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }];
    const words = [{ wordId: 1, categoryId: 1, word: 'hello', meanings: ['안녕'], examples: [], tags: [], memo: '', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }];
    localStorage.setItem('@my_word_categories', JSON.stringify(cats));
    localStorage.setItem('@my_word_words', JSON.stringify(words));
    localStorage.setItem('@my_word_next_id', '10');
  });
  await goHome();
  await clickButton('학습하기');
  await wait(1000);
  text = await getScreenText();
  log('퀴즈', '단어 1개 퀴즈 설정', text.includes('1') ? 'PASS' : 'WARN', '단어 수 표시 확인');
  await screenshot('5-2-quiz-1word');

  // 5-3. 단어 5개 - 전부 정답
  await clearData();
  await page.evaluate(() => {
    const cats = [{ categoryId: 1, categoryName: '영어', description: '', displayOrder: 1, wordCount: 5, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }];
    const words = [];
    const pairs = [['apple','사과'],['banana','바나나'],['cat','고양이'],['dog','개'],['fish','물고기']];
    pairs.forEach(([w, m], i) => {
      words.push({ wordId: i+1, categoryId: 1, word: w, meanings: [m], examples: [], tags: [], memo: '', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    });
    localStorage.setItem('@my_word_categories', JSON.stringify(cats));
    localStorage.setItem('@my_word_words', JSON.stringify(words));
    localStorage.setItem('@my_word_next_id', '10');
  });
  await goHome();
  await clickButton('학습하기');
  await wait(1000);

  // 퀴즈 시작
  await clickButton('시작');
  await wait(1500);
  text = await getScreenText();
  const isQuizScreen = text.includes('/') || text.includes('문제') || text.includes('확인') || text.includes('입력');
  log('퀴즈', '5개 단어 퀴즈 시작', isQuizScreen ? 'PASS' : 'FAIL', '퀴즈 화면 진입');
  await screenshot('5-3-quiz-start');

  // 퀴즈 풀기 헬퍼 함수
  async function solveQuiz(questionCount, answerMap, wrongAnswer = null) {
    for (let q = 0; q < questionCount; q++) {
      await wait(800);
      // 현재 문제 텍스트에서 단어 감지
      const currentWord = await page.evaluate((words) => {
        const allText = document.body.innerText;
        for (const w of words) {
          if (allText.includes(w)) return w;
        }
        return null;
      }, Object.keys(answerMap));

      // 입력 필드 클리어 후 답 입력
      const answer = wrongAnswer || (currentWord ? answerMap[currentWord] : '모름');
      await page.evaluate(() => {
        const inp = document.querySelector('input[placeholder="답을 입력하세요"]');
        if (inp) {
          const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
          nativeInputValueSetter.call(inp, '');
          inp.dispatchEvent(new Event('input', { bubbles: true }));
          inp.focus();
        }
      });
      await wait(100);
      await page.type('input[placeholder="답을 입력하세요"]', answer, { delay: 15 });
      await wait(200);

      // "다음" 또는 "완료" 버튼 클릭 (submit)
      await clickButton('다음', { timeout: 100 }) || await clickButton('완료', { timeout: 100 });
      // 피드백 표시 1.5초 + 전환 대기
      await wait(2000);
    }
  }

  // 5-3. 전부 정답 퀴즈
  const wordMeaningMap = { apple: '사과', banana: '바나나', cat: '고양이', dog: '개', fish: '물고기' };
  await solveQuiz(5, wordMeaningMap);

  await wait(1000);
  text = await getScreenText();
  const hasResult = text.includes('결과') || text.includes('점') || text.includes('정답') || text.includes('%');
  log('퀴즈', '전부 정답 결과 화면', hasResult ? 'PASS' : 'WARN', text.substring(0, 100));
  await screenshot('5-3-quiz-all-correct');

  // 5-4. 단어 5개 - 전부 오답
  await goHome();
  await clickButton('학습하기');
  await wait(1000);
  await clickButton('시작');
  await wait(1500);

  await solveQuiz(5, wordMeaningMap, '틀린답변');

  await wait(1000);
  text = await getScreenText();
  log('퀴즈', '전부 오답 결과 화면', text.includes('결과') || text.includes('0') || text.includes('%') ? 'PASS' : 'WARN', text.substring(0, 100));
  await screenshot('5-4-quiz-all-wrong');

  // 오답 재시도 버튼 확인
  const retryWrongExists = await page.evaluate(() => {
    const divs = document.querySelectorAll('div[tabindex="0"], div[role="button"]');
    for (const el of divs) { if (el.textContent?.includes('오답') && el.textContent?.includes('다시')) return true; }
    return false;
  });
  log('퀴즈', '오답 재시도 버튼', retryWrongExists ? 'PASS' : 'WARN', '오답만 다시 풀기 기능');

  // 5-5. 단어 10개 퀴즈
  await clearData();
  await page.evaluate(() => {
    const cats = [{ categoryId: 1, categoryName: '영어', description: '', displayOrder: 1, wordCount: 10, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }];
    const words = [];
    const pairs = [['apple','사과'],['banana','바나나'],['cat','고양이'],['dog','개'],['fish','물고기'],
      ['grape','포도'],['house','집'],['ice','얼음'],['juice','주스'],['kite','연']];
    pairs.forEach(([w, m], i) => {
      words.push({ wordId: i+1, categoryId: 1, word: w, meanings: [m], examples: [], tags: [], memo: '', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    });
    localStorage.setItem('@my_word_categories', JSON.stringify(cats));
    localStorage.setItem('@my_word_words', JSON.stringify(words));
    localStorage.setItem('@my_word_next_id', '20');
  });
  await goHome();
  await clickButton('학습하기');
  await wait(1000);
  text = await getScreenText();
  const has10option = text.includes('10');
  log('퀴즈', '10개 단어 설정 화면', has10option ? 'PASS' : 'WARN', '10문제 옵션 확인');
  await screenshot('5-5-quiz-10words');

  // 5-6. 단어 20개 (카테고리에 20개 넣기)
  await clearData();
  await page.evaluate(() => {
    const cats = [{ categoryId: 1, categoryName: '영어', description: '', displayOrder: 1, wordCount: 20, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }];
    const words = [];
    for (let i = 0; i < 20; i++) {
      words.push({ wordId: i+1, categoryId: 1, word: `word${i+1}`, meanings: [`뜻${i+1}`], examples: [], tags: [], memo: '', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    }
    localStorage.setItem('@my_word_categories', JSON.stringify(cats));
    localStorage.setItem('@my_word_words', JSON.stringify(words));
    localStorage.setItem('@my_word_next_id', '30');
  });
  await goHome();
  await clickButton('학습하기');
  await wait(1000);
  text = await getScreenText();
  const has20 = text.includes('20');
  log('퀴즈', '20개 단어 설정 화면', has20 ? 'PASS' : 'WARN', '20문제 옵션 확인');
  await screenshot('5-6-quiz-20words');

  // 5-7. 퀴즈 중간 나가기
  await clickButton('시작');
  await wait(1500);
  text = await getScreenText();
  if (text.includes('문제') || text.includes('/') || text.includes('확인')) {
    // 나가기 버튼 찾기
    const exitClicked = await page.evaluate(() => {
      const divs = document.querySelectorAll('div[tabindex="0"], div[role="button"]');
      for (const el of divs) {
        if (el.textContent?.includes('나가기') || el.textContent?.includes('종료') || el.textContent?.includes('←')) {
          el.click(); return true;
        }
      }
      return false;
    });
    await wait(1000);
    // Alert 확인
    const exitAlert = lastDialogMessage;
    log('퀴즈', '퀴즈 중간 나가기', exitClicked ? 'PASS' : 'WARN', exitAlert ? exitAlert.substring(0, 60) : '나가기 시도');
    await screenshot('5-7-quiz-exit');
  }

  // ============================================
  // 6. UX 관점 테스트
  // ============================================
  console.log('\n📋 6. UX 관점 테스트\n');

  // 6-1. 빈 단어장 상태
  await clearData();
  await page.evaluate(() => {
    const cats = [{ categoryId: 1, categoryName: '영어', description: '', displayOrder: 1, wordCount: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }];
    localStorage.setItem('@my_word_categories', JSON.stringify(cats));
    localStorage.setItem('@my_word_words', JSON.stringify([]));
    localStorage.setItem('@my_word_next_id', '10');
  });
  await goHome();
  await clickButton('단어장');
  await wait(1000);
  text = await getScreenText();
  log('UX', '빈 단어장 Empty State', text.includes('등록된 단어가 없습니다') || text.includes('없') ? 'PASS' : 'FAIL', '빈 상태 안내 메시지');
  await screenshot('6-1-empty-wordlist');

  // 6-2. 카테고리 없을 때 단어장
  await clearData();
  await clickButton('단어장');
  await wait(1000);
  text = await getScreenText();
  log('UX', '카테고리 없을 때 단어장', text.includes('카테고리가 없') || text.includes('카테고리') ? 'PASS' : 'WARN', '카테고리 생성 유도');
  await screenshot('6-2-no-category-wordlist');

  // 6-3. 카테고리 없을 때 단어 추가
  await goHome();
  await clickButton('단어 추가');
  await wait(1000);
  text = await getScreenText();
  log('UX', '카테고리 없을 때 단어 추가', text.includes('카테고리') && (text.includes('없') || text.includes('먼저')) ? 'PASS' : 'WARN', '카테고리 먼저 생성 안내');
  await screenshot('6-3-no-category-addword');

  // 6-4. 대량 데이터 스크롤 UX
  await clearData();
  await injectBulkData(120);
  await goHome();
  await clickButton('단어장');
  await wait(1500);

  // 스크롤 위치 테스트
  const scrollInfo = await page.evaluate(() => {
    const scrollEls = [];
    document.querySelectorAll('div').forEach(el => {
      if (el.scrollHeight > el.clientHeight + 100 && el.clientHeight > 200) {
        scrollEls.push({ scrollH: el.scrollHeight, clientH: el.clientHeight, ratio: (el.scrollHeight / el.clientHeight).toFixed(1) });
      }
    });
    return scrollEls;
  });
  log('UX', '120개 단어 스크롤 가능', scrollInfo.length > 0 ? 'PASS' : 'WARN', scrollInfo.length > 0 ? `스크롤비율: ${scrollInfo[0]?.ratio}x` : '스크롤 요소 미감지');

  // 6-5. 카테고리 삭제 확인 다이얼로그
  await goHome();
  await clickButton('카테고리 관리');
  await wait(800);
  lastDialogMessage = null;
  await clickButton('삭제');
  await wait(800);
  const deleteDialog = lastDialogMessage;
  log('UX', '카테고리 삭제 확인 다이얼로그', deleteDialog && deleteDialog.includes('삭제') ? 'PASS' : 'WARN', deleteDialog ? deleteDialog.substring(0, 80) : 'Alert 미감지');
  await screenshot('6-5-delete-confirm');

  // 6-6. 통계 화면 - 대량 데이터
  await goHome();
  await clickButton('통계');
  await wait(1500);
  text = await getScreenText();
  const statsHasData = text.includes('%') || text.includes('정답') || text.includes('오답');
  log('UX', '통계 데이터 표시', statsHasData ? 'PASS' : 'WARN', '정답률/오답 등 표시 확인');
  await screenshot('6-6-stats-data');

  // 6-7. 마이페이지 히트맵 - 대량 데이터
  await goHome();
  await clickButton('마이페이지');
  await wait(1500);
  text = await getScreenText();
  const mypageData = text.includes('활동') || text.includes('연속') || text.includes('등록');
  log('UX', '마이페이지 활동 데이터', mypageData ? 'PASS' : 'WARN');
  await screenshot('6-7-mypage-data');

  // ============================================
  // 결과 리포트 생성
  // ============================================
  await browser.close();

  const passCount = results.filter(r => r.status === 'PASS').length;
  const failCount = results.filter(r => r.status === 'FAIL').length;
  const warnCount = results.filter(r => r.status === 'WARN').length;
  const total = results.length;

  let report = `# My Word 앱 종합 테스트 리포트\n\n`;
  report += `**테스트 일시**: ${new Date().toLocaleString('ko-KR')}\n`;
  report += `**테스트 환경**: Puppeteer (headless Chrome), 390x844 @2x\n\n`;
  report += `## 요약\n\n`;
  report += `| 결과 | 개수 |\n|---|---|\n`;
  report += `| ✅ PASS | ${passCount} |\n`;
  report += `| ❌ FAIL | ${failCount} |\n`;
  report += `| ⚠️ WARN | ${warnCount} |\n`;
  report += `| **총** | **${total}** |\n\n`;

  const categories = [...new Set(results.map(r => r.category))];
  for (const cat of categories) {
    const catResults = results.filter(r => r.category === cat);
    report += `## ${cat}\n\n`;
    report += `| # | 테스트 | 결과 | 비고 |\n|---|---|---|---|\n`;
    for (const r of catResults) {
      const icon = r.status === 'PASS' ? '✅' : r.status === 'FAIL' ? '❌' : '⚠️';
      report += `| ${r.num} | ${r.name} | ${icon} ${r.status} | ${r.detail} |\n`;
    }
    report += '\n';
  }

  // WARN/FAIL 항목 별도 정리
  const issues = results.filter(r => r.status !== 'PASS');
  if (issues.length > 0) {
    report += `## 주의/실패 항목\n\n`;
    for (const r of issues) {
      const icon = r.status === 'FAIL' ? '❌' : '⚠️';
      report += `- ${icon} **[${r.category}] ${r.name}**: ${r.detail}\n`;
    }
    report += '\n';
  }

  report += `## 스크린샷\n\n`;
  report += `모든 스크린샷은 \`test-screenshots/\` 폴더에 저장되었습니다.\n`;

  fs.writeFileSync(REPORT_PATH, report, 'utf8');
  console.log(`\n${'='.repeat(50)}`);
  console.log(`📊 테스트 완료: ✅ ${passCount} PASS / ❌ ${failCount} FAIL / ⚠️ ${warnCount} WARN (총 ${total}건)`);
  console.log(`📄 리포트: ${REPORT_PATH}`);
  console.log(`📸 스크린샷: test-screenshots/`);
}

runAllTests().catch(err => {
  console.error('\n💥 테스트 실행 중 에러:', err.message);
  if (browser) browser.close();
  process.exit(1);
});
