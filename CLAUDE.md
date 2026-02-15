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