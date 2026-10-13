/**
 * 🔴 **언제 미는가** — 15시간 공백을 만든 그 자리다.
 *
 * ```
 * 10-12 20:43   앱이 서버에 마지막으로 올림
 * 10-12 20:46   사장님이 일본어 12개를 넣으심
 * 10-13 11:35   🔴 그 사이 약 15시간 동안 그 12개는 서버에 없었다
 * ```
 *
 * 밀기가 **JS 프로세스 시작당 1회**였기 때문이다. 홈 버튼은 프로세스를 안 죽인다.
 *
 * ⚠ **이 모듈의 고장은 전부 조용하다.** 안 밀려도 화면은 멀쩡하고 오류도 안 난다 —
 *   사용자는 **폰을 잃은 다음에** 알게 된다. 그래서 타이머 하나짜리 코드인데도 여기를 촘촘히 잰다.
 *
 * ⚠ 가짜 타이머를 쓴다. 실제로 3초를 기다리는 테스트는 느리고, 느린 테스트는 결국 지워진다.
 */

import {
  BACKOFF_MS,
  DEBOUNCE_MS,
  MORE_MS,
  syncScheduler,
  type FlushOutcome,
} from '../src/services/syncScheduler';

declare const require: (id: string) => any;
declare const __dirname: string;

const fs = require('fs') as { readFileSync(p: string, enc: string): string };
const path = require('path') as { join(...parts: string[]): string };

/** 미는 쪽을 흉내 낸다. `calls` 에 호출이 쌓이고, `say` 로 결과를 바꾼다 */
function fakeFlush() {
  const calls: number[] = [];
  let outcome: FlushOutcome = 'done';
  let hold: (() => void) | null = null;
  /** 🔴 동시에 몇 개가 돌았나 — 겹침은 개수가 아니라 **이 값**으로 판정해야 한다 */
  let inFlight = 0;
  let peak = 0;
  const fn = async (): Promise<FlushOutcome> => {
    calls.push(Date.now());
    inFlight += 1;
    peak = Math.max(peak, inFlight);
    try {
      if (hold !== null) {
        // 보내는 중 상태를 만들기 위해 멈춰 세운다
        await new Promise<void>((resolve) => {
          hold = resolve;
        });
      }
      return outcome;
    } finally {
      inFlight -= 1;
    }
  };
  return {
    fn,
    get count() {
      return calls.length;
    },
    /** 한 번에 최대 몇 개가 떠 있었나. 1을 넘으면 겹친 것이다 */
    get peak() {
      return peak;
    },
    say(next: FlushOutcome) {
      outcome = next;
    },
    /** 다음 호출을 멈춰 세운다 */
    block() {
      hold = () => {};
    },
    /** 멈춰 세운 호출을 풀어 준다 */
    release() {
      const r = hold;
      hold = null;
      if (r) r();
    },
  };
}

beforeEach(() => {
  jest.useFakeTimers();
  syncScheduler.__reset();
});

afterEach(() => {
  syncScheduler.__reset();
  jest.useRealTimers();
});

describe('🔴 저장하면 묶어서 한 번 민다', () => {
  it('저장 뒤 3초가 지나야 민다 — 그 전에는 안 민다', async () => {
    const f = fakeFlush();
    syncScheduler.register(f.fn);

    syncScheduler.schedule();
    await jest.advanceTimersByTimeAsync(DEBOUNCE_MS - 1);
    expect(f.count).toBe(0);

    await jest.advanceTimersByTimeAsync(1);
    expect(f.count).toBe(1);
  });

  it('🔴 단어 10개를 연달아 넣어도 요청은 한 번이다', async () => {
    /*
     * 제가 「저장할 때마다 보내면 요청이 10번 나간다」로 반대했던 바로 그 자리다(2026-10-13).
     * 묶으면 그 문제가 없다는 것을 여기서 못 박는다.
     */
    const f = fakeFlush();
    syncScheduler.register(f.fn);

    for (let i = 0; i < 10; i += 1) {
      syncScheduler.schedule();
      await jest.advanceTimersByTimeAsync(500); // 0.5초 간격으로 입력
    }
    expect(f.count).toBe(0); // 아직 한 번도 안 갔다

    await jest.advanceTimersByTimeAsync(DEBOUNCE_MS);
    expect(f.count).toBe(1); // 마지막 입력 3초 뒤에 한 번
  });

  it('보낼 것이 없으면 타이머도 안 걸린다', () => {
    const f = fakeFlush();
    syncScheduler.register(f.fn);
    expect(syncScheduler.isPending()).toBe(false);
  });
});

