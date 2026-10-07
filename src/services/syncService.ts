import { SYNC_STATE_KEY } from '../constants/appConfig';
import { readRaw, writeRaw } from '../utils/storage';
import { commonServer, ensureDeviceSession } from './commonServer/client';
import { wordService } from './wordService';
import type { Word } from '../types/word';

/**
 * 단어 밀기 — **기기가 정본이고 서버는 사본이자 분석 창고다**(2026-10-07).
 *
 * `mission` 의 기둥 6 을 그대로 따른다. 이 서비스가 **통째로 실패해도 앱은 아무것도 잃지 않는다** —
 * 그래서 실패를 화면에 띄우지 않고 다음 기회에 다시 민다. 이 앱의 규율이
 * *"서버가 죽어도 화면은 멀쩡히"* 이고, 동기화는 그 규율을 가장 엄격히 지켜야 하는 자리다.
 *
 * ## 🔴 밀기만 한다
 *
 * 당기기(서버 → 기기)가 없다. 이유가 둘이다:
 * - **복구 경로가 아니다.** 신원이 기기 식별자뿐이고 앱을 지우면 사라진다. 서버를 복구 수단으로
 *   쓰면 재설치한 사용자가 **자기 단어를 못 찾는데 서버엔 남아 있는** 최악이 된다.
 *   복구는 기존 백업 파일이 한다.
 * - 양방향이면 충돌 병합이 필요한데, 그 복잡도를 지금 사용자 수로는 살 이유가 없다.
 *
 * ## 무엇을 미나
 *
 * 마지막으로 민 시각 이후에 **바뀐 것만** 민다. 전부 밀면 단어가 수천 개인 사용자에게
 * 매번 수 MB 가 나간다.
 *
 * ⚠ **지운 단어는 지금 밀지 못한다.** 기기에서 진짜로 지우기 때문에(soft delete 가 아니다)
 *   "지웠다"는 사실이 남지 않는다. 그래서 서버에는 지운 단어가 남는다.
 *   🔴 이걸 고치려면 기기 삭제를 묘비로 바꿔야 하고, 그건 `repo.ts` 가 *"동작을 바꾸지 않는다"* 로
 *   미뤄 둔 것이다. 서버 표에 `deleted_at` 칸은 **미리 만들어 두었다**(그때 쓴다).
 */

/** 한 번에 미는 최대 개수. 🔴 서버의 `MAX_BATCH`(500)와 같거나 작아야 한다 */
const BATCH = 200;

export interface SyncState {
  /** 마지막으로 민 단어의 `updatedAt`. 이것보다 새 것만 민다 */
  lastUpdatedAt: string | null;
  /** 마지막으로 민 시각(진단용) */
  lastSyncedAt: string | null;
  /** 서버가 아는 총 개수. 🔴 진단용이 아니다 — `needsRewind` 가 이것으로 장부를 의심한다 */
  serverTotal: number | null;
  /**
   * 마지막으로 **되감았을 때의** `serverTotal`.
   *
   * 🔴 같은 숫자로는 두 번 되감지 않기 위한 것이다. 서버가 어떤 이유로 끝내 다 받지 못하면
   *    이것이 없으면 **부팅마다 전부 다시 밀게 된다.**
   */
  rewoundFor: number | null;
}

export const EMPTY_STATE: SyncState = {
  lastUpdatedAt: null,
  lastSyncedAt: null,
  serverTotal: null,
  rewoundFor: null,
};

/** 🔴 어떤 입력에도 던지지 않는다 — 상태 하나가 깨졌다고 동기화가 멈추면 안 된다 */
export function parseState(raw: string | null): SyncState {
  if (!raw) return { ...EMPTY_STATE };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ...EMPTY_STATE };
  }
  if (typeof parsed !== 'object' || parsed === null) return { ...EMPTY_STATE };
  const o = parsed as Record<string, unknown>;
  return {
    lastUpdatedAt: typeof o.lastUpdatedAt === 'string' ? o.lastUpdatedAt : null,
    lastSyncedAt: typeof o.lastSyncedAt === 'string' ? o.lastSyncedAt : null,
    serverTotal: typeof o.serverTotal === 'number' && Number.isFinite(o.serverTotal) ? o.serverTotal : null,
    rewoundFor: typeof o.rewoundFor === 'number' && Number.isFinite(o.rewoundFor) ? o.rewoundFor : null,
  };
}

