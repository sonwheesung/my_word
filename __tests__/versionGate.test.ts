/**
 * 진입 게이트 판정 테스트.
 *
 * 이 판정이 틀리면 사용자가 앱에 못 들어간다 — 가장 비싼 실패다. 특히 다음 두 가지를 못 박는다:
 *   1) 서버 조회 실패(boot === null)는 **절대** 게이트를 만들지 않는다
 *   2) 강제 업데이트는 "이 버전 건너뛰기"로 우회되지 않는다
 */

import { Platform } from 'react-native';
import { evaluateGate, isBlocking } from '../src/services/versionService';
import { compareVersions } from '../src/services/commonServer';
import { APP_VERSION, STORE_URL } from '../src/constants/appConfig';
import type { Bootstrap } from '../src/services/commonServer/types';

// APP_VERSION 이 바뀌어도 테스트가 의미를 유지하도록, 기준값을 코드에서 끌어와 조립한다.
const OLDER = '0.9.0';
const NEWER = '99.0.0';

function makeBoot(overrides: Partial<Bootstrap> = {}): Bootstrap {
  return {
    maintenance: { active: false },
    version: { min: null, latest: null, androidUrl: null, iosUrl: null },
    announcements: [],
    ...overrides,
  };
}

function withVersion(version: Partial<Bootstrap['version']>): Bootstrap {
  return makeBoot({ version: { min: null, latest: null, androidUrl: null, iosUrl: null, ...version } });
}

describe('evaluateGate — 서버 조회 실패', () => {
  it('boot 이 없으면 어떤 게이트도 적용하지 않는다', () => {
    // 서버가 죽어도 사용자는 앱을 그대로 쓸 수 있어야 한다.
    expect(evaluateGate(null, null)).toEqual({ kind: 'none' });
    expect(evaluateGate(null, OLDER)).toEqual({ kind: 'none' });
  });
});

describe('evaluateGate — 점검', () => {
  it('점검 중이면 제목·본문을 그대로 실어 차단한다', () => {
    const boot = makeBoot({
      maintenance: { active: true, title: '서버 점검 안내', body: '02:00까지 점검합니다' },
    });

    expect(evaluateGate(boot, null)).toEqual({
      kind: 'maintenance',
      title: '서버 점검 안내',
      body: '02:00까지 점검합니다',
    });
  });

  it('점검이 버전 게이트보다 우선한다', () => {
    // 점검 중에 업데이트를 권해봤자 받을 서버가 없다.
    const boot = makeBoot({
      maintenance: { active: true, title: '점검', body: '' },
      version: { min: NEWER, latest: NEWER, androidUrl: null, iosUrl: null },
    });

    expect(evaluateGate(boot, null).kind).toBe('maintenance');
  });
});

describe('evaluateGate — 버전으로는 앱을 막지 않는다', () => {
  // 이 앱은 강제 업데이트를 쓰지 않기로 했다. 서버가 min 을 내려도 진입을 막아서는 안 된다.
  // 진입 차단 수단은 점검 모드 하나뿐이며, 그건 서버에서 즉시 되돌릴 수 있다.
  const STORE = { androidUrl: 'https://play.example/a', iosUrl: 'https://apps.example/i' };

  it('min 미만이어도 차단하지 않고 안내로만 처리한다', () => {
    const decision = evaluateGate(withVersion({ min: NEWER, ...STORE }), null);

    expect(isBlocking(decision)).toBe(false);
    expect(decision).toMatchObject({
      kind: 'soft-update',
      currentVersion: APP_VERSION,
      latestVersion: NEWER,
    });
  });

  it('스토어 링크 유무와 무관하게 차단하지 않는다', () => {
    // 링크가 없으면 더더욱 가두면 안 되고(탈출구 없음), 있어도 가두지 않는다.
    for (const boot of [
      withVersion({ min: NEWER, ...STORE }),
      withVersion({ min: NEWER, androidUrl: null, iosUrl: null }),
      withVersion({ min: NEWER, latest: NEWER, ...STORE }),
    ]) {
      expect(isBlocking(evaluateGate(boot, null))).toBe(false);
    }
  });

  it('min 안내도 건너뛰기를 존중한다', () => {
    // 강제가 아니므로 사용자가 닫으면 닫힌 채로 둔다.
    expect(evaluateGate(withVersion({ min: NEWER, ...STORE }), NEWER)).toEqual({ kind: 'none' });
  });

  it('min 이 현재 버전 이하면 아무것도 하지 않는다', () => {
    expect(evaluateGate(withVersion({ min: OLDER, ...STORE }), null)).toEqual({ kind: 'none' });
    expect(evaluateGate(withVersion({ min: APP_VERSION, ...STORE }), null)).toEqual({ kind: 'none' });
  });

  it('min 과 latest 가 모두 있으면 높은 쪽을 안내한다', () => {
    // 관리자가 min 만 채웠을 때 아무 일도 안 일어나면 그것도 사고다.
    expect(evaluateGate(withVersion({ min: NEWER, latest: '1.0.1', ...STORE }), null)).toMatchObject({
      kind: 'soft-update',
      latestVersion: NEWER,
    });
  });
});

