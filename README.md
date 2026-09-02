# My Word

단어를 저장하고 퀴즈로 외우는 안드로이드 앱. Google Play 프로덕션 운영 중(`com.myword.front`).

> **이 문서는 "이 저장소를 처음 여는 사람"을 위한 것이다.**
> 개발 규칙은 [`CLAUDE.md`](CLAUDE.md), 설계는 [`docs/`](docs/), 변경 이력은 [`docs/CHANGELOG.md`](docs/CHANGELOG.md).

---

## 🔴 먼저 알아야 할 것 세 가지

**① 서버가 없다.** 단어·카테고리·퀴즈 기록은 전부 **기기 안(AsyncStorage)** 에만 있다.
회원가입도 로그인도 없고, 학습 데이터는 어디로도 나가지 않는다.
공통 서버(`common-server.vercel.app`)를 쓰긴 하지만 **공지·버전 안내·문의 접수**뿐이고,
**죽어도 앱은 평소대로 동작한다** — 부팅 경로의 실패는 전부 조용히 삼킨다.

> 🔴 **오프라인에서 오류 표시가 뜨면 그것이 버그다.** 사용자 지시로 못박힌 규칙이다.

**② `android/` 는 git 에 없다.** `.gitignore` 대상이고, **서명 설정이 손으로 들어가 있다.**
`expo prebuild` 를 돌리면 그게 날아간다. 아래 값들은 `app.json` 을 고칠 때 **손으로 같이** 고쳐야 한다:

| `app.json` | 짝이 되는 네이티브 파일 | 안 맞으면 |
|---|---|---|
| `version` | `android/app/build.gradle` → `versionName` | 스토어 표기 불일치 |
| `android.versionCode` | 〃 → `versionCode` | 업로드 거부 |
| `runtimeVersion` | `android/app/src/main/res/values/strings.xml` → `expo_runtime_version` | **OTA 가 조용히 안 먹음** |

전체 목록과 이유는 [`CLAUDE.md`](CLAUDE.md) 참조.

**③ 릴리스 빌드는 R8 을 탄다.** 디버그 빌드로 확인한 것은 확인이 아니다 —
R8 은 **크래시가 아니라 조용한 기능 실종**으로 깨진다(모듈 등록 실패). `.claude/skills/emulator-test` 에 체크리스트가 있다.

---

## 기술 스택

| | |
|---|---|
| 프레임워크 | **Expo SDK 54** · React Native **0.81.5** · React **19.1.0** |
| 언어 | TypeScript **5.9** |
| 네이티브 | **New Architecture** (`newArchEnabled=true`) · Hermes · edge-to-edge |
| 저장소 | AsyncStorage (웹은 localStorage) — **서버 없음** |
| 화면 방향 | 세로 고정 |
| 다국어 | `i18next` + `react-i18next` — 한국어 · English |
| 광고 | `react-native-google-mobile-ads` (AdMob) |
| 인앱결제 | `expo-iap` — 평생 광고 제거 (`remove_ads`, 관리형 상품) |
| OTA | `expo-updates` — **1.3.3(versionCode 19)부터 동작** |
| Node | >= 18 |

---

## 시작하기

```bash
npm install
cp .env.example .env      # EXPO_PUBLIC_SERVER_URL 하나뿐이다(공개값)
npm start
```

| 명령 | 하는 일 |
|---|---|
| `npm start` | Metro 개발 서버 (포트 **8081** — 기본값) |
| `npm run android` / `ios` / `web` | 플랫폼별 실행 |
| `npm test` | Jest (`__tests__/` 9개 스위트) |
| `npm run lint` | ESLint |
| `npx tsc --noEmit` | 🔴 **타입 체크 — 모든 변경 후 필수** |

⚠ **Expo Go 로는 전부 안 돌아간다.** 광고·인앱결제·SecureStore 는 네이티브 모듈이라
**development build** 가 필요하다. Expo Go 에서는 그 기능들이 방어 코드로 비활성된다.

⚠ **다른 프로젝트와 포트가 겹칠 수 있다.** 이 앱은 Metro 기본값 8081 을 쓴다 —
`--port` 를 지정하지 않은 형제 프로젝트와 같은 자리다(`C:\project\common\DEV_ALLOCATION.md` §1).

---

## 프로젝트 구조

```
App.tsx                    진입점 — useState<Screen> 라우팅 · ErrorBoundary · 컨텍스트 배선
app.json                   Expo 설정 (version · versionCode · runtimeVersion · updates)
eas.json                   EAS 빌드/제출 프로필 (development · preview · production)
docs/                      설계 문서 + 게시되는 법적 고지(.html)
.agents/                   에이전트 역할 정의 12종
.claude/
  SKILL.md                 🔴 코딩 규칙 본문 842줄 (스킬이 아니라 문서다)
  skills/                  emulator-test · i18n-layout-audit · reload-docs
scripts/                   아이콘·스토어 애셋·오픈소스 고지 생성기
src/
├── components/            AdBanner · BottomSheet · BlockingGate · Toast · UpdateModal 등 8개
│                          (`.web.tsx` 는 웹 전용 대체 구현)
├── constants/             appConfig · adConfig · partOfSpeech
├── contexts/              Bootstrap(공지·버전) · Purchase(광고제거) · Theme
├── hooks/                 useInterstitialAd · useToast
├── i18n/                  🔴 **한국어 원문이 곧 키다** — locales/en.json 만 있다
├── screens/               13개 (아래)
├── services/              word · category · quiz · dictionary · share · support · notice · version
│   └── commonServer/      ⚠ 공통 서버 SDK — **손으로 고치지 말 것**(원본에서 재복사)
├── types/
└── utils/                 storage · date · text · speech
```

