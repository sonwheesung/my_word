/**
 * 단어 밀기 검증. 순수 함수와, 소스를 훑는 규칙 하나를 다룬다.
 *
 * 🔴 이 파일이 지키는 가장 무거운 약속: **밀기만 한다.**
 *    서버에서 단어를 당겨 오지 않는다. 당기면 재설치한 사용자가 "서버엔 있는데 내 기기엔
 *    없는" 상태를 보게 되고, 그 순간 서버가 복구 수단인 척하게 된다 — 실제로는 아니다
 *    (기기 식별자가 앱 삭제로 사라지므로). 복구는 백업 파일이 한다.
 *
 * 두 번째 약속: **사적인 칸을 안 보낸다.** 메모·예문·태그는 분석에 쓰지 않는데 사적이다.
 */

declare const require: (id: string) => any;
declare const __dirname: string;

const fs = require('fs') as { readFileSync(p: string, enc: string): string };
const path = require('path') as { join(...parts: string[]): string };

import {
  EMPTY_STATE,
  needsRewind,
  parseState,
  pickChanged,
  toPayload,
} from '../src/services/syncService';
import type { Word } from '../src/types/word';

let seq = 0;
function w(updatedAt: string, over: Partial<Word> = {}): Word {
  seq += 1;
  return {
    wordId: seq,
    categoryId: 1,
    word: 'w' + seq,
    meanings: ['뜻'],
    examples: [],
    createdAt: updatedAt,
    updatedAt,
    ...over,
  };
}

describe('pickChanged — 바뀐 것만 민다', () => {
  it('처음이면 전부 민다', () => {
    const words = [w('2026-10-01T00:00:00.000Z'), w('2026-10-02T00:00:00.000Z')];
    expect(pickChanged(words, null)).toHaveLength(2);
  });

  it('마지막으로 민 것보다 새 것만 민다', () => {
    const words = [
      w('2026-10-01T00:00:00.000Z'),
      w('2026-10-03T00:00:00.000Z'),
      w('2026-10-05T00:00:00.000Z'),
    ];
    const got = pickChanged(words, '2026-10-03T00:00:00.000Z');
    expect(got.map((x) => x.updatedAt)).toEqual([
      '2026-10-03T00:00:00.000Z',
      '2026-10-05T00:00:00.000Z',
    ]);
  });

  it('🔴 경계를 `>=` 로 본다 — `>` 면 같은 밀리초의 단어를 영원히 빠뜨린다', () => {
    const same = '2026-10-03T00:00:00.000Z';
    const words = [w(same), w(same), w(same)];
    // 가져오기로 한꺼번에 저장하면 실제로 이렇게 된다
    expect(pickChanged(words, same)).toHaveLength(3);
  });

  it('오래된 것부터 민다 — 중간에 끊겨도 진행이 앞으로만 간다', () => {
    const words = [w('2026-10-05T00:00:00.000Z'), w('2026-10-01T00:00:00.000Z')];
    expect(pickChanged(words, null)[0].updatedAt).toBe('2026-10-01T00:00:00.000Z');
  });

  it('같은 시각이면 wordId 로 갈라 항상 같은 순서가 나온다', () => {
    const same = '2026-10-03T00:00:00.000Z';
    const a = w(same, { wordId: 9 });
    const b = w(same, { wordId: 2 });
    expect(pickChanged([a, b], null).map((x) => x.wordId)).toEqual([2, 9]);
  });

  it('상한을 넘지 않는다', () => {
    const words = Array.from({ length: 50 }, (_, i) =>
      w(`2026-10-${String((i % 28) + 1).padStart(2, '0')}T00:00:00.000Z`),
    );
    expect(pickChanged(words, null, 10)).toHaveLength(10);
  });

  it('단어가 없으면 빈 배열', () => {
    expect(pickChanged([], null)).toEqual([]);
  });
});

