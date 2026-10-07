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

import { EMPTY_STATE, parseState, pickChanged, toPayload } from '../src/services/syncService';
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
