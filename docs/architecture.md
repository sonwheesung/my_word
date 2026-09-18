# My Word - 아키텍처 문서

> 2026-09-18 코드에서 다시 뽑았다(앱 1.7.0). 그 전 판은 2026-03 구조(9개 화면 · 4개 서비스)에 멈춰 있었다.
> 폴더 아래 파일을 더하거나 빼면 이 문서도 같은 커밋에서 고친다. `npm run check:docs` 가 화면 · 서비스 · 컴포넌트 목록을 대조한다.

## 기술 스택

| 항목 | 기술 |
|------|------|
| 프레임워크 | React Native 0.81.5 (Expo SDK 54) · New Architecture · Hermes |
| 언어 | TypeScript 5.9 |
| 로컬 저장소 | AsyncStorage (웹은 localStorage) · 자격증명만 `expo-secure-store` |
| 다국어 | `i18next` · 한국어 · English · 日本語 (한국어 원문이 곧 키) |
| 광고 | `react-native-google-mobile-ads` (배너 · 전면) |
| 인앱결제 | `expo-iap` · 평생 광고 제거 `remove_ads` |
| 알림 | `expo-notifications` · 기기 안에서만 예약하는 로컬 알림 |
| OTA | `expo-updates` |
| TTS | `expo-speech` |
| 패키지명 | `com.myword.front` |

## 폴더 구조

```
my_word/
├── App.tsx                      진입점. useState<Screen> 라우팅 · ErrorBoundary · 컨텍스트 배선 · 뒤로가기
├── app.json · eas.json          Expo 설정 · 빌드 프로필
├── docs/                        설계 문서 + 게시되는 법무 문서(.html)
├── scripts/                     아이콘 · 스토어 애셋 · 고지 생성기 + 가드(check-tests · check-licenses · check-docs)
├── __tests__/                   Jest
└── src/
    ├── components/              공용 컴포넌트 (.web.tsx 는 웹 대체 구현)
    │   ├── AdBanner.tsx                  배너 광고. 광고 제거 · 웹이면 그리지 않는다
    │   ├── BlockingGate.tsx              서버 점검 중 전체 화면(닫기 없음)
    │   ├── BottomSheet.tsx               아래에서 올라오는 공용 시트
    │   ├── FlipCard.tsx                  플래시카드 뒤집기(네이티브 드라이버)
    │   ├── MeaningList.tsx               뜻 번호 목록(단어 상세 · 카드 뒷면)
    │   ├── NotificationPromptSheet.tsx   첫 퀴즈 뒤 홈에서 한 번 뜨는 알림 권유
    │   ├── RestoreConfirmSheet.tsx       복원 전 "지금 기기 vs 백업" 숫자 비교
    │   ├── ScreenHeader.tsx              뒤로가기 + 제목 + 오른쪽 버튼
    │   ├── SkeletonLoader.tsx            로딩 자리표시자
    │   ├── TimePickerSheet.tsx           알림 시각(5분 단위)
    │   ├── Toast.tsx                     하단 알림
    │   └── UpdateModal.tsx               새 버전 안내(홈 위에만)
    ├── constants/               appConfig(저장 키 · 버전 · 알림 상수) · adConfig(+ .web) · design(간격 · 글자) · themes · partOfSpeech
    ├── contexts/                Bootstrap(공지 · 버전 · 기기 세션) · Purchase(광고 제거) · Theme · Notification(학습 알림)
    ├── hooks/                   useInterstitialAd(+ .web) · useToast
    ├── i18n/                    index · language(저장된 언어 → 기기 언어 → en) · locales/{en,ja}.json (ko 는 키가 원문이라 파일이 없다)
    ├── screens/                 화면 15개 (아래)
    ├── services/                비즈니스 로직 (아래)
    │   └── commonServer/        ⚠ 공통 서버 SDK 복사본. 손으로 고치지 않는다(원본에서 재복사)
    ├── types/                   word.ts
    └── utils/                   storage(저장소 추상화 · BACKUP_KEYS) · srs(FSRS 계산) · date · text · speech · notificationSchedule
```

### 화면 (`src/screens/`, 화면 15개)

| 묶음 | 파일 |
|---|---|
| 첫 화면 | `HomeScreen.tsx` |
| 단어 | `ManageWordsScreen.tsx` · `AddWordScreen.tsx` · `CategoryManageScreen.tsx` · `ImportWordsScreen.tsx` |
| 퀴즈 | `QuizSetupScreen.tsx` · `QuizScreen.tsx` · `QuizResultScreen.tsx` |
| 플래시카드 | `FlashcardSetupScreen.tsx` · `FlashcardScreen.tsx` |
| 기록 | `StatisticsScreen.tsx` · `MyPageScreen.tsx` |
| 기타 | `SettingsScreen.tsx` · `SupportScreen.tsx` · `NoticeScreen.tsx` |

화면별 동작은 [`screens.md`](screens.md).

### 서비스 (`src/services/`)

