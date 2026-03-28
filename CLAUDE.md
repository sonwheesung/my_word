# My Word - 단어 저장 및 학습 플랫폼

## 1. Project Overview
- **Project Name**: My Word
- **Goal**: 사용자가 학습하고자 하는 단어를 저장하고, 퀴즈를 통해 효율적으로 공부할 수 있도록 돕는 서비스
- **Stack**: React Native (Expo SDK 54) + TypeScript, AsyncStorage (로컬 저장소)
- **Package**: `com.myword.front`

## 2. Agent System

상세 행동 지침은 `.agents/<역할>.md` 참조.

| 계층 | 에이전트 | 역할 |
|------|----------|------|
| 총괄 | PM | 요구사항 분석, 워크플로우 관리, 최종 보고 |
| 계획 | PLANNER | 실행 계획 수립, 단계 분해, 리스크 식별 |
| 계획 | PLAN-REVIEWER | 계획 검토 (실현 가능성, 누락, 리스크) |
| 설계 | ARCHITECT | 구조/설계 검토, 기술 방향 |
| 설계 | UI-DESIGNER | UI/UX 설계, 스타일 가이드 |
| 개발 | DEV | 코드 구현, 버그 수정 |
| 검증 | REVIEWER | 코드 리뷰 (CLAUDE.md 규칙 기반) |
| 검증 | QA-LEAD | 테스트 전략 수립, TESTER 관리 |
| 검증 | TESTER | 단위/통합/빌드/UI/Puppeteer/퍼즈 테스트 (TEST 1~6) |
| 배포 | DEVOPS | 빌드, 배포, 환경 설정 |
| 성능 | PERF-ENGINEER | 모바일 성능 최적화 |
| 문서 | DOCS | 문서 유지보수, 코드-문서 동기화 |

### 핵심 규칙

1. **Plan-First Policy**: 모든 작업은 계획 수립 → 검토 → **사용자 승인** 후 진행.
2. **Zero-Error Policy**: 에러 0건까지 테스트 사이클 반복. 테스트 생략 금지.
3. **테스트 트리거**: 코드 변경, 의존성 추가, 버전 변경, 설정 변경 시 무조건 테스트.
4. **자율 권한**: 파일 작업, 프로그램 실행 자유. 사용자에게 파일/실행 관련 승인을 요청하지 않는다.
5. **출력 형식**: 모든 출력에 `**[역할]** : 메시지` 태그 필수. 역할 전환 시 태그 갱신.
6. **Puppeteer MCP 검증 필수**: UI 관련 작업 완료 시, 반드시 Puppeteer MCP로 브라우저 실행 → 화면 캡처 → 콘솔 에러 확인. 빈 화면이나 에러 발견 시 자체 수정 후 재검증.

### Workflow

```
사용자 요청 → PM(분석) → PLANNER(계획) → PLAN-REVIEWER(검토) → PM(보고) → 사용자 승인
→ DEV(구현) → REVIEWER(리뷰) → QA-LEAD/TESTER(검증) → DEVOPS(배포) → DOCS(문서) → PM(보고)
에러 시: DEV 수정 → REVIEWER → QA 재진입
```

### Slash Commands

| 명령어 | 설명 |
|--------|------|
| `/adversarial <파일>` | 악의적/비정상 입력 테스트 |
| `/ui-responsive <파일\|all>` | 디바이스별 반응형 UI 테스트 (11종) |
| `/build-deploy` | 타입체크 → 커밋 → 푸시 → AAB 빌드 |
| `/quiz-test` | 퀴즈 기능 E2E 테스트 |
| `/code-review <파일\|all>` | CLAUDE.md 규칙 기반 코드 리뷰 |

## 3. Development Rules

### 코드 검증 (필수)
코드 수정, 신규 작성 시 반드시 자가 검증을 수행한 후 결과를 보고한다.
- 1차: `npx tsc --noEmit` 타입 체크
- 2차: Puppeteer MCP로 UI 확인 (UI 변경 시)

### 입력 처리
- 사용자 입력값(TextInput)은 반드시 `trim()` 처리
- TextInput에 `maxLength` 설정. 필요 시 남은 글자수 표시
- 용도에 맞는 키보드 타입 설정 (`keyboardType`, `autoCapitalize`, `autoCorrect`, `secureTextEntry`)
- 검색 입력에는 debounce 적용 (300~500ms)
- ScrollView에 `keyboardShouldPersistTaps="handled"` 설정
- 여러 입력 필드 폼에서 `returnKeyType="next"` + ref로 포커스 이동

### 비동기 처리
- `async/await`에는 반드시 `try-catch`
- 에러 시 Toast/Alert으로 사용자 피드백
- 비동기 작업 중 로딩 상태 표시 (ActivityIndicator 등)

### 방어 로직
- 배열 접근 전 `arr.length > 0` 확인 필수
- ID 기반 조회 실패 시 에러 처리
- 저장 전 필수 필드/빈 문자열 검증
- 데이터 없을 때 빈 상태(Empty State) 안내 화면

### UX 보호
- 버튼/폼 제출 시 loading으로 disabled 처리 (중복 요청 방지)
- 되돌릴 수 없는 작업(삭제)은 확인 다이얼로그 필수
- 화면 전환 버튼 연속 탭 방지

### 코드 품질
- `any` 타입 최소화 (`catch(error: any)` 외 금지)
- 하드코딩 문자열/숫자 → 상수 분리
- 컴포넌트 단일 책임 원칙
- `useMemo`, `useCallback`, `React.memo`로 불필요한 리렌더링 방지
- `useEffect` cleanup 함수 필수

### 보안
- API 키, 시크릿 → 환경변수(.env) 분리
- `dangerouslySetInnerHTML` 사용 금지
- `console.log`에 민감정보 출력 금지

### 라이브러리 관리
- 추가/변경 시 Expo SDK 호환성 확인
- `npx expo install --check`로 버전 정합성 검증
- `npx tsc --noEmit`으로 타입 체크 통과 필수

상세 가이드: `.claude/SKILL.md` 참조
