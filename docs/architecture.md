# My Word - 아키텍처 문서

## 기술 스택

| 항목 | 기술 |
|------|------|
| 프레임워크 | React Native (Expo SDK 54) |
| 언어 | TypeScript 5.9 |
| 로컬 저장소 | AsyncStorage (모바일) / localStorage (웹) |
| 광고 | react-native-google-mobile-ads (AdMob) |
| TTS | expo-speech |
| 패키지명 | `com.myword.front` |
| 최소 Node | >= 18.0.0 |

## 폴더 구조

```
my_word/
├── App.tsx                    # 앱 진입점 (라우팅, ErrorBoundary)
├── index.js                   # Expo 엔트리
├── app.json                   # Expo 설정
├── eas.json                   # EAS Build 설정
├── docs/                      # 프로젝트 문서
├── src/
│   ├── components/            # 공용 컴포넌트
│   │   ├── AdBanner.tsx       # 배너 광고
│   │   ├── ScreenHeader.tsx   # 화면 헤더 (뒤로가기 + 제목)
│   │   ├── SkeletonLoader.tsx # 로딩 스켈레톤
│   │   └── Toast.tsx          # 토스트 알림
│   ├── constants/             # 상수 정의
│   │   ├── adConfig.ts        # AdMob ID
│   │   └── partOfSpeech.ts    # 품사 한글 변환
│   ├── hooks/                 # 커스텀 훅
│   │   ├── useInterstitialAd.ts # 전면광고 관리
│   │   └── useToast.ts        # 토스트 상태 관리
│   ├── screens/               # 화면 컴포넌트 (9개)
│   │   ├── HomeScreen.tsx
│   │   ├── ManageWordsScreen.tsx
│   │   ├── AddWordScreen.tsx
│   │   ├── CategoryManageScreen.tsx
│   │   ├── QuizSetupScreen.tsx
│   │   ├── QuizScreen.tsx
│   │   ├── QuizResultScreen.tsx
│   │   ├── StatisticsScreen.tsx
│   │   └── MyPageScreen.tsx
│   ├── services/              # 비즈니스 로직
│   │   ├── wordService.ts
│   │   ├── categoryService.ts
│   │   ├── quizService.ts
│   │   └── dictionaryService.ts
│   ├── types/                 # 타입 정의
│   │   └── word.ts
│   └── utils/                 # 유틸리티
│       └── storage.ts         # 저장소 추상화 레이어
├── assets/                    # 이미지 리소스
├── scripts/                   # 빌드/배포 스크립트
└── .agents/                   # 에이전트 역할 정의
```

## 레이어 아키텍처

```
┌──────────────────────────────────────┐
│           App.tsx (라우터)            │
│     useState 기반 화면 전환 관리       │
├──────────────────────────────────────┤
│         Screens (9개 화면)            │
│   UI 렌더링 + 사용자 인터랙션 처리      │
├──────────────────────────────────────┤
│     Components / Hooks               │
│   공용 UI + 상태 관리 훅              │
├──────────────────────────────────────┤
│         Services (비즈니스 로직)       │
│  wordService, categoryService,       │
│  quizService, dictionaryService      │
├──────────────────────────────────────┤
│       Storage (저장소 추상화)          │
│  AsyncStorage (모바일)               │
│  localStorage (웹)                   │
├──────────────────────────────────────┤
│       외부 API                       │
│  Google Translate, Free Dictionary   │
│  AdMob                              │
└──────────────────────────────────────┘
```

## 화면 흐름 (네비게이션)

```
                    ┌─────────┐
                    │  Home   │
                    └────┬────┘
          ┌──────┬───────┼────────┬──────────┐
          v      v       v        v          v
     ManageWords  AddWord  QuizSetup  Statistics  MyPage
       │    │              │
       v    v              v
   AddWord  CategoryManage  Quiz
   (edit)                   │
                            v
                        QuizResult
                         │  │  │
                         v  v  v
                     Retry/RetryWrong/Home
```

## 라우팅 방식

React Navigation을 사용하지 않고, `App.tsx`에서 `useState<Screen>`으로 직접 화면 전환을 관리한다.

- `Screen` 타입: `'home' | 'manageWords' | 'addWord' | 'editWord' | 'manageCategories' | 'quizSetup' | 'quiz' | 'quizResult' | 'statistics' | 'myPage'`
- 각 화면은 `onBack`, `onNavigate*` 등 콜백 props로 화면 전환을 트리거
- `previousScreen` 상태로 "뒤로가기" 시 이전 화면 복원

## 플랫폼 분기

| 기능 | 모바일 | 웹 |
|------|--------|-----|
| 저장소 | AsyncStorage | localStorage |
| 광고 | AdMob (실 광고) | 미표시 (null) |
| TTS | expo-speech | expo-speech (웹 지원) |
| 뒤로가기 | BackHandler (Android) | 미지원 |
