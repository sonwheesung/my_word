/**
 * 화면 컴포넌트가 **「일찍 반환」 아래에서 훅을 부르지 않는가.**
 *
 * 🔴 2026-10-15 사장님 폰에서 **시험을 끝낼 때마다 「앱 에러 발생」** 으로 떨어졌다.
 *
 * ```
 * ExamResultScreen
 *   if (loading) { return <ActivityIndicator/> }   ← 2026-10-07 부터 있던 줄
 *   ...
 *   const wrongIndexes = useMemo(...)              ← 2026-10-12 에 이 아래로 들어갔다
 *   useEffect(...)
 *   const questionCard = useCallback(...)
 * ```
 *
 * 첫 렌더는 `loading=true` 라 일찍 반환해서 훅을 11개만 돌고, 조회가 끝나 다시 그릴 때
 * 14개를 돈다. React 는 그 차이를 보고 던진다(`Rendered more hooks than during the
 * previous render`). **훅의 개수는 렌더마다 같아야 한다**는 규칙을 깬 것이다.
 *
 * 잃는 것이 컸다 — 기록 자체는 저장된 뒤라 남지만 **오답노트와 「새 단어 담기」가 통째로
 * 못 열렸다.** 돈이 드는 기능의 결말 화면이 3일 동안 날아가 있었다.
 *
 * ## 🟢 린터도 같은 날 살렸다. 그래도 이 파일을 남긴다
 *
 * 원래 이건 `react-hooks/rules-of-hooks` 가 잡는 버그인데, 이 저장소는 `.eslintrc.js` 가
 * 가리키는 `@react-native` 패키지가 **설치돼 있지 않아 린트가 한 번도 돈 적이 없었다.**
 * 2026-10-15 에 규칙을 좁게 다시 세웠고, 10-12 원본을 물리면 세 줄을 정확히 집어낸다.
 *
 * 🔴 **그런데도 지우지 않는 이유는 「무엇이 실제로 돌아가는가」다.**
 *   `npm run lint` 는 따로 불러야 돌고, 실제로 몇 달간 아무도 안 불렀다.
 *   이 파일은 `npm test` · `check:tests` 에 얹혀 **매번** 돈다.
 *   더 정확한 도구가 생겼다고 **자동으로 도는 쪽**을 치우면, 다시 조용해질 뿐이다.
 *
 * ⚠ 다만 이쪽이 훨씬 거칠다 — 들여쓰기 2칸의 `if` 블록이 `return` 으로 끝나는 모양만 본다.
 *   둘이 다른 말을 하면 **린터가 옳다**(JS 구조를 실제로 읽는 쪽이다).
 */
// ⚠ `@types/node` 가 없다. 같은 이유로 `flashcardService.test.ts` 도 이 모양을 쓴다
declare const __dirname: string;
const fs = require('fs') as {
  readFileSync(p: string, enc: string): string;
  readdirSync(p: string): string[];
};
const path = require('path') as { join(...parts: string[]): string; basename(p: string): string };

const SCREEN_DIR = path.join(__dirname, '..', 'src', 'screens');

/** 들여쓰기 2칸 = 컴포넌트 본문의 맨 바깥. 그 안쪽(4칸 이상)은 콜백이라 상관없다 */
const EARLY_RETURN_OPEN = /^ {2}if \(.*\{\s*$/;
const BLOCK_CLOSE = /^ {2}\}\s*$/;
const RETURN_INSIDE = /^ {4}return[\s(]/;
const HOOK_CALL = /^ {2}(?:const|let)?\s*[\w{},:\s[\]]*=?\s*use[A-Z]\w*\(|^ {2}use[A-Z]\w*\(/;

/** 주석·문자열 안의 가짜 일치를 줄인다 — 줄 단위 검사라 완벽하지는 않다 */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/^\s*\/\/.*$/gm, '');
}

function hooksAfterEarlyReturn(src: string): string[] {
  const lines = stripComments(src).split('\n');
  const found: string[] = [];
  let earlyReturnEndedAt = -1;

  for (let i = 0; i < lines.length; i += 1) {
    if (earlyReturnEndedAt < 0 && EARLY_RETURN_OPEN.test(lines[i])) {
      // 이 if 블록이 return 으로 끝나는가
      for (let j = i + 1; j < lines.length; j += 1) {
        if (BLOCK_CLOSE.test(lines[j])) break;
        if (RETURN_INSIDE.test(lines[j])) {
          // 블록의 끝을 찾는다
          for (let k = j; k < lines.length; k += 1) {
            if (BLOCK_CLOSE.test(lines[k])) {
              earlyReturnEndedAt = k;
              break;
            }
          }
          break;
        }
      }
    }
    if (earlyReturnEndedAt >= 0 && i > earlyReturnEndedAt && HOOK_CALL.test(lines[i])) {
      found.push(`${i + 1}행: ${lines[i].trim().slice(0, 70)}`);
    }
  }
  return found;
}

describe('화면 컴포넌트의 훅 순서', () => {
  const files = fs
    .readdirSync(SCREEN_DIR)
    .filter((f: string) => f.endsWith('.tsx'))
    .map((f: string) => path.join(SCREEN_DIR, f));

  it('검사 대상 화면이 실제로 있다', () => {
    // 경로가 틀리면 0개를 돌고 **조용히 초록**이 된다. 이 종류 가드의 유일한 고장 방식이다
    expect(files.length).toBeGreaterThan(10);
  });

  it.each(files.map((f: string): [string, string] => [path.basename(f), f]))(
    '%s — 「일찍 반환」 아래에 훅이 없다',
    (_name: string, file: string) => {
      const offenders = hooksAfterEarlyReturn(fs.readFileSync(file, 'utf8'));
      expect(offenders).toEqual([]);
    },
  );

  it('가드 자신이 동작한다 — 어긋난 모양을 넣으면 잡는다', () => {
    const broken = [
      'export default function Screen() {',
      '  const [loading, setLoading] = useState(true);',
      '  if (loading) {',
      '    return <Spinner />;',
      '  }',
      '  const x = useMemo(() => 1, []);',
      '  return <View />;',
      '}',
    ].join('\n');
    expect(hooksAfterEarlyReturn(broken)).toHaveLength(1);
  });
});
