# My Word - 화면별 기능 명세

> 2026-09-18 코드에서 다시 뽑았다(앱 1.7.0). 그 전 판은 2026-03 에 멈춰 있었다(9개 화면만 있었다).
> 화면을 더하거나 빼면 이 문서와 `architecture.md` 를 같은 커밋에서 고친다. `npm run check:docs` 가 목록을 대조한다.
> 이 가드는 **이름**만 본다. 아래 설명이 맞는지는 `.claude/skills/doc-consistency` 로 사람이 본다.

## 화면 목록 (화면 15개)

| # | 화면 | 파일 | 한 줄 |
|---|------|------|------|
| 1 | Home | `HomeScreen.tsx` | 첫 화면. 요약 · 복습 배너 · 기능 입구 |
| 2 | ManageWords | `ManageWordsScreen.tsx` | 단어장. 카테고리별 조회 · 검색 · 공유 · 삭제 |
| 3 | AddWord | `AddWordScreen.tsx` | 단어 추가 · 수정 (`addWord` · `editWord` 두 라우트가 같은 화면) |
| 4 | CategoryManage | `CategoryManageScreen.tsx` | 카테고리 추가 · 수정 · 삭제 · 순서 |
| 5 | ImportWords | `ImportWordsScreen.tsx` | CSV 를 붙여 넣어 단어 한꺼번에 받기 |
| 6 | QuizSetup | `QuizSetupScreen.tsx` | 퀴즈 설정 |
| 7 | Quiz | `QuizScreen.tsx` | 문제 풀기 · 채점 · 결과 저장 |
| 8 | QuizResult | `QuizResultScreen.tsx` | 점수 · 틀린 단어 · 다시 풀기 |
| 9 | FlashcardSetup | `FlashcardSetupScreen.tsx` | 플래시카드 설정 |
| 10 | Flashcard | `FlashcardScreen.tsx` | 카드 뒤집기 · 넘기기. **채점하지 않는다** |
| 11 | Statistics | `StatisticsScreen.tsx` | 전체 · 카테고리별 · 단어별 정답률 |
| 12 | MyPage | `MyPageScreen.tsx` | 활동 요약 · 잔디 히트맵 · 연속 학습 |
| 13 | Settings | `SettingsScreen.tsx` | 언어 · 테마 · 알림 · 백업 · 공지 · 문의 · 광고 제거 · 고지 |
| 14 | Support | `SupportScreen.tsx` | 문의 보내기(공통 서버) |
| 15 | Notice | `NoticeScreen.tsx` | 공지 목록(부팅 때 받은 것) |

화면 위에 덧그리는 것: 점검 중이면 어느 화면이든 대신 `BlockingGate`, 새 버전 안내는 홈 위에만 `UpdateModal`.
라우트와 뒤로가기 표는 `architecture.md` 에 있다.

---

## 1. HomeScreen

**보이는 것**
- 히어로: 인사말 · 앱 이름 · 공지 버튼(안 읽은 공지가 있으면 빨간 점) · 설정 버튼
- 통계 3칸: 등록 단어 · 정답률(퀴즈 0회면 `-`) · 연속 학습(0일이면 `-`)
- 배너 한 자리를 둘이 나눠 쓴다. 만기 단어가 있고 퀴즈를 1회 이상 풀었으면 `오늘 복습할 단어 N개`(누르면 복습 퀴즈).
  아니면 연속 학습 문구(0일 · 3일 미만 · 7일 미만 · 7일 이상으로 문구가 바뀐다)
- 첫 줄 큰 칸 3개(`PRIMARY_MENU`): **학습하기 · 플래시카드 · 단어 추가**. 부제 없음, 제목은 두 줄까지
- 작은 칸 4개(`SECONDARY_MENU`): 단어장 · 카테고리 · 통계 · 마이
- 하단 광고 배너(스크롤 밖 고정)
- 빈 상태(단어 0 · 퀴즈 0): 통계 대신 `단어를 추가하고 학습을 시작해보세요!`