describe('🔴 toPayload — 사적인 칸을 안 보낸다', () => {
  it('메모·예문·태그를 보내지 않는다', () => {
    const word = w('2026-10-01T00:00:00.000Z', {
      memo: '아주 사적인 메모',
      examples: [{ example: '사적인 예문', translation: '번역' }],
      tags: ['비밀'],
    });
    const [payload] = toPayload([word]);
    const asText = JSON.stringify(payload);
    expect(asText).not.toContain('사적인 메모');
    expect(asText).not.toContain('사적인 예문');
    expect(asText).not.toContain('비밀');
    expect(Object.keys(payload).sort()).toEqual(
      ['categoryId', 'createdAt', 'language', 'meanings', 'updatedAt', 'word', 'wordId'].sort(),
    );
  });

  it('보내는 칸은 그대로 담는다', () => {
    const word = w('2026-10-01T00:00:00.000Z', { word: '機会', meanings: ['기회'], language: 'ja' });
    const [p] = toPayload([word]);
    expect(p).toMatchObject({ word: '機会', meanings: ['기회'], language: 'ja' });
  });

  it('language 가 없으면 null', () => {
    expect(toPayload([w('2026-10-01T00:00:00.000Z')])[0].language).toBeNull();
  });

  it('meanings 가 없어도 던지지 않는다', () => {
    const word = w('2026-10-01T00:00:00.000Z');
    delete (word as { meanings?: unknown }).meanings;
    expect(toPayload([word])[0].meanings).toEqual([]);
  });
});

describe('parseState — 어떤 입력에도 던지지 않는다', () => {
  it.each([[null], [''], ['{{{'], ['42'], ['[1,2]'], ['null']])('%s → 기본값', (raw) => {
    expect(parseState(raw as string | null)).toEqual(EMPTY_STATE);
  });

  it('모양이 맞으면 읽는다', () => {
    const raw = JSON.stringify({
      lastUpdatedAt: '2026-10-01T00:00:00.000Z',
      lastSyncedAt: '2026-10-02T00:00:00.000Z',
      serverTotal: 12,
    });
    expect(parseState(raw)).toEqual({
      lastUpdatedAt: '2026-10-01T00:00:00.000Z',
      lastSyncedAt: '2026-10-02T00:00:00.000Z',
      serverTotal: 12,
      // 옛 저장본에는 없는 칸이다 — 없으면 null 로 읽어야 한다(2026-10-07 추가)
      rewoundFor: null,
    });
  });

  it('타입이 틀린 칸은 null 로 떨어뜨린다', () => {
    expect(parseState(JSON.stringify({ lastUpdatedAt: 7, serverTotal: 'x' }))).toEqual(EMPTY_STATE);
  });

  it('🔴 기본값을 돌려줄 때 공유 객체를 주지 않는다', () => {
    const a = parseState(null);
    a.serverTotal = 99;
    expect(parseState(null).serverTotal).toBeNull();
  });
});

// ── 🔴 소스를 훑어 규칙을 기계로 지킨다 ─────────────────────────────────────

const FILES = ['src/services/syncService.ts'];

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

const read = (rel: string): string => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');

describe('🔴 밀기만 한다 (소스 훑기)', () => {
  it('훑을 파일이 실제로 존재한다', () => {
    for (const rel of FILES) {
      expect(() => read(rel)).not.toThrow();
      expect(read(rel).length).toBeGreaterThan(0);
    }
  });

  it('🔴 서버에서 단어를 당겨 오는 호출이 없다', () => {
    const src = stripComments(read('src/services/syncService.ts'));
    // SDK 에서 쓰는 것은 밀기 하나뿐이어야 한다
    const calls = src.match(/commonServer\.\w+/g) ?? [];
    expect(new Set(calls)).toEqual(new Set(['commonServer.isConfigured', 'commonServer.syncWords']));
  });

  it('🔴 단어를 쓰지 않는다 — 이 서비스는 읽기만 한다', () => {
    const src = stripComments(read('src/services/syncService.ts'));
    for (const banned of ['createWord', 'updateWord', 'deleteWord', 'wordStorage']) {
      expect(src).not.toContain(banned);
    }
  });

  it('🔴 메모·예문·태그를 payload 에 담지 않는다', () => {
    const src = stripComments(read('src/services/syncService.ts'));
    const fn = src.slice(src.indexOf('export function toPayload'));
    const body = fn.slice(0, fn.indexOf('export const syncService'));
    for (const banned of ['memo', 'examples', 'tags']) {
      expect(body).not.toContain(banned);
    }
  });
});

