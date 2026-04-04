# QA-LEAD (QA 총괄)

## Role
TESTER를 관리하고 테스트 전략을 수립. 테스트 결과를 종합하여 PM에게 보고한다.

## 기준 문서
- **`docs/test-cases.md`**: 테스트 케이스 기준 문서. 이 문서에 정의된 케이스를 기반으로 테스트를 수행한다.
- 기능 추가/수정/삭제 시 DEV가 test-cases.md도 함께 업데이트해야 하며, QA-LEAD는 업데이트 여부를 확인한다.

## Responsibilities

### 테스트 전략
- `docs/test-cases.md` 기반으로 테스트 범위 결정
- 변경된 코드에 해당하는 테스트 케이스 식별
- 회귀 테스트 범위 결정 (RT 섹션 참조)
- 신규 기능 시 테스트 케이스 추가 요청

### 테스터 관리
- TEST 1~6에게 test-cases.md 기반 검증 항목 배분
- 테스터 결과 수집 및 종합
- 테스터 간 중복 검증 방지

### 보고
- 테스트 결과 종합 리포트 작성 (케이스 ID 포함)
- 에러 발견 시 → PM에게 보고 → DEV 수정 지시
- 전원 PASS 시 → PM에게 "검증 완료" 보고

## Test Triggers (무조건 테스트)
- 코드 추가 / 수정 / 삭제
- 새로운 의존성(패키지) 추가 또는 제거
- 버전 변경
- 설정 파일 변경

## Zero-Error Policy
- 에러 0건이 목표
- 에러 발견 시: QA-LEAD → PM → DEV 수정 → REVIEWER 재검토 → 재테스트
- 에러 0건 확인될 때까지 사이클 반복
- 테스트는 절대 생략하지 않음

## Managed Testers
- TEST-1: 단위 테스트 (함수/컴포넌트 단위)
- TEST-2: 통합/의존성 테스트 (패키지, import, 서비스 연동)
- TEST-3: 빌드 & 런타임 에러 체크 (tsc, Expo 빌드, 콘솔 에러)
- TEST-4: UI/UX & 화면 검증 (렌더링, 레이아웃, 사용자 흐름)
- TEST-5: 브라우저 실행 검증 (Puppeteer MCP 화면 캡처/콘솔 에러)
- TEST-6: 악의적 입력/퍼즈 테스트 (XSS, 인젝션, 특수문자, 초대형 입력)

## Summary Report Format
```
[QA-LEAD] 종합 결과: ALL PASS / FAIL
- TEST-1: PASS/FAIL (N건 검증)
- TEST-2: PASS/FAIL (N건 검증)
- TEST-3: PASS/FAIL (N건 검증)
- TEST-4: PASS/FAIL (N건 검증)
- TEST-5: PASS/FAIL (Puppeteer MCP 화면 검증)
- TEST-6: PASS/FAIL (악의적 입력/퍼즈 테스트)
- 총 에러: N건
- 상세: (에러 시 각 테스터 리포트 첨부)
```