**동작**
- 복습 배너: `srsService.getDueWordIds(REVIEW_SESSION_SIZE = 10)` 로 전 카테고리에서 뽑아 퀴즈로 간다(객관식 · 단어→뜻 고정). 누르는 동안 비활성
- 알림 권유 시트(`NotificationPromptSheet`): 퀴즈 기록이 있고 아직 안 물어봤을 때 한 번
- 요약 불러오기 실패는 조용히 0으로 둔다(오프라인 오류 표시 금지 규칙)
- 하드웨어 뒤로가기: `앱 종료` 확인창 뒤 종료

**Props**: `onNavigateToManageWords` · `onAddWord` · `onStartQuiz` · `onFlashcards` · `onStartReview(wordIds)` · `onViewStatistics` · `onMyPage` · `onManageCategories` · `onSettings` · `onNotices`

---

## 2. ManageWordsScreen

**보이는 것**: 왼쪽 카테고리 목록(폭 140, 단어 수 뱃지) · 오른쪽 단어 카드(단어 · 첫 뜻 · 태그 최대 3개와 `+N` · 발음 버튼) · 상단 `공유` · `받기`.
빈 상태는 셋: 카테고리 없음 · 단어 없음 · 검색 결과 없음.

**동작**
- 검색: `maxLength 100`, `SEARCH_DEBOUNCE_MS = 400`. 단어 · 뜻 · 태그를 정규화해 비교
- 단어를 누르면 상세 시트(뜻 · 예문과 번역 · 태그 · 메모, 아래에 `수정` · `삭제`)
- 삭제는 확인창을 거친다. **퀴즈 기록은 남는다**(통계에 `(삭제된 단어)` 로 보인다)
- 공유: `전체 공유` / `선택 공유` → CSV 를 **클립보드에 복사**한다(공유 시트가 아니다)
- 길게 누르면 선택 모드(`N개 선택` · `전체 선택` · `취소`)
- 헤더 `관리` 는 카테고리 관리로 간다

**Props**: `onBack` · `onAddWord` · `onEditWord(wordId)` · `onManageCategories` · `onImportWords`
⚠ `onAddWord` 는 App 이 넘기지만 화면 안에 쓰는 곳이 없다(추가 버튼이 없다).

---

## 3. AddWordScreen

`wordId` 가 있으면 수정 모드. 들어온 화면(`previousScreen`)으로 돌아간다.

| 입력 | 상한 |
|------|------|
| 단어 | 100자. 소문자로 바꾸지 않는다(독일어 명사 등) |
| 뜻 | 한 칸 200자 · 최대 `LIMITS.meanings = 10` |
| 예문 · 번역 | 각 300자 · 최대 `LIMITS.examples = 5` |
| 태그 | 30자 · 최대 `LIMITS.tags = 10` · 엔터로 추가 · 중복 거부 |
| 메모 | `MEMO_MAX = 500` · 100자를 넘으면 카운터 표시 |

- 예문 · 태그 · 메모는 접이식 `선택 항목` 안에 있다(기본 접힘)
- `뜻 찾기`(`dictionaryService.lookup`): 결과가 뜻 · 예문 · 태그를 덮어쓰고 메모를 비운다. 예문은 영어 단어만. 단어 칸에서 엔터도 같다
- 저장 검증: 카테고리 · 단어 · 뜻 하나 이상. 같은 카테고리에 같은 단어가 있으면 확인창 뒤 저장 가능
- 수정 모드는 저장 전 확인창. 저장 중 입력과 버튼 비활성

**Props**: `wordId?` · `onWordAdded` · `onBack`

---

## 4. CategoryManageScreen

