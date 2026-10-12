/**
 * 🔴 **안드로이드에서 `KeyboardAvoidingView behavior="height"` 를 쓰지 않는다.**
 *
 * 이 앱의 매니페스트는 `android:windowSoftInputMode="adjustResize"` 다 —
 * **안드로이드가 이미 창을 줄여 준다.** 거기에 `height` 를 얹으면 키보드 높이를 **한 번 더** 빼고,
 * 키보드를 내린 뒤에도 그만큼이 남는다.
 *
 * 2026-10-12 사장님이 화면에서 잡았다(카테고리 추가 시트):
 * ```
 * 새로 열면          시트가 내비바까지 꽉 내려온다
 * 키보드 올렸다 내리면  시트가 ~180px 뜨고 그 틈으로 뒤 목록이 비친다
 *                    🔴 그림과 터치 영역이 어긋나 [저장] 이 안 먹는다
 * ```
 * **보기만 나쁜 것이 아니라 버튼이 안 눌렸다.** 토스트는 「생성되었습니다」가 뜨는데
 * 카테고리는 안 생기는, 가장 헷갈리는 모양이었다.
 *
 * ⚠ **이 저장소는 답을 이미 알고 있었다.** 화면 넷(`AddWord`·`Import`·`ManageWords`·`Support`)은
 *   처음부터 `undefined` 를 쓰고 있었고 **`BottomSheet` 하나만 달랐다**(`55bf65c` 부터).
 *   아는 것을 한 곳에서만 안 지킨 것이라, 사람이 눈으로 찾을 수 있는 종류가 아니다 → 기계로 막는다.
 *
 * ⚠ iOS 는 창을 줄여 주지 않으므로 `padding` 이 필요하다. 막는 것은 **안드로이드 쪽 값**이다.
 */

// ⚠ 이 저장소의 소스검사 테스트가 쓰는 모양 그대로다(`quizOrder.test.ts`).
declare const __dirname: string;
const fs = require('fs') as {
  readFileSync(p: string, enc: string): string;
  readdirSync(p: string, o: { withFileTypes: true }): Array<{ name: string; isDirectory(): boolean }>;
};
const path = require('path') as { join(...parts: string[]): string };

const ROOT = path.join(__dirname, '..');

function walk(dir: string, acc: string[]): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, acc);
    else if (/\.tsx?$/.test(e.name)) acc.push(p);
  }
  return acc;
}

describe('🔴 KeyboardAvoidingView — 안드로이드에 height 를 주지 않는다', () => {
  const files = [path.join(ROOT, 'App.tsx'), ...walk(path.join(ROOT, 'src'), [])];
  const users = files.filter((f) => fs.readFileSync(f, 'utf8').includes('<KeyboardAvoidingView'));

  it('⚠ 가드가 실제로 읽었다 (0개 검사하고 초록이 되지 않는다)', () => {
    expect(users.length).toBeGreaterThan(3);
  });

  it('쓰는 곳이 모두 안드로이드에서 behavior 를 비운다', () => {
    const offenders: string[] = [];
    for (const file of users) {
      const src = fs
        .readFileSync(file, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '');
      // `behavior={...}` 한 줄을 전부 본다
      const re = /behavior=\{([^}]*)\}/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(src)) !== null) {
        const expr = m[1];
        // 🔴 안드로이드 쪽(= 삼항의 거짓 가지)이 'height' 면 안 된다
        if (/['"]height['"]/.test(expr)) {
          const line = src.slice(0, m.index).split('\n').length;
          offenders.push(`${file.replace(ROOT, '').replace(/\\/g, '/')}:${line} — ${expr.trim()}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('⚠ iOS 쪽 padding 은 남아 있어야 한다 — 창을 안 줄여 주므로', () => {
    const withPadding = users.filter((f) =>
      /behavior=\{[^}]*['"]padding['"]/.test(fs.readFileSync(f, 'utf8')),
    );
    expect(withPadding.length).toBe(users.length);
  });
});