describe('🔴 겹쳐 보내지 않는다', () => {
  it('보내는 중에 또 저장해도 두 번 동시에 안 간다', async () => {
    const f = fakeFlush();
    syncScheduler.register(f.fn);
    f.block();

    syncScheduler.schedule();
    await jest.advanceTimersByTimeAsync(DEBOUNCE_MS);
    expect(f.count).toBe(1); // 첫 호출이 멈춰 있다

    syncScheduler.schedule();
    syncScheduler.schedule();
    await jest.advanceTimersByTimeAsync(DEBOUNCE_MS * 3);
    /*
     * 🔴 겹쳐 보내면 같은 줄을 두 번 밀고 장부(`lastUpdatedAt`)가 꼬인다.
     *    서버 쓰기가 멱등이라 데이터는 안 깨지지만, 되감기 판정이 흔들린다.
     */
    expect(f.count).toBe(1);
    expect(f.peak).toBe(1);
  });

  it('🔴 어느 입구로 들어와도 두 개가 동시에 뜨지 않는다', async () => {
    /*
     * ⚠ **앞 검사만으로는 부족하다.** 겹침을 막는 곳이 셋이다 — `schedule()` · `now()` ·
     *   `run()` 자신. 앞 검사는 `schedule()` 만 지나가서, `run()` 안의 방어를 지워도
     *   **아무것도 빨개지지 않았다**(2026-10-13 변이에서 잡았다).
     *
     * 🔴 `run()` 안의 방어가 실제로 닿는 길은 이것이다:
     *    보내는 중에 저장이 들어와 `dirty` 가 서고 → 그 상태에서 `register()` 가 다시 불리면
     *    타이머가 걸려 **보내는 중에 `run()` 이 한 번 더 들어온다.**
     *    (화면이 다시 마운트되며 배선이 두 번 꽂히는 상황이 그렇다)
     */
    const f = fakeFlush();
    syncScheduler.register(f.fn);
    f.block();

    syncScheduler.schedule();
    await jest.advanceTimersByTimeAsync(DEBOUNCE_MS);
    expect(f.count).toBe(1); // 멈춰 있다

    syncScheduler.schedule(); // 보내는 중에 또 저장 → dirty
    syncScheduler.now(); // 복귀 입구로도 들어와 본다
    syncScheduler.register(f.fn); // 배선이 다시 꽂힌다 → 타이머가 걸린다
    await jest.advanceTimersByTimeAsync(DEBOUNCE_MS * 2);

    // 🔴 겹치면 같은 줄을 두 번 밀고 장부가 꼬인다
    expect(f.peak).toBe(1);

    f.release();
    await jest.advanceTimersByTimeAsync(DEBOUNCE_MS);
    expect(f.peak).toBe(1);
  });

  it('보내는 중에 바뀐 것은 끝나고 한 번 더 간다', async () => {
    const f = fakeFlush();
    syncScheduler.register(f.fn);
    f.block();

    syncScheduler.schedule();
    await jest.advanceTimersByTimeAsync(DEBOUNCE_MS);
    expect(f.count).toBe(1);

    syncScheduler.schedule(); // 보내는 도중에 저장했다
    f.release();
    await jest.advanceTimersByTimeAsync(DEBOUNCE_MS);
    // ⚠ 이게 없으면 보내는 1~2초 사이에 넣은 단어가 **다음 저장까지 서버에 안 간다**
    expect(f.count).toBe(2);
  });
});

