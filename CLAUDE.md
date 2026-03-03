프로젝트의 정체성과 개발 규칙을 정의하는 CLAUDE.md 파일은 AI가 협업 시 지침서로 활용하기에 아주 좋습니다. 요청하신 내용을 바탕으로 깔끔하고 직관적인 가이드라인을 작성해 보았습니다.

CLAUDE.md
1. Project Overview
Project Name: My Word (단어 저장 및 학습 플랫폼)

Goal: 사용자가 학습하고자 하는 단어를 저장하고, 이를 효율적으로 공부할 수 있도록 돕는 서비스를 제공한다.

2. Environment & Path
Development Stack: React Native (Expo SDK 54) + TypeScript, 로컬 저장소 (AsyncStorage)

3. Development Rules & Skill Guidelines
🛠 코드 작성 및 검증 규칙 (중요)
코드 수정, 신규 작성, 또는 데이터 매핑 작업 시 반드시 자가 검증을 수행한 후 결과를 보고한다.

1차 검증 (논리 및 문법):

구문 오류(Syntax Error) 및 변수명 오타 확인.

비즈니스 로직의 흐름이 의도와 일치하는지 검토.

4. Skills
- 사용자 입력값(TextInput 등)은 반드시 trim() 처리를 한다. 저장, 비교, 전송 등 입력값을 사용하는 모든 곳에서 공백이 제거된 상태로 처리한다.
- 라이브러리 추가/업그레이드/변경 시 반드시 Expo SDK 및 React Native 버전과의 호환성을 확인한다. GitHub Issues에서 알려진 문제가 없는지 검색하고, `npx expo install --check`로 버전 정합성을 검증한 후 `npx tsc --noEmit`으로 타입 체크까지 통과해야 한다.
- 배열 접근 시 반드시 길이를 체크한다. `arr[0]` 직접 접근 전에 `arr.length > 0` 확인 필수.
- async/await 호출에는 반드시 try-catch를 감싼다. 에러 발생 시 사용자에게 Toast 등으로 피드백을 제공한다.
- 비동기 작업 중에는 반드시 로딩 상태를 표시한다. (ActivityIndicator, Skeleton 등)
- 데이터가 없는 경우 빈 상태(Empty State) 안내 화면을 제공한다.
- 반복되는 문자열, 숫자 등은 하드코딩하지 않고 상수로 분리한다.
- 컴포넌트는 하나의 책임만 갖도록 설계한다. 화면 로직과 UI를 명확히 분리한다.
- `any` 타입 사용을 최소화한다. `catch(error: any)` 외에는 구체적인 타입을 사용한다.
- 저장 전 데이터 정합성을 확인한다. 필수 필드 누락, 빈 배열, 빈 문자열 등을 검증한다.
- ID 기반 조회 실패 시 에러를 처리한다. 존재하지 않는 데이터 접근에 대한 방어 로직을 작성한다.
- 버튼/폼 제출 시 중복 요청을 방지한다. loading 상태로 disabled 처리하여 연속 클릭/Enter를 차단한다.
- 검색 입력에는 debounce를 적용한다. 타이핑마다 즉시 실행하지 않고 300~500ms 대기 후 실행한다.
- 되돌릴 수 없는 작업(삭제 등)은 반드시 확인 다이얼로그를 표시한다.
- TextInput에 maxLength를 설정한다. 필요 시 남은 글자수를 표시한다.
- 화면 전환 등 주요 버튼은 연속 탭을 방지한다. 짧은 시간 내 중복 호출을 무시한다.
- API 키, 시크릿 등 민감정보는 코드에 직접 쓰지 않고 환경변수(.env)로 분리한다.
- 사용자 입력을 HTML/dangerouslySetInnerHTML로 렌더링하지 않는다. XSS 공격을 방지한다.
- 비밀번호, 토큰, 개인정보 등 민감정보를 console.log에 출력하지 않는다.
- useMemo, useCallback, React.memo를 활용하여 불필요한 리렌더링을 방지한다.
- useEffect에서 타이머, 리스너, 구독 등을 사용하면 반드시 cleanup 함수로 정리한다.
- 코드를 등록/수정/삭제할 때 영향 범위의 모든 단위·통합·기능 테스트를 수행한다. 정상 시나리오, 비정상 입력, 중복 데이터, 경계값을 포함한다.
- TextInput에 용도에 맞는 키보드 타입을 설정한다. keyboardType, autoCapitalize, autoCorrect, secureTextEntry 등을 적절히 사용한다.
- 입력 폼이 있는 ScrollView에는 `keyboardShouldPersistTaps="handled"`를 설정하여 빈 영역 터치 시 키보드가 닫히도록 한다.
- 여러 입력 필드가 있는 폼에서는 `returnKeyType="next"` + ref를 사용하여 엔터 시 다음 필드로 포커스를 이동한다.

상세 가이드: `.claude/SKILL.md` 참조