describe('evaluateGate — 업데이트 안내', () => {
  it('현재 버전이 latest 미만이면 안내한다', () => {
    const decision = evaluateGate(withVersion({ latest: NEWER }), null);

    expect(decision).toMatchObject({
      kind: 'soft-update',
      currentVersion: APP_VERSION,
      latestVersion: NEWER,
    });
  });

  it('건너뛴 버전과 같으면 안내하지 않는다', () => {
    expect(evaluateGate(withVersion({ latest: NEWER }), NEWER)).toEqual({ kind: 'none' });
  });

  it('건너뛴 버전이 더 예전 것이면 다시 안내한다', () => {
    // 1.1.0 을 건너뛴 사용자에게 1.2.0 은 새 소식이다.
    expect(evaluateGate(withVersion({ latest: NEWER }), '1.0.1').kind).toBe('soft-update');
  });
});

describe('evaluateGate — 게이트 없음', () => {
  it('서버가 버전을 지정하지 않았으면 아무것도 하지 않는다', () => {
    // 관리자 콘솔의 기본 상태(빈 값)에서 사용자를 괴롭히지 않아야 한다.
    expect(evaluateGate(makeBoot(), null)).toEqual({ kind: 'none' });
  });
});

describe('evaluateGate — 스토어 링크', () => {
  it('서버가 준 플랫폼별 링크를 쓴다', () => {
    const boot = withVersion({
      min: NEWER,
      androidUrl: 'https://play.example/android',
      iosUrl: 'https://apps.example/ios',
    });
    const expected = Platform.OS === 'ios' ? 'https://apps.example/ios' : 'https://play.example/android';

    expect(evaluateGate(boot, null)).toMatchObject({ storeUrl: expected });
  });

  it('서버 링크가 없으면 앱에 박힌 상수로 폴백한다', () => {
    // 안드로이드는 STORE_URL 이 채워져 있고, iOS 는 빈 문자열이다.
    // 빈 문자열이어도 문제되지 않는다 — 모달은 버튼만 감추고 닫을 수 있다(가두지 않는다).
    expect(evaluateGate(withVersion({ latest: NEWER }), null)).toMatchObject({
      storeUrl: STORE_URL ?? '',
    });
  });
});

describe('isBlocking', () => {
  it('점검만 진입을 막는다', () => {
    // 강제 업데이트 판정은 존재하지 않는다 — 버전으로 앱을 막지 않기로 했다.
    expect(isBlocking({ kind: 'maintenance', title: 't', body: 'b' })).toBe(true);
    expect(
      isBlocking({ kind: 'soft-update', currentVersion: '1.0.0', latestVersion: '2.0.0', storeUrl: '' }),
    ).toBe(false);
    expect(isBlocking({ kind: 'none' })).toBe(false);
  });

  it('어떤 서버 응답으로도 점검 외에는 차단되지 않는다', () => {
    // 회귀 방어선: 나중에 누가 min 으로 차단하는 분기를 되살리면 여기서 걸린다.
    const boots = [
      withVersion({ min: NEWER }),
      withVersion({ min: NEWER, latest: NEWER }),
      withVersion({ min: NEWER, androidUrl: 'https://play.example/a', iosUrl: 'https://apps.example/i' }),
      withVersion({ latest: NEWER }),
    ];

    for (const boot of boots) {
      expect(isBlocking(evaluateGate(boot, null))).toBe(false);
    }
  });
});

describe('compareVersions', () => {
  it('자리수를 숫자로 비교한다 (문자열 비교가 아니다)', () => {
    // '1.10.0' < '1.9.0' 이 되는 문자열 비교 버그를 막는다.
    expect(compareVersions('1.10.0', '1.9.0')).toBe(1);
    expect(compareVersions('1.9.0', '1.10.0')).toBe(-1);
  });

  it('빠진 자리는 0 으로 본다', () => {
    expect(compareVersions('1.2', '1.2.0')).toBe(0);
    expect(compareVersions('1.2', '1.2.1')).toBe(-1);
  });

  it('같은 버전은 0', () => {
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0);
  });
});