- 카드: 위 · 아래 화살표 · 이름 · 단어 수 · 설명 · `수정` · `삭제`
- 추가 · 수정 시트: 이름 `maxLength 20`(엔터로 설명 칸 이동) · 설명 200자(선택)
- 같은 이름(정규화 비교)은 서비스가 거부한다
- 삭제 확인창에 **소속 단어도 함께 삭제**된다는 경고. 퀴즈 기록은 남는다
- 순서: 화살표를 누르면 화면을 먼저 바꾸고 `displayOrder = 순번` 으로 저장. 실패하면 다시 불러온다

**Props**: `onBack`

---

## 5. ImportWordsScreen

단어장 `받기` 에서 온다. 끝나면 단어장으로 간다.

- 저장할 카테고리 선택 · CSV 입력칸 · `붙여넣기`(클립보드)
- 형식: `단어,뜻1|뜻2,예문1::번역1|예문2::번역2,태그1|태그2,메모`. 첫 줄에 `단어` 와 `뜻` 이 있으면 헤더로 건너뛴다
- `중복된 단어도 함께 받기`(기본 해제 = 건너뜀)
- 미리보기 시트: 신규 · 중복 · 오류(`N행: 이유`) · 저장 예정 수
- 한 번에 `MAX_IMPORT_COUNT = 200` 개까지. 저장은 한 개씩 하고 실패 수를 따로 알린다
- ⚠ CSV 입력칸에는 `maxLength` 가 없다(상한은 파싱 뒤 200개로 건다)

**Props**: `onBack` · `onImportComplete`

---

## 6. QuizSetupScreen

| 항목 | 값 |
|------|------|
| 카테고리 | 단어 수와 만기 수(`복습 N`) 표시 |
| 모드 `QuizMode` | `random` 무작위 · `recent` 최신순 · `weak` 취약 단어 · `mixed` 여러 형태 · `review` 복습할 단어 |
| 방향 `QuizDirection` | `word_to_meaning` · `meaning_to_word` (`mixed` 에서는 숨김) |
| 답변 `QuizAnswerType` | `subjective` 주관식 · `multiple_choice` 객관식(4지선다) |
| 문제 수 | `WORD_COUNTS = [5, 10, 15, 20, 30]`, 기본 10 |

- 카테고리 단어가 5개 미만이면 `전체 (N)` 버튼. 단어 수를 넘는 버튼은 비활성
- 카테고리를 바꿔 문제 수가 넘치면 가능한 최대로 줄이고 안내 토스트
- 지난 선택은 기억하지 않는다(기본값 `random` · 단어→뜻 · 주관식 · 첫 카테고리)
- 읽기만 한다

**Props**: `onBack` · `onStartQuiz(categoryId, mode, wordCount, direction, answerType)`

---

## 7. QuizScreen

**들어오는 길 넷**: 퀴즈 설정 · 홈 복습 배너 · 플래시카드 마무리 · 결과 화면의 다시 풀기.
뒤의 둘(배너 · 플래시카드)은 단어 id 목록(`retryWordIds`)을 들고 오고, 카테고리 없이 객관식 · 단어→뜻 으로 고정된다.

**문제 유형** (`QuizType`)

| 유형 | 제시 | 답 |
|------|------|------|
| `word_to_meaning` | 단어 | 뜻 |
| `meaning_to_word` | 뜻 | 단어 |
| `example_to_meaning` | 예문 | 뜻 (주관식 `mixed` 에서만) |
| `translation_to_example` | 번역 | 예문 (주관식 `mixed` 에서만) |

**단어 고르기**
- `random` · `mixed`: 섞어서 앞에서부터 · `recent`: 등록 최신순
- `weak`: 정답률 50% 미만을 낮은 순으로(`getWeakWordIds`). 모자라면 나머지에서 무작위로 채운다
- `review`: 고른 카테고리 안에서 만기 지난 단어(오래 밀린 순) → 한 번도 안 푼 단어(오래된 순).
  **만기가 문제 수보다 적으면 만기만 낸다**(억지로 채우지 않는다). 만기 0이면 무작위
