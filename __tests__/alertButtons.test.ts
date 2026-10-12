/**
 * 🔴 **안드로이드 `AlertDialog` 는 버튼을 3개까지만 받는다**(positive · negative · neutral).
 *    RN 은 넘는 것을 **조용히 버린다** — 경고도, 타입 오류도, 크래시도 없다.
 *
 * 2026-10-12 사장님 폰에서 당했다: 단어장 「…」 에 버튼을 5개 넣었더니 화면에는 3개만 떴고,
 * 다섯 번째였던 **`취소`가 사라져** 뒤로가기도 바깥 탭도 안 먹는 **막다른 상태**가 됐다.
 * 나갈 길은 앱 강제 종료뿐이었다.
 *
 * ⚠ **화면을 봐도 안 보인다** — 메뉴를 *열어만 보고 닫지 않으면* 정상으로 보인다.
 *   그래서 눈이 아니라 기계로 막는다. 항목이 넷 이상인 메뉴는 `BottomSheet` 로 만든다.
 */

// ⚠ 이 저장소의 소스검사 테스트가 쓰는 모양 그대로다(`quizOrder.test.ts`).
declare const __dirname: string;
const fs = require('fs') as {
  readFileSync(p: string, enc: string): string;
  readdirSync(p: string, o: { withFileTypes: true }): Array<{ name: string; isDirectory(): boolean }>;
};
const path = require('path') as { join(...parts: string[]): string };

const ROOT = path.join(__dirname, '..');
const MAX_BUTTONS = 3;

/**
 * 주석을 **같은 길이의 공백**으로 바꾼다 — 지우면 줄 번호가 밀려 범인을 엉뚱한 줄로 지목한다.
 * (사냥 1차에서 실제로 밀렸다)
 */
function blankComments(s: string): string {
  const out = s.split('');
  let i = 0;
  let mode: '' | 'line' | 'block' | 'str' = '';
  let quote = '';
  while (i < s.length) {
    const c = s[i];
    const n = s[i + 1] ?? '';
    if (mode === '') {
      if (c === "'" || c === '"' || c === '`') {
        mode = 'str';
        quote = c;
      } else if (c === '/' && n === '/') {
        mode = 'line';
        out[i] = out[i + 1] = ' ';
        i += 2;
        continue;
      } else if (c === '/' && n === '*') {
        mode = 'block';
        out[i] = out[i + 1] = ' ';
        i += 2;
        continue;
      }
    } else if (mode === 'str') {
      if (c === '\\') {
        i += 2;
        continue;
      }
      if (c === quote) mode = '';
    } else if (mode === 'line') {
      if (c === '\n') mode = '';
      else out[i] = ' ';
    } else {
      if (c === '*' && n === '/') {
        out[i] = out[i + 1] = ' ';
        mode = '';
        i += 2;
        continue;
      }
      if (c !== '\n') out[i] = ' ';
    }
    i += 1;
  }
  return out.join('');
}

function matching(s: string, from: number, open: string, close: string): number {
  let depth = 0;
  for (let j = from; j < s.length; j += 1) {
    if (s[j] === open) depth += 1;
    else if (s[j] === close) {
      depth -= 1;
      if (depth === 0) return j;
    }
  }
  return -1;
}

/**
 * 버튼 배열에서 **깊이 1의 객체만** 센다.
 * 🔴 중첩 `Alert`(바깥 버튼의 `onPress` 안에 또 하나)의 버튼까지 세면 **멀쩡한 코드를 범인으로 만든다** —
 *    사냥 1차에서 형제 프로젝트 3건을 그렇게 오진했다.
 */
export function countTopLevelButtons(arrayLiteral: string): number {
  let depth = 0;
  let count = 0;
  let i = 0;
  while (i < arrayLiteral.length) {
    const c = arrayLiteral[i];
    if (c === '[' || c === '{' || c === '(') {
      depth += 1;
      if (depth === 2 && c === '{') {
        const end = matching(arrayLiteral, i, '{', '}');
        const body = end > 0 ? arrayLiteral.slice(i, end + 1) : arrayLiteral.slice(i);
        let inner = 0;
        let own = '';
        for (const ch of body) {
          if (ch === '[' || ch === '{' || ch === '(') inner += 1;
          else if (ch === ']' || ch === '}' || ch === ')') inner -= 1;
          if (inner <= 1) own += ch;
        }
        if (/\btext\s*:/.test(own)) count += 1;
        if (end > 0) i = end;
        depth -= 1;
      }
    } else if (c === ']' || c === '}' || c === ')') {
      depth -= 1;
    }
    i += 1;
  }
  return count;
}

function walk(dir: string, acc: string[]): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, acc);
    else if (/\.tsx?$/.test(e.name)) acc.push(p);
  }
  return acc;
}

describe('countTopLevelButtons — 세는 법 자체를 먼저 검증한다', () => {
  it('평평한 3개', () => {
    expect(countTopLevelButtons("[{ text: 'a' }, { text: 'b' }, { text: 'c' }]")).toBe(3);
  });

  it('🔴 중첩 Alert 의 버튼은 세지 않는다', () => {
    const nested =
      "[{ text: 'cancel' }, { text: 'go', onPress: () => Alert.alert('t', 'b', " +
      "[{ text: 'no' }, { text: 'yes' }]) }]";
    expect(countTopLevelButtons(nested)).toBe(2);
  });

  it('5개는 5로 센다', () => {
    expect(
      countTopLevelButtons("[{ text: 'a' },{ text: 'b' },{ text: 'c' },{ text: 'd' },{ text: 'e' }]"),
    ).toBe(5);
  });

  it('버튼이 없으면 0', () => {
    expect(countTopLevelButtons('[]')).toBe(0);
  });
});

describe('🔴 Alert.alert 버튼은 3개를 넘지 않는다 (전수)', () => {
  const files = [path.join(ROOT, 'App.tsx'), ...walk(path.join(ROOT, 'src'), [])];

  const offenders: string[] = [];
  for (const file of files) {
    const raw = fs.readFileSync(file, 'utf8');
    if (!raw.includes('Alert.alert')) continue;
    const src = blankComments(raw);
    const re = /Alert\.alert\s*\(/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src)) !== null) {
      const op = src.indexOf('(', m.index);
      const cl = matching(src, op, '(', ')');
      const call = cl > 0 ? src.slice(op, cl + 1) : src.slice(op);
      const b = call.indexOf('[');
      if (b < 0) continue;
      const e = matching(call, b, '[', ']');
      const n = countTopLevelButtons(e > 0 ? call.slice(b, e + 1) : call.slice(b));
      if (n > MAX_BUTTONS) {
        const line = src.slice(0, m.index).split('\n').length;
        offenders.push(
          `${file.replace(ROOT, '').replace(/\\/g, '/')}:${line} — 버튼 ${n}개 ` +
            `(안드로이드에서 ${n - MAX_BUTTONS}개가 조용히 사라진다)`,
        );
      }
    }
  }

  it('하나도 없다', () => {
    expect(offenders).toEqual([]);
  });

  it('⚠ 가드가 실제로 파일을 읽었다 (0개 검사하고 초록이 되지 않는다)', () => {
    const scanned = files.filter((f) => fs.readFileSync(f, 'utf8').includes('Alert.alert'));
    expect(scanned.length).toBeGreaterThan(3);
  });
});
