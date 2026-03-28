# My Word - 화면별 기능 명세

## 화면 목록

| # | 화면 | 파일 | 설명 |
|---|------|------|------|
| 1 | Home | `HomeScreen.tsx` | 메인 대시보드 |
| 2 | ManageWords | `ManageWordsScreen.tsx` | 단어 목록/검색/관리 |
| 3 | AddWord | `AddWordScreen.tsx` | 단어 추가/수정 |
| 4 | CategoryManage | `CategoryManageScreen.tsx` | 카테고리 관리 |
| 5 | QuizSetup | `QuizSetupScreen.tsx` | 퀴즈 설정 |
| 6 | Quiz | `QuizScreen.tsx` | 퀴즈 진행 |
| 7 | QuizResult | `QuizResultScreen.tsx` | 퀴즈 결과 |
| 8 | Statistics | `StatisticsScreen.tsx` | 학습 통계 |
| 9 | MyPage | `MyPageScreen.tsx` | 마이페이지 |

---

## 1. HomeScreen

**역할**: 메인 대시보드. 학습 현황 요약 + 주요 기능 진입점.

**표시 정보**:
- 총 등록 단어 수, 카테고리 수
- 퀴즈 정확도 (%)
- 연속 학습일 (스트릭) + 동기부여 메시지

**메뉴 그리드** (2열):
| 메뉴 | 이동 화면 |
|------|----------|
| 단어 추가 | AddWord |
| 단어장 | ManageWords |
| 카테고리 관리 | CategoryManage |
| 퀴즈 | QuizSetup |
| 통계 | Statistics |
| 마이페이지 | MyPage |

**특수 동작**:
- Android 뒤로가기 시 앱 종료 확인 Alert

**Props**:
- `onNavigateToManageWords`, `onAddWord`, `onStartQuiz`, `onViewStatistics`, `onMyPage`, `onManageCategories`

---

## 2. ManageWordsScreen

**역할**: 카테고리별 단어 목록 조회, 검색, 상세 보기, 삭제.

**레이아웃**: 좌측 카테고리 탭 + 우측 단어 리스트

**기능**:
- 카테고리 선택 시 해당 카테고리 단어 로드
- 텍스트 검색 (단어명, 뜻, 태그)
- 단어 카드 탭 → 상세 모달 (뜻, 예문, 태그, 메모)
- 발음 듣기 (expo-speech)
- 수정/삭제 버튼
- Pull-to-refresh

**Props**:
- `onBack`, `onAddWord`, `onEditWord(wordId)`, `onManageCategories`

---

## 3. AddWordScreen

**역할**: 새 단어 추가 또는 기존 단어 수정.

**입력 필드**:
| 필드 | 최대 | 키보드 설정 |
|------|------|------------|
| 단어 (영문) | 100자 | autoCapitalize="none" |
| 뜻 (한글) | 최대 10개 | - |
| 예문 + 번역 | 최대 5개 | autoCapitalize="sentences" |
| 태그 | 최대 10개 | - |
| 메모 | 500자 | - |

**기능**:
- 카테고리 선택 (모달 피커)
- 사전 검색 (dictionaryService) → 뜻/예문 자동 채움
- 중복 단어 검사 (동일 카테고리 내)
- `wordId` prop 유무로 추가/수정 모드 결정

**Props**:
- `onWordAdded`, `onBack`, `wordId?` (수정 모드)

---

## 4. CategoryManageScreen

**역할**: 카테고리 CRUD + 순서 변경.

**기능**:
- 카테고리 목록 (이름, 단어 수 배지)
- 추가/수정 모달 (이름, 설명 입력)
- 삭제 (확인 다이얼로그, 소속 단어도 함께 삭제 경고)
- 위/아래 이동 버튼으로 순서 변경
- Pull-to-refresh

**Props**:
- `onBack`

---

## 5. QuizSetupScreen

**역할**: 퀴즈 시작 전 설정.

**설정 항목**:

| 항목 | 옵션 |
|------|------|
| 카테고리 | 등록된 카테고리 중 선택 |
| 모드 | 랜덤, 최근 등록, 취약 단어, 혼합 |
| 방향 | 단어→뜻, 뜻→단어 (혼합 모드 시 숨김) |
| 문제 수 | 5, 10, 15, 20, 30 |

**유효성 검사**:
- 카테고리 내 단어가 5개 미만이면 전체 출제
- 선택한 문제 수가 가용 단어보다 많으면 자동 조정

**Props**:
- `onBack`, `onStartQuiz(categoryId, mode, wordCount, direction)`

---

## 6. QuizScreen

**역할**: 퀴즈 진행 화면.

**문제 유형** (4종):
| 유형 | 제시 | 입력 |
|------|------|------|
| `word_to_meaning` | 영단어 | 한글 뜻 |
| `meaning_to_word` | 한글 뜻 | 영단어 |
| `example_to_meaning` | 영문 예문 | 한글 뜻 |
| `translation_to_example` | 한글 번역 | 영단어(핵심) |

**기능**:
- 텍스트 입력 → 정답 판정 (대소문자 무시, trim)
- 예문 문제: 부분 일치 40% 이상이면 정답
- 힌트 버튼 (첫 글자 또는 단어 수)
- 발음 듣기 (영어 텍스트만)
- 진행 바 + 문제 번호 표시
- 정답/오답 피드백 (1.5초 후 다음 문제)
- 중도 퇴장 확인 Alert
- 전면광고 표시 (완료 시)

**Props**:
- `categoryId`, `mode`, `wordCount`, `direction`, `retryWordIds?`, `onComplete(results)`, `onExit`

---

## 7. QuizResultScreen

**역할**: 퀴즈 결과 표시 + 재시험 옵션.

**표시 정보**:
- 정답률 (%) + 이모지 (100%→🎉, >=70%→😊, <70%→📝)
- 정답/오답 개수 (색상 구분)
- 오답 목록 모달 (문제, 정답, 내 답)

**액션 버튼**:
| 버튼 | 동작 |
|------|------|
| 다시 풀기 | 동일 설정으로 퀴즈 재시작 |
| 틀린 문제 다시 풀기 | 오답 단어만 재출제 |
| 홈으로 | 홈 화면 이동 |

**Props**:
- `correctCount`, `totalCount`, `results`, `onRetry`, `onRetryWrong`, `onBackToHome`

---

## 8. StatisticsScreen

**역할**: 종합 학습 통계 대시보드.

**섹션**:
1. **전체 통계**: 총 단어, 카테고리, 퀴즈 횟수, 정확도, 취약 단어 수
2. **동기부여 메시지**: 정확도 기반 (>=90%→트로피, >=70%→불꽃, >=50%→근육, else→책)
3. **카테고리별 통계**: 정확도 바, 퀴즈 횟수, 취약 단어 수
4. **단어별 통계 모달**: 카테고리 필터, 5가지 정렬 (단어/정확도/횟수/정답/오답)

**Props**:
- `onBack`

---

## 9. MyPageScreen

**역할**: 사용자 활동 요약 + GitHub 스타일 히트맵.

**표시 정보**:
- 등록 단어 수, 퀴즈 응시 수, 연속 학습일
- 활동 히트맵 (15주 x 7일, 색상 4단계)
- 스트릭 축하 카드 (1~2일→✨, 3~6일→🔥, 7일+→🏆)

**히트맵 계산**:
- 활동 레벨 = 단어 추가 수 + 퀴즈 응시 수
- 레벨 0~4 (없음, 1~2, 3~4, 5~6, 7+)

**Props**:
- `onBack`