describe('🔴 실패하면 간격을 늘려 가며 다시 — 인터넷이 돌아오면 그때 간다', () => {
  it('30초 → 2분 → 5분 순서로 다시 민다', async () => {
    const f = fakeFlush();
    syncScheduler.register(f.fn);
    f.say('retry');

    syncScheduler.schedule();
    await jest.advanceTimersByTimeAsync(DEBOUNCE_MS);
    expect(f.count).toBe(1);

    await jest.advanceTimersByTimeAsync(BACKOFF_MS[0]);
    expect(f.count).toBe(2);

    await jest.advanceTimersByTimeAsync(BACKOFF_MS[1]);
    expect(f.count).toBe(3);

    await jest.advanceTimersByTimeAsync(BACKOFF_MS[2]);
    expect(f.count).toBe(4);
  });

  it('마지막 간격에서 멈춘다 — 무한히 늘리지 않는다', async () => {
    const f = fakeFlush();
    syncScheduler.register(f.fn);
    f.say('retry');

    syncScheduler.schedule();
    await jest.advanceTimersByTimeAsync(DEBOUNCE_MS);
    for (const ms of BACKOFF_MS) await jest.advanceTimersByTimeAsync(ms);
    const before = f.count;

    // 그 뒤로도 5분마다 계속 시도한다(앱을 켜 둔 채 인터넷이 돌아오는 경우)
    await jest.advanceTimersByTimeAsync(BACKOFF_MS[BACKOFF_MS.length - 1] * 3);
    expect(f.count).toBe(before + 3);
  });

  it('🔴 인터넷이 돌아오면 그 다음 시도에서 전부 간다', async () => {
    const f = fakeFlush();
    syncScheduler.register(f.fn);
    f.say('retry');

    syncScheduler.schedule();
    await jest.advanceTimersByTimeAsync(DEBOUNCE_MS);
    await jest.advanceTimersByTimeAsync(BACKOFF_MS[0]);
    expect(f.count).toBe(2);

    f.say('done'); // 인터넷이 돌아왔다
    await jest.advanceTimersByTimeAsync(BACKOFF_MS[1]);
    expect(f.count).toBe(3);

    // 성공했으니 더 두드리지 않는다
    await jest.advanceTimersByTimeAsync(BACKOFF_MS[2] * 2);
    expect(f.count).toBe(3);
  });

  it('성공하면 간격이 처음으로 돌아간다', async () => {
    const f = fakeFlush();
    syncScheduler.register(f.fn);

    f.say('retry');
    syncScheduler.schedule();
    await jest.advanceTimersByTimeAsync(DEBOUNCE_MS);
    await jest.advanceTimersByTimeAsync(BACKOFF_MS[0]);
    f.say('done');
    await jest.advanceTimersByTimeAsync(BACKOFF_MS[1]);
    const after = f.count;

    // 다시 실패하면 30초(두 번째 간격이 아니라)부터다
    f.say('retry');
    syncScheduler.schedule();
    await jest.advanceTimersByTimeAsync(DEBOUNCE_MS);
    expect(f.count).toBe(after + 1);
    await jest.advanceTimersByTimeAsync(BACKOFF_MS[0]);
    expect(f.count).toBe(after + 2);
  });

  it('🔴 미는 쪽이 던져도 앱을 죽이지 않는다', async () => {
    let n = 0;
    syncScheduler.register(async () => {
      n += 1;
      throw new Error('터졌다');
    });
    syncScheduler.schedule();
    await jest.advanceTimersByTimeAsync(DEBOUNCE_MS);
    expect(n).toBe(1);
    // 던진 것을 실패로 보고 다시 시도한다
    await jest.advanceTimersByTimeAsync(BACKOFF_MS[0]);
    expect(n).toBe(2);
  });
});

describe('남은 것과 멈춤', () => {
  it("한 배치로 다 못 보냈으면('more') 곧 한 번 더", async () => {
    const f = fakeFlush();
    syncScheduler.register(f.fn);
    f.say('more');

    syncScheduler.schedule();
    await jest.advanceTimersByTimeAsync(DEBOUNCE_MS);
    expect(f.count).toBe(1);

    await jest.advanceTimersByTimeAsync(MORE_MS);
    expect(f.count).toBe(2);

    f.say('done');
    await jest.advanceTimersByTimeAsync(MORE_MS);
    expect(f.count).toBe(3);
    await jest.advanceTimersByTimeAsync(BACKOFF_MS[2]);
    expect(f.count).toBe(3); // 다 보냈으면 멈춘다
  });

  it("서버가 설정돼 있지 않으면('off') 더 두드리지 않는다", async () => {
    const f = fakeFlush();
    syncScheduler.register(f.fn);
    f.say('off');

    syncScheduler.schedule();
    await jest.advanceTimersByTimeAsync(DEBOUNCE_MS);
    expect(f.count).toBe(1);

    // 🔴 다시 걸어도 영원히 같은 답이다. 타이머를 계속 돌리면 배터리만 쓴다
    syncScheduler.schedule();
    syncScheduler.now();
    await jest.advanceTimersByTimeAsync(BACKOFF_MS[2] * 3);
    expect(f.count).toBe(1);
  });
});

