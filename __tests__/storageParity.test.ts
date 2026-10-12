/**
 * 🔴 **읽는 곳과 쓰는 곳이 같은 저장소를 봐야 한다.**
 *
 * 2026-10-12 사장님이 폰에서 잡았다 — **카테고리를 만들 수 없었다.**
 *
 * ```
 * categoryStorage.getAll()  →  getDb() 분기 있음 → SQLite 에서 읽는다
 * categoryStorage.create()  →  분기 없음         → AsyncStorage 에만 쓴다
 * ```
 *
 * 1.8.0 에서 정본이 SQLite 로 옮겨 가면서 **읽기만 분기를 받았다.** `categoryRepo` 에
 * `create`·`update`·`delete`·`reorder` 가 **이미 다 있었는데 연결만 안 돼 있었다.**
 *
 * 🔴 **증상이 가장 나쁜 모양이었다** — 토스트는 「생성되었습니다」가 뜨고, 오류도 로그도 없고,
 *    아무 데도 안 남는다. 앱을 껐다 켜도 없다. 넷 다(추가·이름수정·삭제·순서) 그랬다.
 * ⚠ **단어는 멀쩡했다**(`wordStorage` 는 분기를 받았다). 그래서 더 안 보였다 —
 *   "단어가 되니 저장은 되는구나" 로 읽게 된다.
 *
 * 이 가드는 **읽기에 `getDb()` 분기가 있는 저장소 객체라면, 쓰기에도 있어야 한다**를 본다.
 */

// ⚠ 이 저장소의 소스검사 테스트가 쓰는 모양 그대로다(`quizOrder.test.ts`).
declare const __dirname: string;
const fs = require('fs') as { readFileSync(p: string, enc: string): string };
const path = require('path') as { join(...parts: string[]): string };

/** 바꾸는 일을 하는 메서드 이름. ⚠ 새 이름을 쓰면 여기 더한다 */
const MUTATORS = /^(create|update|delete|remove|reorder|save\w*|set\w*|clear\w*)$/;

interface MethodInfo {
  name: string;
  branches: boolean;
  writesAsync: boolean;
}

function methodsOf(body: string): MethodInfo[] {
  const out: MethodInfo[] = [];
  const re = /\n  async (\w+)\(/g;
  let m: RegExpExecArray | null;
  const starts: Array<{ name: string; at: number }> = [];
  while ((m = re.exec(body)) !== null) starts.push({ name: m[1], at: m.index });
  starts.forEach((s, i) => {
    const chunk = body.slice(s.at, i + 1 < starts.length ? starts[i + 1].at : body.length);
    out.push({
      name: s.name,
      branches: /getDb\(\)/.test(chunk),
      writesAsync: /setCollection\(|writeRaw\(/.test(chunk),
    });
  });
  return out;
}

describe('🔴 저장소 — 읽는 곳과 쓰는 곳이 어긋나지 않는다', () => {
  const src = fs
    .readFileSync(path.join(__dirname, '..', 'src', 'utils', 'storage.ts'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');

  const objects = ['categoryStorage', 'wordStorage', 'quizResultStorage'];

  it('⚠ 가드가 실제로 읽었다', () => {
    for (const name of objects) expect(src).toContain(`export const ${name} = {`);
  });

  it.each(objects)('%s — 읽기가 SQLite 를 보면 쓰기도 본다', (name) => {
    const i = src.indexOf(`export const ${name} = {`);
    const j = src.indexOf('\n};', i);
    const methods = methodsOf(src.slice(i, j));

    const readsFromDb = methods.some((x) => /^get/.test(x.name) && x.branches);
    if (!readsFromDb) return; // 이 객체는 아직 SQLite 를 안 쓴다 — 볼 것이 없다

    const broken = methods
      .filter((x) => MUTATORS.test(x.name) && x.writesAsync && !x.branches)
      .map((x) => `${name}.${x.name}() — SQLite 에서 읽는데 AsyncStorage 에만 쓴다`);
    expect(broken).toEqual([]);
  });
});