/**
 * **장부를 되감아야 하는가.** 순수 함수다.
 *
 * 🔴 **2026-10-07 실기기에서 찾았다.** 기기 장부는 *"10:46 까지 다 밀었다"* 인데 서버에는
 *    단어가 **17개 중 1개**뿐이었다. 그런데 서버는 매번 자기가 가진 수(`total`)를 돌려주고
 *    기기는 그걸 `serverTotal` 로 **저장까지 하고 있었다** — 증거를 손에 들고 안 본 것이다.
 *
 * 🔴 **이 구멍은 스스로 닫히지 않는다.** `pushOnce` 는 밀 것이 없으면(`batch.length === 0`)
 *    서버에 **아예 묻지 않고** 돌아간다. 그래서 한 번 어긋나면 그 침묵이 **영구적**이다.
 *    밀기는 실패를 화면에 안 띄우는 기능이라 아무도 눈치채지 못한다.
 *
 * ⚠ **모르는 것으로 되감지 않는다.** `serverTotal` 이 `null`(아직 한 번도 못 물어봄)이거나
 *   `lastUpdatedAt` 이 `null`(아직 한 번도 안 밂)이면 되감을 것이 없다.
 *
 * ⚠ **같은 숫자로 두 번 되감지 않는다**(`rewoundFor`). 서버가 끝내 다 못 받는 상태라면
 *   그것 없이는 **부팅마다 전부 다시 밀게 된다.** 되감기는 고치려는 시도이지 재시도 루프가 아니다.
 */
export function needsRewind(state: SyncState, localCount: number): boolean {
  if (state.lastUpdatedAt === null) return false;
  if (state.serverTotal === null) return false;
  if (state.serverTotal >= localCount) return false;
  return state.rewoundFor !== state.serverTotal;
}

/**
 * 밀 단어를 고른다. **순수 함수다.**
 *
 * ⚠ 비교는 `>` 가 아니라 `>=` 다. 같은 밀리초에 여러 단어가 바뀌면 `>` 는 뒤의 것을 영원히
 *   빠뜨린다(한 번에 여러 개를 저장하는 가져오기에서 실제로 일어난다).
 *   서버가 멱등이라 같은 것을 다시 밀어도 비용은 한 줄 갱신뿐이다.
 */
export function pickChanged(words: readonly Word[], since: string | null, limit: number = BATCH): Word[] {
  const changed = since === null ? [...words] : words.filter((w) => w.updatedAt >= since);
  // 오래된 것부터 민다 — 중간에 끊겨도 `lastUpdatedAt` 이 앞으로만 간다
  changed.sort((a, b) => a.updatedAt.localeCompare(b.updatedAt) || a.wordId - b.wordId);
  return changed.slice(0, limit);
}

/** 서버가 받는 모양으로 편다. 🔴 메모·예문·태그는 **보내지 않는다** — 분석에 쓰지 않는데 사적인 내용이다 */
export function toPayload(words: readonly Word[]): Array<{
  wordId: number;
  word: string;
  meanings: string[];
  language: string | null;
  categoryId: number;
  createdAt: string;
  updatedAt: string;
}> {
  return words.map((w) => ({
    wordId: w.wordId,
    word: w.word,
    meanings: w.meanings ?? [],
    language: w.language ?? null,
    categoryId: w.categoryId,
    createdAt: w.createdAt,
    updatedAt: w.updatedAt,
  }));
}