describe('🔴 needsRewind — 서버가 나보다 적게 들고 있으면 장부를 의심한다', () => {
  const st = (over: Partial<typeof EMPTY_STATE> = {}) => ({ ...EMPTY_STATE, ...over });

  it('🔴 실기기에서 난 그 상태: 다 밀었다고 믿는데 서버엔 1개', () => {
    expect(needsRewind(st({ lastUpdatedAt: '2026-10-07T10:46:03.837Z', serverTotal: 1 }), 17)).toBe(true);
  });

  it('서버가 나만큼 들고 있으면 되감지 않는다', () => {
    expect(needsRewind(st({ lastUpdatedAt: 'x', serverTotal: 17 }), 17)).toBe(false);
  });

  it('서버가 더 많아도 되감지 않는다 (지운 단어가 서버에 남는다)', () => {
    expect(needsRewind(st({ lastUpdatedAt: 'x', serverTotal: 20 }), 17)).toBe(false);
  });

  it('⚠ 아직 한 번도 안 밀었으면 되감을 것이 없다', () => {
    expect(needsRewind(st({ lastUpdatedAt: null, serverTotal: 1 }), 17)).toBe(false);
  });

  it('⚠ 서버 수를 모르면 되감지 않는다 — 모르는 것으로 판단하지 않는다', () => {
    expect(needsRewind(st({ lastUpdatedAt: 'x', serverTotal: null }), 17)).toBe(false);
    // 🔴 되감은 적이 있는 상태에서도 그렇다. `null >= n` 이 false 라 이 줄이 없으면
    //    `rewoundFor !== null` 이 참이 되어 **모르는 채로 되감는다**(변이 테스트가 짚었다)
    expect(needsRewind(st({ lastUpdatedAt: 'x', serverTotal: null, rewoundFor: 3 }), 17)).toBe(false);
  });

  it('🔴 같은 숫자로 두 번 되감지 않는다 (부팅마다 전부 다시 미는 것을 막는다)', () => {
    expect(needsRewind(st({ lastUpdatedAt: 'x', serverTotal: 1, rewoundFor: 1 }), 17)).toBe(false);
  });

  it('어긋난 숫자가 달라지면 다시 한 번 되감는다', () => {
    expect(needsRewind(st({ lastUpdatedAt: 'x', serverTotal: 5, rewoundFor: 1 }), 17)).toBe(true);
  });

  it('단어가 0개면 되감지 않는다 (0 < 0 이 아니다)', () => {
    expect(needsRewind(st({ lastUpdatedAt: 'x', serverTotal: 0 }), 0)).toBe(false);
  });

  it('parseState 가 rewoundFor 를 읽는다', () => {
    expect(parseState(JSON.stringify({ rewoundFor: 3 })).rewoundFor).toBe(3);
    expect(parseState(JSON.stringify({ rewoundFor: 'x' })).rewoundFor).toBeNull();
    expect(parseState(JSON.stringify({ rewoundFor: NaN })).rewoundFor).toBeNull();
  });
});

// ── 🔴 pushOnce 의 **동작**을 잰다 ──────────────────────────────────────────
//
// 위의 `needsRewind` 테스트는 순수 함수다. 그것만으로는 **그 답을 실제로 쓰는가**를 못 본다 —
// 변이 테스트에서 둘이 그대로 빠져나갔다(되감기를 계산만 하고 안 쓰기 · 되감은 사실을 안 남기기).
//
// ⚠ 단어는 **시각을 직접 쥐고** 만든다. 진짜 저장소로 연달아 만들면 `updatedAt` 이 같은
//   밀리초에 몰리고, `pickChanged` 가 경계를 `>=` 로 보므로 매번 전부 다시 밀린다 —
//   그건 설계대로이지 결함이 아니라서, 그대로 두면 되감기를 재는 눈이 멀어 버린다.

import AsyncStorageForPush from '@react-native-async-storage/async-storage';
import { syncService } from '../src/services/syncService';

const sent: number[][] = [];
// ⚠ 이름이 `mock` 으로 시작해야 한다 — jest 가 목 공장 안의 바깥 변수 접근을 그것만 허용한다
let mockWords: Word[] = [];

jest.mock('../src/services/commonServer/client', () => ({
  commonServer: { isConfigured: () => true, syncWords: jest.fn() },
  ensureDeviceSession: jest.fn(async () => true),
}));

