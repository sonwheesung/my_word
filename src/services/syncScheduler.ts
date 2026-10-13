/**
 * 🔴 **언제 밀 것인가**만 다룬다. 무엇을 어떻게 미는지는 `syncService` 가 안다.
 *
 * 2026-10-13 사장님 지시: *"그냥 단어 저장, 수정, 삭제 할 때마다 서버로 보내면 안돼?
 * … 인터넷 안되는 환경에서 하면 안되다가 인터넷 연결되면 그 때 보내게 처리해도 좋잖아"*
 *
 * ## 왜 이것부터 고쳤나 — 15시간
 *
 * ```
 * 10-12 20:43   앱이 서버에 마지막으로 올림
 * 10-12 20:46   사장님이 일본어 12개를 넣으심
 * 10-13 11:35   🔴 그 사이 약 15시간 동안 그 12개는 서버에 없었다
 * ```
 *
 * 밀기는 **JS 프로세스가 시작될 때 한 번**만 돌았다. 홈 버튼은 프로세스를 안 죽이므로,
 * 폰을 내려놓으면 그 상태가 밤새 이어진다. 「분석 창고」였을 때는 흠이 아니었지만
 * **「복구 수단」으로는 흠이다** — 그 사이에 폰을 잃으면 돌아올 것이 없다.
 *
 * ## 🟢 큐는 만들지 않았다. 이미 있다
 *
 * `pickChanged` 가 **`updated_at > 마지막으로 민 시각`** 인 것을 고른다. 저장·수정·삭제가
 * 전부 그 칸을 올리므로(삭제는 묘비가 올린다), 보내기에 실패하면 `lastUpdatedAt` 이
 * 안 움직이고 **그동안 쌓인 것이 다음 성공 때 전부 함께 간다.** 기기 DB 자체가 큐다.
 *
 * → 그래서 이 파일이 하는 일은 **타이머 하나**다. 자료구조가 없다.
 *
 * ## 🔴 고리를 만들지 않으려고 이 파일을 따로 뒀다
 *
 * `syncService` 는 단어를 읽어야 해서 아래쪽(`db` · `storage`)을 import 한다. 그런데 미는
 * 시점을 거는 쪽은 `wordService` · `categoryService` 처럼 **위쪽**이다. 위가 아래를 직접
 * 부르면 **import 고리**가 생긴다(`wordService → syncService → wordService`).
 *
 * 그래서 이 모듈은 **아무것도 import 하지 않는 잎**이다. 실제로 미는 함수는 부팅 배선이
 * `register()` 로 꽂아 준다(`BootstrapContext`). 그 전에 들어온 요청은 버리지 않고
 * **꽂히는 순간 한 번 돈다.**
 *
 * ⚠ **던지지 않는다.** 이 기능이 통째로 죽어도 사용자는 아무것도 잃지 않는다 —
 *   기기가 정본이기 때문이다. 그래서 실패를 화면에 띄우지도 않는다.
 */

/** 미는 쪽이 돌려주는 결과. 다음에 무엇을 할지가 여기서 갈린다 */
export type FlushOutcome =
  /** 다 보냈다(보낼 것이 없었던 경우 포함) */
  | 'done'
  /** 보냈는데 남았다 — 한 배치 상한에 걸렸다. 곧 한 번 더 */
  | 'more'
  /** 실패했다 — 인터넷이 없거나 서버가 거절했다. 간격을 늘려 가며 다시 */
  | 'retry'
  /** 서버가 설정돼 있지 않다 — 다시 걸어도 영원히 같다. 멈춘다 */
  | 'off';

export type Flush = () => Promise<FlushOutcome>;

/**
 * 저장 직후 **묶는 시간**. 단어 10개를 연달아 넣으면 요청이 10번 나가는 것이 아니라,
 * 마지막 입력 3초 뒤에 **한 번에** 간다.
 *
 * ⚠ 더 짧게 하면 묶이지 않고, 더 길게 하면 "넣자마자 껐다"에서 놓친다.
 */
export const DEBOUNCE_MS = 3_000;

/** 한 배치로 다 못 보냈을 때 다음 배치까지 — 사용자를 기다리게 하는 일이 아니라 짧게 */
export const MORE_MS = 1_000;

/**
 * 🔴 **실패하면 간격을 늘려 가며 다시 보낸다.** 이것이 「인터넷이 돌아오면 그때 보낸다」를
 *    네이티브 모듈 없이 대신한다 — 네트워크 상태를 듣는 모듈을 넣으면 `runtimeVersion` 이
 *    올라가 **지금까지 낸 OTA 가 전부 끊긴다.** 백그라운드 백업에서 「붙는 그 순간」과
 *    「붙고 30초 안」의 차이는 사용자에게 의미가 없다.
 *
 * ⚠ 마지막 값에서 멈춘다(무한히 늘리지 않는다). 앱을 켜 둔 채 몇 시간이 지나도 5분마다다.
 */