- 뜻이 비어 있는 단어는 뺀다
- `mixed` 유형 배정: 객관식은 앞의 두 유형 반반, 주관식은 0.3 · 0.3 · 0.2 · 0.2(예문이 없으면 `word_to_meaning`)

**객관식 보기**: 같은 퀴즈의 단어 풀(카테고리가 없으면 전체 단어)에서 정답과 다른 것 3개. 모자라면 더미(`기억나지 않음` 등)로 채운다.

**채점** (`normalizeForCompare` = trim · 소문자 · NFC)
- 뜻이 답이면 뜻 중 하나만 맞아도 정답 · 단어가 답이면 완전 일치
- `translation_to_example`: 완전 일치, 또는 입력이 `max(3, 정답 길이의 40%)` 자 이상이고 포함 관계
- 주관식 입력 `maxLength 300`

**그 밖**
- 정답 · 오답 표시 1500ms 뒤 다음 문제(코드에 숫자로 있다)
- 힌트: 3자 이하는 글자 수만, 그보다 길면 첫 글자와 글자 수(3단어 이상이면 단어 수도)
- 발음(`SPEECH_RATE 0.85`): 제시가 단어나 예문일 때만
- 전면 광고: 진입 300ms 뒤, 불러와져 있고 광고 제거를 안 샀을 때
- **저장은 마지막 문제 뒤에만.** `saveQuizResults` → `srsService.recordAnswers` 순서. 중간에 나가면 아무것도 안 남는다
- `나가기` 는 확인창 뒤 설정 화면(설정에서 왔을 때) 또는 홈

⚠ **알려진 어긋남** (2026-09-18 코드 대조에서 발견 · 수정 전)
- 하드웨어 뒤로가기는 확인창 없이 나간다. 복습 배너에서 왔을 때 홈이 아니라 **퀴즈 설정**으로 간다
- 플래시카드에서 넘긴 순서가 유지되지 않는다. 저장소 순서로 나온다

**Props**: `categoryId?` · `mode` · `wordCount` · `direction` · `answerType` · `retryWordIds?` · `onComplete(results)` · `onExit`

---

## 8. QuizResultScreen

- 제목: 만점 `완벽합니다!` · 70% 이상 `잘했어요!` · 그 밖 `다시 도전해보세요!`
- 정답률(반올림) · 정답 수 · 오답 수 · **틀린 단어 목록을 화면에 바로 펼친다**(문제 · 정답 · 내 답 · 발음)
- 버튼: 오답이 있으면 `틀린 N개 다시 풀기` 와 `전체 다시 풀기`, 없으면 `다시 풀기` 하나 · `홈으로`
- 전면 광고 진입 500ms 뒤 · 하단 배너
- 저장하지 않는다(퀴즈 화면에서 끝났다)

⚠ **알려진 어긋남** (수정 전 · 2026-09-18 에뮬레이터 확인)
- 🔴 **틀린 단어가 많으면 화면이 스크롤되지 않는다.** `contentContainerStyle` 이 `flex: 1` + `justifyContent: 'center'` 라
  내용이 화면 높이에 묶이고, 넘친 만큼 위(점수)와 아래(`홈으로` · `다시 풀기` 버튼)가 잘린다.
  8개 · 10개 틀린 판에서 위아래 어느 쪽으로도 움직이지 않았다. 빠져나갈 길은 기기 뒤로가기뿐이다.
  2026-08-21 틀린 단어 목록을 모달에서 화면 안으로 옮기면서(`55bf65c`) 생겼다. 그 전에는 목록이 모달 안의 스크롤이었다
- 복습 배너 · 플래시카드에서 온 퀴즈에서 `다시 풀기` · `전체 다시 풀기` 를 누르면 **홈이 뜬다.** 단어 목록을 비우는데 카테고리도 없어 퀴즈를 못 그린다.
  화면 상태는 퀴즈로 남아, 그 홈에서 뒤로가기를 누르면 종료 확인 대신 **퀴즈 설정**이 열린다
