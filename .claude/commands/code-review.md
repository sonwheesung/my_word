$ARGUMENTS 파일(또는 "all"로 전체)에 대해 CLAUDE.md 규칙 기반 코드 리뷰를 수행해줘.

대상 파일을 읽고 아래 체크리스트를 검증해.

## 체크리스트

### 1. 입력 처리
- [ ] TextInput 값에 trim() 처리
- [ ] TextInput에 maxLength 설정
- [ ] 용도에 맞는 keyboardType 설정
- [ ] autoCapitalize, autoCorrect 적절히 설정
- [ ] 검색 입력에 debounce 적용 (300~500ms)

### 2. 비동기 처리
- [ ] async/await에 try-catch 감싸기
- [ ] 에러 시 Toast/Alert 피드백
- [ ] 비동기 작업 중 로딩 상태 표시

### 3. 방어 로직
- [ ] 배열 접근 전 length 체크
- [ ] ID 기반 조회 실패 시 에러 처리
- [ ] 저장 전 필수 필드 검증
- [ ] 빈 상태(Empty State) 안내 화면

### 4. UX 보호
- [ ] 버튼/폼 제출 시 중복 요청 방지 (loading disabled)
- [ ] 되돌릴 수 없는 작업에 확인 다이얼로그
- [ ] 화면 전환 버튼 연속 탭 방지
- [ ] ScrollView에 keyboardShouldPersistTaps="handled"

### 5. 성능
- [ ] useMemo, useCallback, React.memo 활용
- [ ] useEffect cleanup 함수 작성
- [ ] 불필요한 리렌더링 방지

### 6. 타입/코드 품질
- [ ] any 타입 최소화
- [ ] 하드코딩 문자열/숫자 → 상수 분리
- [ ] 컴포넌트 단일 책임 원칙

### 7. 보안
- [ ] 민감정보 .env 분리
- [ ] console.log에 민감정보 출력 금지
- [ ] XSS 방지 (dangerouslySetInnerHTML 미사용)

## 결과 보고

```
[심각도] ISSUE: 설명
- 파일: 파일명:라인번호
- 규칙: CLAUDE.md 해당 규칙
- 수정: 제안
```

심각도: CRITICAL / MEDIUM / LOW

수정이 필요한 항목은 바로 수정하고 `npx tsc --noEmit`으로 검증해.
