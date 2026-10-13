/**
 * 앱 전체 렌더 — **빈 화면을 통과시키지 않는다.**
 *
 * 🔴 **2026-10-13 까지 이 스위트는 로드조차 되지 않았다**(`scripts/check-tests.mjs` 의
 *    `KNOWN_BROKEN` 에 적혀 있었다). 원인은 Expo 네이티브 모듈 목 두 개가 빠진 것이었고
 *    (`expo-speech`·`expo-clipboard`), 그걸 넣자 **다음 문제가 드러났다**:
 *
 * ```
 * 트리가 RNCSafeAreaProvider 하나에 자식 0개 — 진짜 빈 화면이었다
 * 원인: 안전영역 공급자가 인셋을 「측정」하기 전에는 자식을 그리지 않는다
 * 그런데 테스트에는 측정할 화면이 없다 → 영원히 0개
 * ```
 *
 * 🔴 **그 상태로도 옛 테스트는 초록이었다.** 단언이 하나도 없었기 때문이다 —
 *    렌더가 throw 하는 것만 잡고, **아무것도 안 그려진 것은 통과**시켰다.
 *    `.agents/tester.md` TEST-5 가 *"빈 화면 감지 시 즉시 FAIL"* 이라고 정한 것과 어긋났고,
 *    `KNOWN_BROKEN` 의 설명이 **되살릴 때 이걸 같이 고치라고** 적어 두었다. 그 조건을 지킨다.
 *
 * ⚠ 그래서 이 파일의 핵심 단언은 *"무슨 글자가 있나"* 가 아니라 **"글자가 있나"** 다.
 *   문구는 바뀐다. 빈 화면은 언제나 버그다.
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import App from '../App';

/** 트리에서 보이는 글자를 전부 모은다. 빈 화면 판정의 유일한 근거다. */
function visibleTexts(node: unknown): string[] {
  const out: string[] = [];
  const walk = (n: unknown): void => {
    if (n === null || n === undefined) return;
    if (typeof n === 'string') {
      const t = n.trim();
      if (t) out.push(t);
      return;
    }
    if (Array.isArray(n)) {
      n.forEach(walk);
      return;
    }
    const kids = (n as { children?: unknown }).children;
    if (kids) walk(kids);
  };
  walk(node);
  return out;
}

/**
 * 화면에 글자가 나올 때까지 비동기 초기화를 흘려보낸다. 앱은 언어와 저장소가 준비될 때까지
 * **아무것도 그리지 않는다**(`App.tsx` 의 `languageReady`·`dbReady`).
 *
 * 🔴 **고정 횟수로 돌리면 간헐적으로 실패한다**(2026-10-13 에 실제로 났다). 20번을 돌리고
 *    단언했더니 혼자 돌릴 때는 통과하고 전체 묶음에서 가끔 빨개졌다 — 기계가 바쁠 때
 *    그 횟수 안에 초기화가 안 끝나기 때문이다.
 *
 * ⚠ **간헐적으로 빨개지는 가드는 없는 것보다 나쁘다.** 「다시 돌려서 초록 나오면 넘어가기」를
 *   가르치고, 그러면 진짜 고장도 같은 방식으로 지나간다. 그래서 횟수가 아니라 **조건**으로 기다린다.
 *
 * 🔴 그래도 **무한정 기다리지 않는다.** 상한에 닿으면 그냥 돌아오고, 호출부의 단언이
 *    「글자가 없다」로 실패한다 — 기다리다 멈추는 것보다 **무엇이 틀렸는지 말하는 실패**가 낫다.
 */
async function settleUntilPainted(maxTicks = 200): Promise<void> {
  for (let i = 0; i < maxTicks; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await ReactTestRenderer.act(async () => {
      await Promise.resolve();
      await new Promise((r) => setTimeout(r, 1));
    });
    if (currentTexts().length > 5) return;
  }
}

/** `settleUntilPainted` 가 들여다보는 트리. 렌더러를 모듈 수준에 둬야 조건을 볼 수 있다. */
let tree: ReactTestRenderer.ReactTestRenderer | null = null;
const currentTexts = (): string[] => (tree === null ? [] : visibleTexts(tree.toJSON()));

/** 앱을 띄우고 **그려질 때까지** 기다린 뒤 보이는 글자를 돌려준다. */
async function renderApp(): Promise<string[]> {
  await ReactTestRenderer.act(() => {
    tree = ReactTestRenderer.create(<App />);
  });
  await settleUntilPainted();
  return currentTexts();
}

describe('앱이 뜬다', () => {
  it('🔴 빈 화면이 아니다 — 글자가 하나도 없으면 즉시 FAIL', async () => {
    const texts = await renderApp();
    /*
     * 🔴 **이 한 줄이 이 파일의 전부다.** 2026-10-13 까지 여기가 비어 있었고
     *    (자식 0개) 그래도 테스트는 초록이었다.
     * ⚠ 개수로 재는 이유: 특정 문구를 고르면 그 화면을 고칠 때마다 빨개지고,
     *   그러면 사람이 단언을 지우는 쪽으로 간다 — 그게 이 테스트가 죽은 방식이다.
     */
    expect(texts.length).toBeGreaterThan(5);

    // 앱 이름은 화면이 바뀌어도 남는다.
    expect(texts).toContain('My Word');
  });

  it('단어가 없는 첫 사용자에게 **다음에 할 일**을 보여 준다', async () => {
    const texts = await renderApp();
    /*
     * 저장소 목이 비어 있으므로 **빈 상태 화면**이 떠야 한다. 이것이 신규 설치의 첫 화면이고,
     * 여기가 비면 사용자는 무엇을 해야 하는지 모른다(CLAUDE.md 의 「데이터 없을 때 빈 상태 안내」).
     */
    expect(texts).toContain('단어 추가');
    expect(texts.some((t) => t.includes('첫 단어'))).toBe(true);
  });
});