jest.mock('../src/services/wordService', () => ({
  wordService: { getWords: jest.fn(async () => mockWords) },
}));

describe('🔴 pushOnce — 되감기를 실제로 쓰는가', () => {
  const { commonServer } = require('../src/services/commonServer/client');

  /** 서버가 늘 `total` 을 말하게 한다. 받은 것은 `sent` 에 쌓인다 */
  function serverSays(total: number | 'accumulate'): void {
    let held = 0;
    commonServer.syncWords.mockImplementation(async (payload: { wordId: number }[]) => {
      sent.push(payload.map((p) => p.wordId));
      held += payload.length;
      return { ok: true, accepted: payload.length, total: total === 'accumulate' ? held : total };
    });
  }

  beforeEach(async () => {
    await AsyncStorageForPush.clear();
    sent.length = 0;
    mockWords = [1, 2, 3].map((n) =>
      w('2026-10-0' + n + 'T00:00:00.000Z', { wordId: n, word: 'w' + n }),
    );
    serverSays('accumulate');
  });

  it('처음에는 전부 민다', async () => {
    const r = await syncService.pushOnce();
    expect(r.pushed).toBe(3);
    expect(sent[0]).toEqual([1, 2, 3]);
  });

  it('두 번째는 밀 것이 없다 (서버가 나만큼 들고 있다)', async () => {
    await syncService.pushOnce();
    // ⚠ 경계가 `>=` 라 마지막 하나는 늘 다시 간다. 서버 쓰기가 멱등이라 괜찮다
    const r = await syncService.pushOnce();
    expect(r.pushed).toBe(1);
    expect(sent[1]).toEqual([3]);
  });

  it('🔴 서버가 잃어버리면 전부 다시 민다 (실기기에서 난 그 상태)', async () => {
    await syncService.pushOnce();
    serverSays(1); // 주체 정리 · 복원 · 결함 — 이유가 무엇이든 서버가 적게 들고 있다
    /*
     * ⚠ **어긋남은 한 라운드 뒤에 발견된다.** 기기가 서버의 수를 아는 길은 밀어 보고 듣는 것뿐이라,
     *   이 호출은 아직 옛 숫자(3)를 들고 판단한다. 새 숫자(1)를 들은 **다음** 호출이 되감는다.
     *   🔴 그래서 경계를 `>=` 로 둔 것이 여기서도 일한다 — 밀 것이 늘 하나는 있어서
     *   라운드가 끊기지 않는다. `>` 였다면 어긋난 기기가 **아무것도 안 보내며 영원히 조용하다.**
     */
    await syncService.pushOnce();
    expect(sent[sent.length - 1]).toEqual([3]);

    await syncService.pushOnce();
    expect(sent[sent.length - 1]).toEqual([1, 2, 3]);
  });

  it('🔴 같은 숫자로는 두 번 되감지 않는다 (부팅마다 전부 다시 밀지 않는다)', async () => {
    await syncService.pushOnce();
    serverSays(1);
    await syncService.pushOnce(); // 새 숫자를 듣는다
    await syncService.pushOnce(); // 어긋남을 보고 한 번 되감는다
    const after = sent.length;
    await syncService.pushOnce();
    await syncService.pushOnce();
    // 그 뒤로는 경계 뒤의 한 개씩만 간다. 전부(3개)가 다시 가면 안 된다
    expect(sent.slice(after).every((batch) => batch.length === 1)).toBe(true);
  });

  it('⚠ 서버가 더 많이 들고 있어도 되감지 않는다 (지운 단어가 서버에 남는다)', async () => {
    await syncService.pushOnce();
    serverSays(99);
    await syncService.pushOnce();
    await syncService.pushOnce();
    const r = await syncService.pushOnce();
    expect(r.pushed).toBe(1);
  });

  it('🔴 되감은 사실이 저장본에 남는다', async () => {
    await syncService.pushOnce();
    serverSays(1);
    await syncService.pushOnce(); // 새 숫자를 듣는다
    expect((await syncService.loadState()).rewoundFor).toBeNull();
    await syncService.pushOnce(); // 되감는다
    expect((await syncService.loadState()).rewoundFor).toBe(1);
  });
});