describe('🔴 꽂기 전에 들어온 저장을 버리지 않는다', () => {
  it('register 보다 먼저 schedule 이 와도 한 번 돈다', async () => {
    /*
     * 앱이 아주 빨리 뜨는 기기에서 첫 저장이 부팅 배선보다 앞설 수 있다.
     * 그 한 건이 조용히 사라지면 **가장 찾기 어려운 종류의 손실**이다.
     */
    const f = fakeFlush();
    syncScheduler.schedule(); // 아직 아무도 안 꽂았다
    await jest.advanceTimersByTimeAsync(DEBOUNCE_MS * 2);
    expect(f.count).toBe(0);

    syncScheduler.register(f.fn);
    await jest.advanceTimersByTimeAsync(DEBOUNCE_MS);
    expect(f.count).toBe(1);
  });
});

describe('앱으로 돌아올 때는 기다리지 않는다', () => {
  it('now() 는 바로 민다', async () => {
    const f = fakeFlush();
    syncScheduler.register(f.fn);

    syncScheduler.now();
    await jest.advanceTimersByTimeAsync(0);
    // ⚠ 복귀는 묶을 이유가 없다. 3초를 기다리면 그 사이에 앱을 또 내려놓을 수 있다
    expect(f.count).toBe(1);
  });

  it('now() 가 걸려 있던 타이머를 겹쳐 돌리지 않는다', async () => {
    const f = fakeFlush();
    syncScheduler.register(f.fn);

    syncScheduler.schedule();
    await jest.advanceTimersByTimeAsync(DEBOUNCE_MS / 2);
    syncScheduler.now();
    await jest.advanceTimersByTimeAsync(DEBOUNCE_MS * 2);
    expect(f.count).toBe(1);
  });
});

// ── 🔴 소스를 훑어 「부르는 곳이 실제로 있는지」를 지킨다 ──────────────────────

const read = (rel: string): string => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
const strip = (s: string): string =>
  s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');

describe('🔴 쓰는 함수마다 실제로 부른다 (소스 훑기)', () => {
  /*
   * 🔴 **「함수가 있다」와 「그 함수가 불린다」는 다른 명제다.** 2026-10-13 오전에 `pushRest()` 를
   *    만들어 놓고 부르는 곳을 안 만든 것을 잡았다 — 테스트 601개가 전부 초록이었다.
   *    같은 일이 여기서 일어나면 **저장은 되는데 서버에 안 간다.** 증상이 0이고 오류도 없다.
   */
  const SITES: ReadonlyArray<{ file: string; fns: readonly string[] }> = [
    { file: 'src/services/wordService.ts', fns: ['createWord', 'updateWord', 'deleteWord'] },
    {
      file: 'src/services/categoryService.ts',
      fns: ['createCategory', 'updateCategory', 'deleteCategory', 'reorderCategories'],
    },
    { file: 'src/services/quizService.ts', fns: ['saveQuizResults'] },
    { file: 'src/services/examService.ts', fns: ['saveRecord'] },
  ];

  it('⚠ 가드가 실제로 읽었다', () => {
    for (const { file } of SITES) expect(read(file).length).toBeGreaterThan(200);
  });

  it.each(SITES.map((s) => [s.file, s.fns] as const))(
    '%s — 쓰는 함수가 전부 schedule 을 부른다',
    (file, fns) => {
      const src = strip(read(file));
      expect(src).toContain("from './syncScheduler'");
      for (const fn of fns) {
        const at = src.indexOf(`async ${fn}(`);
        expect(at).toBeGreaterThan(0);
        /*
         * 그 함수의 몸통만 본다 — 다음 `async ` 또는 파일 끝까지.
         * ⚠ 파일 전체에서 `schedule()` 을 세면, **한 함수에만 있어도 전부 통과한다.**
         */
        const next = src.indexOf('\n  async ', at + 5);
        const body = src.slice(at, next === -1 ? src.length : next);
        expect(body).toContain('syncScheduler.schedule()');
      }
    },
  );

  it('🔴 부팅 배선이 미는 함수를 꽂고, 복귀에 now() 를 건다', () => {
    const src = strip(read('src/contexts/BootstrapContext.tsx')).replace(/\s+/g, '');
    expect(src).toContain('syncScheduler.register(');
    expect(src).toContain('syncScheduler.now()');
  });

  it('⚠ 스케줄러는 잎이다 — 아무것도 import 하지 않는다', () => {
    /*
     * 🔴 import 를 하나라도 받으면 `wordService → syncScheduler → … → wordService` 고리가
     *    생길 수 있다. 고리가 생기면 **모듈 하나가 빈 객체로 평가되는** 사고가 나고,
     *    그 사고는 런타임에만 보인다.
     */
    const src = read('src/services/syncScheduler.ts');
    expect(src).not.toMatch(/^\s*import\s/m);
  });
});