| 파일 | 하는 일 | 네트워크 |
|---|---|---|
| `wordService.ts` · `categoryService.ts` | 단어 · 카테고리 CRUD (정규화 비교로 중복 검사) | |
| `quizService.ts` | 결과 저장 · 통계 · 취약 단어 · 연속 학습 | |
| `srsService.ts` | 간격 복습 만기(저장본 캐시 · 이력 재생 · 알림용 예측) | |
| `flashcardService.ts` | 카드 순서 · 보기 취향. **퀴즈 결과를 쓰지 않는다** | |
| `shareService.ts` | CSV 내보내기 · 파싱 · 중복 판정 | |
| `backupService.ts` | 백업 파일 만들기 · 검사 · 복원(순수 로직) | |
| `backupFile.ts` | 백업 파일 입출력 · 공유 시트 · 문서 선택기(네이티브는 여기만) | |
| `notificationService.ts` | 로컬 알림 권한 · 예약(7일치) | |
| `noticeService.ts` | 읽은 공지 id 로컬 저장 | |
| `versionService.ts` | 점검 · 새 버전 안내 판정(순수) · 건너뛴 버전 | |
| `supportService.ts` | 문의 전송(공통 서버 래퍼) | 간접 |
| `dictionaryService.ts` | 뜻 찾기 · 예문 | ✅ Google 번역 · Free Dictionary |
| `commonServer/` | 공통 서버 SDK(부트스트랩 · 하트비트 · 문의 · 기기 세션) | ✅ `common-server.vercel.app` |

함수 목록은 [`services-api.md`](services-api.md), 저장 형식은 [`data-model.md`](data-model.md).

## 레이어

```
App.tsx (라우터 · 컨텍스트 Provider · 뒤로가기)
  └ Screens (15)         UI · 입력 처리
      ├ Components / Hooks
      └ Services         비즈니스 로직 · 순수 함수는 여기와 utils/ 에 둔다(테스트 대상)
          └ utils/storage.ts   AsyncStorage (웹은 localStorage)
          └ 외부              Google 번역 · Free Dictionary · 공통 서버 · AdMob · Play 결제
```

🔴 **학습 데이터는 기기 밖으로 나가지 않는다.** 공통 서버에 가는 것은 공지 조회 · 하트비트 · 문의 · 기기 세션뿐이고,
서버가 죽어도 앱은 평소대로 돈다(부팅 경로의 실패는 전부 조용히 삼킨다).

## 라우팅

React Navigation 을 쓰지 않는다. `App.tsx` 의 `useState<Screen>` 하나로 전환한다.

| `Screen` 값 | 그리는 화면 | 하드웨어 뒤로가기 |
|---|---|---|
| `home` | Home (+ 새 버전이면 `UpdateModal`) | 종료 확인창 |
| `manageWords` | ManageWords | 홈 |
| `addWord` · `editWord` | AddWord (`editWord` 는 `wordId` 를 넘긴다) | `previousScreen` |
| `manageCategories` | CategoryManage | `previousScreen` |
| `importWords` | ImportWords | `previousScreen` |
| `quizSetup` | QuizSetup | 홈 |
| `quiz` | Quiz (카테고리나 단어 목록이 있을 때만) | 확인창 뒤 `exitQuiz`: 설정에서 왔으면 퀴즈 설정, 아니면 홈 |
| `quizResult` | QuizResult | 홈 |
| `flashcardSetup` | FlashcardSetup | 홈 |
| `flashcard` | Flashcard | 플래시카드 설정 |
| `statistics` · `myPage` · `settings` | 각 화면 | 홈 |
| `support` | Support | 설정 |
| `notice` | Notice | `noticeFrom` (홈 또는 설정) |

- 점검 중(`isBlocking(gate)`)이면 어느 값이든 `BlockingGate` 를 그리고 뒤로가기를 무시한다
- `quiz` · `flashcard` 가 조건을 못 채우면 마지막 기본 분기인 **Home 이 그려진다.**
  ~~복습 배너 · 플래시카드에서 온 퀴즈의 `다시 풀기` 가 이 길로 빠졌다~~ → 2026-09-18 고침(`quizSourceWordIds`). 이 기본 분기는 여전히 조용히 홈을 그리므로, 퀴즈로 가는 새 길을 만들면 카테고리나 단어 목록 중 하나를 반드시 넘긴다

## 화면 흐름

```
Home ─┬─ 학습하기 ─→ QuizSetup ─→ Quiz ─→ QuizResult ─┬─ 틀린 것 다시 → Quiz
      │                                                ├─ 다시 풀기   → Quiz
      ├─ 복습 배너 ───────────────→ Quiz                └─ 홈으로      → Home
      ├─ 플래시카드 ─→ FlashcardSetup ─→ Flashcard ─(이 N개로 퀴즈)→ Quiz
      ├─ 단어 추가 ─→ AddWord
      ├─ 단어장 ───→ ManageWords ─┬─ 수정 → AddWord(edit)
      │                          ├─ 관리 → CategoryManage
      │                          └─ 받기 → ImportWords
      ├─ 카테고리 ─→ CategoryManage
      ├─ 통계 ─────→ Statistics
      ├─ 마이 ─────→ MyPage
      ├─ 종 ───────→ Notice
      └─ 톱니 ─────→ Settings ─┬─ 공지사항 → Notice
                               └─ 문의하기 → Support
```

## 플랫폼 분기

| 기능 | Android | 웹 |
|------|--------|-----|
| 저장소 | AsyncStorage | localStorage |
| 자격증명(`myword_device_id` · 세션) | SecureStore | 저장하지 않음(세션은 메모리) |
| 광고 | AdMob | 그리지 않는다(`.web.tsx`) |
| 학습 알림 · 백업 | 지원 | 설정에서 섹션을 숨긴다 |
| 뒤로가기 | BackHandler | 없음 |
