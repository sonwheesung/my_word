/**
 * 🔴 **좁게 든다. 넓게 들면 아무도 안 본다** (2026-10-15).
 *
 * 전에는 `extends: '@react-native'` 였는데 **그 패키지가 설치돼 있지 않았다.**
 * `npm run lint` 는 설정을 못 찾고 죽었고, 그래서 이 저장소에서 린트가 **한 번도 돈 적이 없다.**
 * 그 사이 `ExamResultScreen` 이 훅을 「일찍 반환」 아래에 두는 바람에
 * **AI 시험을 끝낼 때마다 결과 화면이 통째로 죽었다**(2026-10-12 ~ 10-15 · 3일).
 * `react-hooks/rules-of-hooks` 가 돌고 있었다면 쓰는 순간 걸렸을 버그다.
 *
 * ⚠ 그렇다고 RN 프리셋을 통째로 들이지 않는다. 운영 중인 15,000줄짜리 코드에 갑자기
 *   수백 개의 경고가 쏟아지면 **빨간 줄이 배경이 되고, 배경이 된 경고는 아무도 안 본다.**
 *   그 상태는 린트가 없는 것과 같다(지금까지가 정확히 그랬다).
 *
 * 🔴 **고른 규칙은 둘이고, 등급이 다르다. 그 차이가 이 파일의 핵심이다.**
 *
 * `rules-of-hooks` = **error**. 지금 위반 **0건**이라 막아도 아무도 안 아프고,
 * 이게 바로 3일짜리 크래시를 낸 규칙이다. 들어오는 순간 막는다.
 *
 * `exhaustive-deps` = **warn**. 지금 위반 **20건**이다. 🔴 **처음에 `error` 로 적었다가
 * 실제로 돌려 보고 내렸다** — 내용을 보니 `error` 가 위험했다:
 *
 * ```
 * 빠진 의존성이 대부분 loadCategories · loadWords 같은 **화면 안에서 매 렌더
 * 새로 만들어지는 함수**다. 린터가 시키는 대로 의존성에 넣으면 effect 가 매 렌더
 * 다시 돌고 — 그게 2026-10-15 에 AI 시험 설정의 CPU 를 158% 로 올린 바로 그 고리다.
 * ```
 *
 * 즉 **`error` 로 두면 다음 사람을 그 위험한 고침으로 떠민다.** 제대로 고치려면 화면마다
 * 로더를 `useCallback` 으로 감싸야 하고, 그건 운영 중인 10개 화면을 건드리는 별건이다.
 * 🚫 **이 20건을 「린트 통과」를 이유로 일괄 수정하지 않는다.**
 *
 * 다른 규칙(스타일 · import 순서 등)은 **의도적으로 비워 뒀다.** 필요해지면 그때 한 줄씩 는다.
 */
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    ecmaFeatures: { jsx: true },
  },
  // @typescript-eslint 는 **규칙을 켜려고가 아니라** 소스의 eslint-disable 주석이
  // 가리키는 규칙 이름을 해석할 수 있게 하려고 둔다(없으면 "Definition for rule not found")
  plugins: ['react-hooks', '@typescript-eslint'],
  rules: {
    'react-hooks/rules-of-hooks': 'error',
    'react-hooks/exhaustive-deps': 'warn',
  },
  ignorePatterns: [
    'node_modules/',
    'android/',
    'ios/',
    'dist/',
    'coverage/',
    'docs/',
    'scripts/',
    '*.config.js',
    'babel.config.js',
    'jest.setup.js',
  ],
};