export const BACKOFF_MS = [30_000, 120_000, 300_000] as const;

let flush: Flush | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
/** 지금 보내는 중인가 — 겹쳐 보내면 같은 줄을 두 번 밀고 장부가 꼬인다 */
let running = false;
/** 보내는 중에 또 바뀌었다 — 끝나면 한 번 더 */
let dirty = false;
/** 연속 실패 횟수. 성공하면 0 으로 돌아간다 */
let fails = 0;
/** 서버가 설정돼 있지 않아 멈췄다 */
let stopped = false;

function clear(): void {
  if (timer !== null) {
    clearTimeout(timer);
    timer = null;
  }
}

function arm(ms: number): void {
  clear();
  timer = setTimeout(() => {
    timer = null;
    void run();
  }, ms);
}

/**
 * 🔴 **겹침을 막는 곳은 여기 한 줄이다.** `schedule()`·`now()` 에도 같은 검사가 있지만
 *    그 둘은 **쓸데없는 타이머를 안 걸려는 최적화**이고, 안전장치는 아니다 —
 *    둘을 지워도 아무 테스트가 안 깨진다(2026-10-13 변이로 확인). 여기를 지우면 깨진다.
 *
 * ⚠ 닿는 길: 보내는 중에 저장이 들어와 `dirty` 가 서고, 그 상태에서 `register()` 가 다시
 *   불리면(화면이 다시 마운트되며 배선이 두 번 꽂히는 경우) 타이머가 걸려 여기로 또 들어온다.
 */
async function run(): Promise<void> {
  if (flush === null || running || stopped) return;
  running = true;
  dirty = false;
  let outcome: FlushOutcome = 'retry';
  try {
    outcome = await flush();
  } catch {
    // 🔴 미는 쪽이 던져도 여기서 끝낸다. 이 타이머가 앱을 죽이는 일은 없어야 한다
    outcome = 'retry';
  }
  running = false;

  if (outcome === 'off') {
    stopped = true;
    clear();
    return;
  }
  if (outcome === 'retry') {
    fails += 1;
    arm(BACKOFF_MS[Math.min(fails - 1, BACKOFF_MS.length - 1)] ?? BACKOFF_MS[BACKOFF_MS.length - 1]);
    return;
  }
  fails = 0;
  if (outcome === 'more') {
    arm(MORE_MS);
    return;
  }
  // 'done' — 보내는 동안 또 바뀌었으면 한 번 더
  if (dirty) arm(DEBOUNCE_MS);
}

export const syncScheduler = {
  /**
   * 부팅 배선이 **실제로 미는 함수**를 꽂는다. `BootstrapContext` 한 곳에서만 부른다.
   *
   * ⚠ 꽂히기 전에 들어온 `schedule()` 을 버리지 않는다 — 앱이 아주 빨리 뜨는 기기에서
   *   첫 저장이 배선보다 앞설 수 있고, 그 한 건이 조용히 사라지면 **가장 찾기 어려운 종류**다.
   */
  register(fn: Flush): void {
    flush = fn;
    if (dirty && !stopped) arm(DEBOUNCE_MS);
  },

  /**
   * 「바뀌었다」를 알린다. 단어·단어장·퀴즈·시험을 쓰는 모든 함수가 부른다.
   *
   * ⚠ **await 하지 않는다.** 저장 버튼의 반응이 통신을 기다리면 안 된다.
   * ⚠ 연달아 불러도 요청은 한 번이다 — 마지막 호출로부터 `DEBOUNCE_MS` 뒤에 간다.
   */
  schedule(): void {
    if (stopped) return;
    dirty = true;
    if (running) return; // 끝나면 `dirty` 를 보고 다시 건다
    arm(DEBOUNCE_MS);
  },

  /** 앱으로 돌아왔을 때. 묶을 이유가 없으므로 **바로** 민다 */
  now(): void {
    if (stopped) return;
    dirty = true;
    if (running) return;
    clear();
    void run();
  },

  /** 보낼 것이 밀려 있는가(진단·테스트용) */
  isPending(): boolean {
    return dirty || timer !== null || running;
  },

  /** ⚠ 테스트 전용. 모듈 전역 상태를 비운다 */
  __reset(): void {
    clear();
    flush = null;
    running = false;
    dirty = false;
    fails = 0;
    stopped = false;
  },
};
