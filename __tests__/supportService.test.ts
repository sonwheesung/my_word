/**
 * 문의 전송 계약 테스트 — 앱이 공통 서버로 정확히 무엇을 보내는지 고정한다.
 *
 * 서버(POST /api/v1/tickets)는 app 등록여부·본문 5자·category 화이트리스트로 검증하므로
 * 필드명이나 형태가 틀어지면 조용히 404/400 이 된다. 여기서 요청 본문을 못 박아 드리프트를 막는다.
 * 익명성(작성자 식별자 미전송)도 이 테스트가 지킨다.
 */

// appConfig 는 모듈 로드 시 process.env 를 읽는다. import 는 호이스팅되므로 이 파일 안에서
// 주입하면 이미 늦다 — 값은 jest.setup.js 에서 미리 넣어두고 여기선 같은 값을 참조만 한다.
const SERVER_URL = 'https://support.test';

import { supportService } from '../src/services/supportService';
import { APP_VERSION } from '../src/constants/appConfig';

type FetchArgs = [string, RequestInit];

// tsconfig 의 types 에 node 가 없어 `global` 은 쓸 수 없다 — 표준 globalThis 를 쓴다.
const mockFetch = jest.fn();
(globalThis as unknown as { fetch: jest.Mock }).fetch = mockFetch;

function lastRequest(): { url: string; body: Record<string, unknown>; init: RequestInit } {
  const [url, init] = mockFetch.mock.calls[mockFetch.mock.calls.length - 1] as FetchArgs;
  return { url, init, body: JSON.parse(init.body as string) };
}

beforeEach(() => {
  mockFetch.mockReset();
});

describe('supportService — 요청 계약', () => {
  it('서버가 기대하는 경로와 필드로 보낸다', async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 200 });

    const result = await supportService.sendInquiry('bug', '단어 저장이 가끔 안 됩니다');

    expect(result).toEqual({ ok: true });
    expect(mockFetch).toHaveBeenCalledTimes(1);

    const { url, body, init } = lastRequest();
    expect(url).toBe(`${SERVER_URL}/api/v1/tickets`);
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['content-type']).toBe('application/json');

    // 공통 서버는 프로젝트 축을 `app` 으로 받는다(옛 배구 서버의 `proj` 아님).
    expect(body.app).toBe('myword');
    expect(body.category).toBe('bug');
    expect(body.content).toBe('단어 저장이 가끔 안 됩니다');
    expect(body.device).toEqual({ platform: expect.any(String), appVersion: APP_VERSION });
  });

  it('작성자를 식별할 수 있는 값은 보내지 않는다', async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 200 });
    await supportService.sendInquiry('etc', '익명성 확인용 문의입니다');

    const { body } = lastRequest();
    // 최상위 키는 정확히 이 네 개뿐 — userId/token/deviceId 등이 슬며시 늘어나면 실패한다.
    expect(Object.keys(body).sort()).toEqual(['app', 'category', 'content', 'device']);
    // device 도 마찬가지 — osVersion 처럼 서버가 저장하지도 않는 값이 붙는 것을 막는다.
    expect(Object.keys(body.device as object).sort()).toEqual(['appVersion', 'platform']);
  });

  it('본문 앞뒤 공백을 잘라서 보낸다', async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 200 });
    await supportService.sendInquiry('question', '   공백이 붙은 문의입니다   ');

    expect(lastRequest().body.content).toBe('공백이 붙은 문의입니다');
  });

  it('네 가지 분류를 그대로 전달한다', async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 200 });
    for (const category of ['bug', 'suggestion', 'question', 'etc'] as const) {
      await supportService.sendInquiry(category, '분류별 전달 확인용 문의');
      expect(lastRequest().body.category).toBe(category);
    }
  });
});

describe('supportService — 실패 처리', () => {
  it('짧은 본문은 네트워크를 타지 않고 거절한다', async () => {
    const result = await supportService.sendInquiry('bug', '짧음');

    expect(result).toEqual({ ok: false, reason: 'too-short' });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('공백만 있는 본문도 거절한다', async () => {
    const result = await supportService.sendInquiry('bug', '        ');

    expect(result).toEqual({ ok: false, reason: 'too-short' });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('429 는 rate-limited 로 구분한다', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 429 });

    expect(await supportService.sendInquiry('bug', '한도 초과 확인용 문의')).toEqual({
      ok: false,
      reason: 'rate-limited',
    });
  });

  it('404 는 not-found 로 구분한다 (서버에 앱이 등록되지 않은 상태)', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 404 });

    expect(await supportService.sendInquiry('bug', '미등록 앱 확인용 문의')).toEqual({
      ok: false,
      reason: 'not-found',
    });
  });

  it('그 밖의 실패 응답은 error 로 묶는다', async () => {
    for (const status of [400, 500]) {
      mockFetch.mockResolvedValue({ ok: false, status });
      expect(await supportService.sendInquiry('bug', '서버 오류 확인용 문의')).toEqual({
        ok: false,
        reason: 'error',
      });
    }
  });

  // 503 은 SDK 의 mapFail 이 not-configured 로 따로 뺀다 — "서버가 아직 못 여는 상태"이지
  // 앱 잘못이 아니고 재시도가 의미 있다. 화면도 그에 맞는 문구를 골라야 하므로 error 와 섞지 않는다.
  // ⚠ 이 기대는 원래 위 루프에 503 이 섞여 있어 error 를 요구했는데, SDK 계약과 어긋난 채로
  //   **스위트가 로드조차 안 돼(2026-09-01 목 누락) 아무도 못 봤다.** 계약의 정본은 SDK 다.
  it('503 은 not-configured 로 구분한다 (서버가 아직 못 여는 상태)', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 503 });

    expect(await supportService.sendInquiry('bug', '서버 준비중 확인용 문의')).toEqual({
      ok: false,
      reason: 'not-configured',
    });
  });

  it('네트워크 예외는 offline 로 흡수하고 throw 하지 않는다', async () => {
    mockFetch.mockRejectedValue(new Error('Network request failed'));

    await expect(supportService.sendInquiry('bug', '오프라인 확인용 문의')).resolves.toEqual({
      ok: false,
      reason: 'offline',
    });
  });

  it('요청에 중단 신호(타임아웃)를 붙인다', async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 200 });
    await supportService.sendInquiry('bug', '타임아웃 신호 확인용 문의');

    expect(lastRequest().init.signal).toBeDefined();
  });
});

describe('supportService — 서버 URL 미설정 빌드', () => {
  it('URL 이 없으면 not-configured 로 알리고 호출하지 않는다', async () => {
    jest.resetModules();
    process.env.EXPO_PUBLIC_SERVER_URL = '';
    // 모듈 로드 시점에 URL 을 읽으므로 초기화를 다시 시켜야 한다.
    const { supportService: unconfigured } = require('../src/services/supportService');

    const result = await unconfigured.sendInquiry('bug', '서버 미설정 확인용 문의');

    expect(result).toEqual({ ok: false, reason: 'not-configured' });
    expect(unconfigured.isConfigured()).toBe(false);
    expect(mockFetch).not.toHaveBeenCalled();

    process.env.EXPO_PUBLIC_SERVER_URL = SERVER_URL;
  });
});