**라우팅에 React Navigation 을 쓰지 않는다.** `App.tsx` 의 `useState<Screen>` 하나로 전환하고,
각 화면은 `onBack` · `onNavigate*` 콜백을 props 로 받는다.

### 화면 13개

| 묶음 | 화면 |
|---|---|
| 핵심 | Home · ManageWords · AddWord · CategoryManage · ImportWords |
| 퀴즈 | QuizSetup · Quiz · QuizResult |
| 기록 | Statistics · MyPage |
| 기타 | Settings · Support(문의) · Notice(공지) |

---

## 데이터

전부 로컬이고 **키를 추가만 한다 — 기존 스키마와 CSV 포맷은 바꾸지 않는다**(운영 중인 앱이라 되돌릴 수 없다).

| 키 | 내용 |
|---|---|
| `@my_word_categories` · `@my_word_words` · `@my_word_quiz_results` | 본체 |
| `@my_word_next_id` | 전역 ID 카운터 |
| `@my_word_language` · `@my_word_read_notices` · `@my_word_ad_free` | 설정·캐시 |
| `myword_device_id` | 🔴 **SecureStore** — 문의 답변용 식별자(AsyncStorage 아님) |

상세는 [`docs/data-model.md`](docs/data-model.md).

---

## 빌드

### 로컬 (권장 — 서명키가 여기 있다)

```bash
cd android && ./gradlew assembleRelease     # APK  → app/build/outputs/apk/release/
cd android && ./gradlew bundleRelease       # AAB  → app/build/outputs/bundle/release/
```

`keystore.properties`(저장소 루트, gitignore)를 읽어 자동 서명한다.
🚫 **`credentials/` · `*.jks` 는 절대 지우지 않는다** — 잃으면 이 앱을 다시 업데이트할 수 없다.

### EAS

```bash
eas build --platform android --profile production
```

| 프로필 | 채널 | 산출물 |
|---|---|---|
| `development` | development | dev client |
| `preview` | preview | APK |
| `production` | production | AAB |

### OTA (JS 만 바꿀 때)

```bash
eas update --branch production --message "무엇을 바꿨나"
```

- **문구·스타일·명백한 JS 버그픽스까지.** 로직 변경은 스토어로 간다 —
  깨진 번들이 나가면 이미 받은 사용자는 다음 확인 때까지 깨진 채로 남는다(심사가 안 걸러준다).
- 네이티브 모듈이 바뀌면 OTA 로 못 보낸다. `runtimeVersion` 은 **그때만** 올린다
  (앱 버전을 올려도 따라 오르지 않는다 — 지금 값이 `1.3.3` 인 것은 OTA 도입 시점이라서다).

---

## 문서

| 문서 | 내용 |
|---|---|
| [`CLAUDE.md`](CLAUDE.md) | 개발 규칙 · 네이티브 수동 동기화 · R8 · OTA |
| [`.claude/SKILL.md`](.claude/SKILL.md) | 코딩 규칙 상세 23항 |
| [`docs/architecture.md`](docs/architecture.md) · [`data-model.md`](docs/data-model.md) · [`screens.md`](docs/screens.md) · [`services-api.md`](docs/services-api.md) | 설계 |
| [`docs/test-cases.md`](docs/test-cases.md) | 테스트 케이스 기준 문서 |
| [`docs/DISTRIBUTION_POLICY.md`](docs/DISTRIBUTION_POLICY.md) | **EEA·영국·스위스 32개국을 왜 닫아 뒀나**(UMP 미구현) |
| [`docs/CHANGELOG.md`](docs/CHANGELOG.md) | 릴리스 이력 |

**게시 중인 법적 고지** — `docs/*.html` 이고 GitHub Pages 로 나간다.
처리방침 URL 은 Play Console 에도 등록돼 있어 **주소를 바꾸면 콘솔도 함께 바꿔야 한다.**

- [개인정보처리방침](https://sonwheesung.github.io/my_word/privacy-policy.html) · [이용약관](https://sonwheesung.github.io/my_word/terms-of-service.html) · [오픈소스 라이선스](https://sonwheesung.github.io/my_word/open-source-licenses.html)

⚠ **의존성을 추가·변경하면 `node scripts/generate-oss-licenses.js` 를 다시 돌려 커밋한다.**
안 돌리면 고지가 조용히 거짓이 되고, **고지의 거짓은 라이선스 위반**이다.

---

## 라이선스

Private. 앱에 포함된 오픈소스 의존성의 고지는 위 링크 참조.