- `틀린 N개` 의 N 은 오답 **건수**이고, 실제로 다시 내는 것은 중복을 걷은 **단어 수**다

**Props**: `correctCount` · `totalCount` · `results` · `onRetry` · `onRetryWrong` · `onBackToHome`

---

## 9. FlashcardSetupScreen

| 항목 | 값 |
|------|------|
| 카테고리 | `N개 단어 · 복습 N`. 마지막으로 본 카테고리가 있으면 그것 |
| 순서 `CardOrder` | `created` 등록순 · `shuffle` 무작위 · `due` 복습순 |
| 카드 앞면 | 단어 / 뜻 |
| 발음 자동 재생 | 켜기 · 끄기 |

- 문제 수를 묻지 않는다. 카테고리 전체를 `N장 시작하기`
- 기본값 `DEFAULT_PREFS`: 등록순 · 앞면 단어 · 자동 재생 끔
- 시작할 때 `@my_word_flashcard_prefs` 하나만 쓴다. **퀴즈 결과는 쓰지 않는다**

**Props**: `onBack` · `onStart(categoryId, order, frontIsWord, autoSpeak)`

---

## 10. FlashcardScreen

🔴 **채점하지 않는다.** `@my_word_quiz_results` 와 `@my_word_srs` 에 쓰는 코드가 없고,
`__tests__/flashcardService.test.ts` 가 소스를 읽어 지킨다(이유는 `CLAUDE.md` 플래시카드 절).

- 카드를 탭하면 뒤집힌다. 앞면이 단어면 뒷면에 뜻 번호 목록(`MeaningList`) · 예문 · 메모
- **왼쪽으로 밀면 다음 카드, 오른쪽으로 밀면 이전 카드.** `SWIPE_START 12` · `SWIPE_COMMIT 56` · `SLIDE_MS 170`
- `이전` · `다음` 버튼도 있다. 마지막 카드에서 `마치기` 를 누르면 마무리 화면:
  `N장 다 봤어요` · `이 N개로 퀴즈 풀기`(카드 순서의 앞 `QUIZ_HANDOFF_SIZE = 10` 개) · `처음부터 다시 보기`
- `due` 순서는 만기 단어를 앞에, 나머지를 등록순으로 뒤에 붙인다(빼지 않는다). 만기 조회가 실패하면 등록순
- 🔴 가로 이동은 전부 `useNativeDriver: false`, 뒤집기(`FlipCard`, `FLIP_MS 240`)만 `true`. 섞지 않는다(CLAUDE.md)
- 뒤로가기는 항상 플래시카드 설정

**Props**: `categoryId` · `order` · `frontIsWord` · `autoSpeak` · `onBack` · `onQuiz(wordIds)`

---

## 11. StatisticsScreen

- 전체 학습 현황(단어 · 카테고리) · 퀴즈 성적(정답률 소수 한 자리 · 정답 · 오답 · 총 문제) · 정답률별 격려 문구
- 카테고리별 성적(정답률 막대 · 횟수 · 정답 · 오답 · 취약) · 취약한 단어 수(정답률 50% 미만)
- 단어별 모달: `단어 정답률` 버튼이나 카테고리 줄을 누르면. 정렬 다섯 개(단어 · 정답률 · 횟수 · 정답 · 오답), 같은 칩을 다시 누르면 방향 반전
- 색 기준: 80 이상 초록 · 50 이상 주황 · 그 미만 빨강
- ⚠ `통계 데이터가 없습니다` 빈 화면은 데이터가 0일 때가 아니라 **조회에 실패했을 때만** 나온다. 0이면 카드가 0과 안내 문구로 보인다
- 당겨서 새로고침하면 화면 전체가 스켈레톤으로 바뀐다

**Props**: `onBack`

---

## 12. MyPageScreen