export const syncService = {
  async loadState(): Promise<SyncState> {
    return parseState(await readRaw(SYNC_STATE_KEY));
  },

  /** 상태 저장이 실패해도 앱은 굴러가야 하므로 삼킨다 */
  async saveState(state: SyncState): Promise<void> {
    try {
      await writeRaw(SYNC_STATE_KEY, JSON.stringify(state));
    } catch (error: any) {
      console.warn('동기화 상태 저장 실패:', error);
    }
  },

  /**
   * 한 번 민다. **던지지 않고 결과만 돌려준다.**
   *
   * 🔴 부르는 쪽은 이 결과로 **화면을 바꾸지 않는다.** 실패는 다음 기회에 다시 민다.
   * ⚠ 한 번에 `BATCH` 개까지만 민다. 남은 것은 다음 호출이 가져간다 —
   *   한 번에 다 밀려고 루프를 돌면 부팅이 느려지고, 그건 사용자가 겪는 손해다.
   */
  async pushOnce(): Promise<{ pushed: number; remaining: number; reason?: string }> {
    try {
      if (!commonServer.isConfigured()) return { pushed: 0, remaining: 0, reason: 'not-configured' };

      const state = await this.loadState();
      const words = await wordService.getWords();
      /*
       * 🔴 **서버가 나보다 적게 들고 있으면 장부를 되감아 전부 다시 민다**(`needsRewind`).
       *    서버 쓰기는 멱등(같은 키에 덮어쓰기)이라 다시 미는 비용은 줄 갱신뿐이다.
       */
      const rewind = needsRewind(state, words.length);
      const batch = pickChanged(words, rewind ? null : state.lastUpdatedAt);
      if (batch.length === 0) return { pushed: 0, remaining: 0 };

      let result = await commonServer.syncWords(toPayload(batch));
      /*
       * 🔴 **세션이 끊겼으면 한 번 되살리고 다시 민다**(2026-10-07 에뮬레이터에서 잡았다).
       *
       *    `ensureDeviceSession` 은 **저장소에 토큰이 있으면 복원됐다고 보고 재등록을 건너뛴다.**
       *    그런데 그 토큰이 가리키는 주체가 서버에서 사라졌을 수 있다(탈퇴·운영 정리).
       *    밀기는 조용히 실패하는 것이 설계라, 그대로 두면 **영원히 한 줄도 안 밀린다** —
       *    실패가 눈에 안 보이는 기능일수록 이 자리가 위험하다.
       *
       * ⚠ **한 번만** 한다. 루프가 되면 재등록 레이트리밋(IP당 10회/600초)에 걸린다.
       */
      if (!result.ok && (result.reason === 'unauthorized' || result.reason === 'not-signed-in')) {
        if (await ensureDeviceSession()) {
          result = await commonServer.syncWords(toPayload(batch));
        }
      }
      if (!result.ok) return { pushed: 0, remaining: batch.length, reason: result.reason };

      const last = batch[batch.length - 1];
      await this.saveState({
        lastUpdatedAt: last === undefined ? state.lastUpdatedAt : last.updatedAt,
        lastSyncedAt: new Date().toISOString(),
        serverTotal: result.total,
        // 되감았다는 사실을 남긴다 — 같은 숫자로 또 되감지 않기 위해서다
        rewoundFor: rewind ? state.serverTotal : state.rewoundFor,
      });
      /*
       * ⚠ 방금 민 것을 빼고 센다. `pickChanged` 는 경계를 `>=` 로 보므로(같은 밀리초를 빠뜨리지
       *   않기 위해) 그대로 세면 **마지막 단어가 늘 "남은 것"으로 잡힌다.** 로그가 거짓말한다.
       */
      const pushedIds = new Set(batch.map((b) => b.wordId));
      const remaining = pickChanged(words, last?.updatedAt ?? null).filter(
        (x) => !pushedIds.has(x.wordId),
      ).length;
      return { pushed: result.accepted, remaining };
    } catch (error: any) {
      // 🔴 여기서 던지면 부팅이 멈춘다. 삼키되 남긴다
      console.warn('단어 밀기 실패:', error);
      return { pushed: 0, remaining: 0, reason: 'error' };
    }
  },
};