- 프로필 카드(`총 N일 활동`) · 등록 단어 · 퀴즈 횟수 · 연속 학습
- 히트맵: `WEEKS = 15` 에 이번 주 토요일까지. 하루 값 = 그날 추가한 단어 수 + 그날 퀴즈 결과 수.
  단계 0 · 1 · 2~3 · 4~6 · 7 이상, 테마와 무관한 고정 초록 5색
- 연속 학습 카드(1일 이상일 때, 3일 · 7일에서 아이콘과 문구가 바뀐다)
- 연속 학습은 단어 등록일도 활동일로 센다. 오늘 기록이 없으면 어제부터 센다

**Props**: `onBack`

---

## 13. SettingsScreen

위에서부터:

1. **언어**: 한국어 · English · 日本語
2. **색상 테마**: 인디고(기본) · 민트 · 로즈 · 오렌지 · 스카이 · 다크
3. **학습 알림**(웹에서는 숨김): `알림 받기` 스위치 · 켜져 있을 때 `알림 시각`(기본 `20:00`, 5분 단위 `TimePickerSheet`). 켤 때만 권한을 묻는다
4. **데이터**(iOS · Android): `백업 파일 만들기`(공유 시트, `myword-backup-YYYY-MM-DD.json`) · `백업에서 복원`
   - 기기에 데이터가 하나도 없으면 묻지 않고 복원, 있으면 `RestoreConfirmSheet` 로 양쪽 숫자를 나란히 보여 준다
   - 복원 직전 `myword-before-restore.json` 안전 사본 → 복원 → `Updates.reloadAsync()` 로 재시작
5. **소식**: 공지사항(안 읽은 수 뱃지)
6. **고객 지원**: 문의하기
7. **광고**: 산 사람은 `광고가 제거되었어요` 만. 안 산 사람은 `광고 제거`(스토어 가격) · `구매 복원`
8. **법적 고지**: 개인정보처리방침 · 이용약관 · 오픈소스 라이선스(`?lang=` 을 붙여 외부로 연다)
9. **앱 정보**: 버전(`app.json` 에서 읽음) · 패키지

- Play 조회가 실패해도 광고 제거 캐시를 되돌리지 않는다(산 사람에게 광고를 다시 띄우지 않는다)

**Props**: `onBack` · `onSupport` · `onNotices`

---

## 14. SupportScreen

- 안내: 기기에 만든 임의 식별자로 접수 · 개인정보를 보내지 않음 · 앱 버전과 기기 종류가 함께 감 · 답변 확인은 준비 중
- 분류 칩 4개: 오류(`bug`, 기본) · 건의 · 질문 · 기타
- 내용: `SUPPORT_CONTENT_MAX = 2000`, trim 해서 `SUPPORT_CONTENT_MIN = 5` 자 미만이면 보내기 비활성
- `POST /api/v1/tickets`(공통 서버). 성공하면 내용을 비운다. 실패 문구는 **보내기를 누른 뒤에만** 뜬다(들어올 때 오프라인 오류 없음)

**Props**: `onBack`

---

## 15. NoticeScreen

- 부팅 때 받은 공지(`GET /api/v1/bootstrap`)를 서버 순서대로 펼쳐 보여 준다. 이 화면에서 새로 요청하지 않는다
- 뱃지: `고정` · 종류(공지 · 이벤트 · 업데이트) · `NEW`. 본문은 마크다운 없이 줄바꿈만
- 언어: `localizeAnnouncement(item, i18n.language)`. 한국어면 한국어, 그 밖에는 영어 제목과 본문이 **둘 다** 있을 때만 영어
- 들어오는 순간 전부 읽음으로 기록한다(`@my_word_read_notices`, 서버로 보내지 않는다). `NEW` 는 이번 방문 동안 유지
- 오프라인이면 오류 대신 빈 상태(`등록된 공지사항이 없습니다`)
- 뒤로가기는 들어온 곳(홈 또는 설정)

**Props**: `onBack`
