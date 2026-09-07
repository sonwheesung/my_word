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

### ⚠ 네이티브 설정 수동 동기화 (`android/` 는 gitignore)

`android/` 는 git 에 없고 서명 설정(`keystore.properties` 를 읽는 `signingConfigs`)이 손으로
들어가 있다. **`expo prebuild` 를 돌리면 그 설정이 날아간다.** 그래서 아래 값들은 `app.json`
을 고칠 때 **손으로 같이** 고쳐야 한다. 안 맞으면 조용히 어긋난다.

| app.json | 짝이 되는 네이티브 파일 | 안 맞으면 |
|---|---|---|
| `version` | `android/app/build.gradle` → `versionName` | 스토어 표기 불일치 |
| `android.versionCode` | `android/app/build.gradle` → `versionCode` | 업로드 거부 |
| `runtimeVersion` | `android/app/src/main/res/values/strings.xml` → `expo_runtime_version` | **OTA 가 조용히 안 먹음** |

`AndroidManifest.xml` 의 `expo.modules.updates.*`(ENABLED·EXPO_UPDATE_URL·채널 헤더)는
한 번 넣으면 바뀌지 않는다. 네이티브 모듈을 추가·제거했을 때만 `runtimeVersion` 을 올린다.

**짝이 없는 단독 설정**(app.json 에 대응물이 없어 표에 못 넣지만 재생성되면 사라진다):

| 파일 | 값 | 사라지면 |
|---|---|---|
| `android/gradle.properties` | `android.enableMinifyInReleaseBuilds=true` | Play "앱 최적화" 경고가 되살아난다 |
| `android/app/proguard-rules.pro` | `expo.modules.**` keep 등 | R8 이 Expo 모듈 이름을 바꿔 **기능이 조용히 사라진다** |
| `AndroidManifest.xml` | `expo.modules.notifications.default_notification_icon`·`_color` (+FCM 쌍) | 알림 아이콘이 **흰 사각형 덩어리**가 된다 |
| `res/drawable-*/notification_icon.png` (5종) | 24dp×배율 흰 실루엣 | 〃 |
| `res/values/colors.xml` | `notification_icon_color` | 알림 강조색이 빠진다 |

🔴 **알림 리소스는 `expo-notifications` 의 config plugin 이 만들어야 하는 것인데, 이 프로젝트는
`prebuild` 를 돌리지 않으므로 플러그인이 실행되지 않는다.** `app.json` 의 plugins 항목만 보고
"설정했다"고 판단하면 안 된다 — 아래 명령이 실제로 파일을 만든다(재생성 후 복구도 이걸로):

```bash
node scripts/generate-notification-icon.js   # assets/ + drawable-*/ + colors.xml 을 함께 만든다
```

매니페스트 4줄만은 스크립트가 건드리지 않으니 손으로 확인한다(`grep default_notification` ).

### R8 (난독화·코드 축소)

Expo 템플릿 기본값은 **꺼짐**이다. 2026-09-01 에 켰다 — Play 콘솔 `모니터링 및 개선 → 조치 취하기`가
난독화율 **1%** 를 두고 *"앱의 공개 상태와 게시 기능에 영향을 미칠 수 있습니다"* 로 경고했기 때문이다
(기준 25% · 기한 2027-02 · 대상 19(1.3.3)).

- 🔴 **켠 뒤에는 릴리스 빌드로 전 화면 E2E 를 돌린다.** 디버그 빌드는 R8 을 안 타므로 검증이 안 된다.
  깨지는 방식이 크래시가 아니라 **조용한 기능 실종**(모듈 등록 실패)이라 눈으로 봐야 잡힌다.
- 🚫 `com.facebook.react.**` 를 통째로 keep 하지 않는다 — 난독화율이 다시 바닥이 되어 켠 의미가 없어진다.
  대부분의 라이브러리는 `consumer-rules.pro` 를 AAR 에 담아 오므로 필요한 것은 이미 지켜진다.
- R8 은 네이티브 설정이라 **OTA 로 못 바꾼다.** 스토어 릴리스에서만 반영된다.

#### ✅ 릴리스 빌드 E2E 통과 (2026-09-02)

공용 `common_1` 에서 릴리스 APK 로 확인했다. **네이티브 모듈이 하나도 조용히 죽지 않았다**:

| 확인 | 근거 (릴리스 빌드는 `__DEV__` 가 false 라 로그가 안 찍힌다 — `adb root` 로 실물을 봤다) |
|---|---|
| `expo-secure-store` · `expo-crypto` | `shared_prefs/SecureStore.xml` 에 키 2개 실재 |
| `expo-updates` | `dev.expo.EASSharedPreferences.xml` 생성 |
| AdMob · `expo-iap` | `admob.xml` 생성 · 설정에 광고 제거/구매 복원 표시 |
| `expo-constants` | 설정 화면 버전 `1.3.3` 정상 |
| 부팅 조회 · 세션 복원 | 공지 뱃지 표시 · 재시작 후 세션 키 유지(재등록 아님) |
| **오프라인 부팅** | 비행기 모드에서 화면 정상 · **오류 문구 0건** |

🔴 **`expo-updates` 가 살아 있는 것이 특히 중요하다** — 그게 R8 에 죽으면 **다음 OTA 로 그걸 고칠 수단이 없다.**
스스로를 고칠 수 없는 유일한 모듈이라, R8 설정을 건드릴 때마다 이 한 줄은 반드시 다시 잰다.

⚠ 절차·함정은 `.claude/skills/emulator-test` 에 있다. 값 검증은 로그가 아니라 `shared_prefs` 를 본다.

#### ✅ R8 은 **1.4.0(versionCode 20)** 으로 나갔다 — 2026-09-07 게시 완료

`활성 · 최신 출시 버전: 20 (1.4.0) - 학습 알림 · 국가/지역 145개`.
🔴 **켠 목적이었던 경고가 사라졌다** — 게시 전까지 있던 `확인 필요 문제 1개 · 앱 최적화 기준점
미달(난독화 1%) · 기한 2027-02` 가 목록에서 없어졌다. R8 이 스토어 쪽에서도 인정됐다는 증거다.

**제출 완료**(전체 출시 100% · 145개국). 콘솔이 재 준 실물 효과:

| | 1.3.3 → 1.4.0 |
|---|---|
| 신규 설치 크기 | **-9.78MB** (27.0MB → **17.2MB**) |
| 다운로드 시간 | **-5초** (15초 → 10초) |
| 지원 중단 기기 | **0** (전화 12,477 · 태블릿 6,684 그대로) |

`mapping.txt`(48.1MB)와 `native-debug-symbols.zip`(20.4MB)은 **gradle 이 AAB 안에 함께 넣어**
따로 올릴 필요가 없었다. 다음 릴리스에도 그대로 된다 — 별도 업로드 절차를 만들지 말 것.

🔴 **심사 통과 후 확인할 것**: 콘솔 `모니터링 및 개선`의 *"앱 최적화 기준점 미달(난독화 1%)"*
경고가 사라지는가. 그게 R8 이 스토어 쪽에서도 인정됐다는 유일한 증거다.


2026-09-02 에 "그것만으로 릴리스를 만들 이유가 없다"며 1.3.4 를 미뤄 두고 **다음 기능 릴리스에
묶기로** 했다(사용자 결정). 그 기능 릴리스가 **1.4.0 — 학습 알림**이다. R8 이 스토어에 처음 나간다.

- **출시 노트**: 기능 변경이 있으므로 **알림 기능을 적고 "최적화"는 덧붙이지 않는다.**
  난독화율·R8 같은 내부 사정은 사용자에게 의미가 없다.
  (미뤄 둘 때의 규칙 — *"다른 기능 수정이 없으면 최적화만 적는다"* — 은 이번에는 해당하지 않는다)
- 🔴 **`mapping.txt` 를 함께 업로드한다** — `android/app/build/outputs/mapping/release/mapping.txt`.
  안 올리면 난독화된 크래시 스택을 **읽을 수 없다.** R8 을 켠 첫 스토어 릴리스라 이번이 특히 중요하다.
- 🔴 **알림은 네이티브 모듈이라 R8 검증을 다시 한다.** 9-02 의 통과는 그때의 모듈 구성에 대한
  것이고, `expo-notifications` 는 그 뒤에 들어왔다. `expo.modules.**` keep 이 덮을 **것으로 보이나
  가정하지 않는다** — 라이브러리 자신의 `proguard-rules.pro` 는 `consumerProguardFiles` 선언이
  없어 자동 적용되지 않는다(실측). 절차는 `.claude/skills/emulator-test`.

#### ⚖ 야간 알림 — 지금은 §50③ 대상이 아니다. **서버 발신이 되는 순간 뒤집힌다**

기본 시각을 21:00 이 아닌 **20:00** 으로 둔 것은 조심이지 의무가 아니다. 사용자가 직접
22:00·23:00 을 고르는 것도 막지 않는다. 정보통신망법 §50③ 의 세 요건이 다 안 맞기 때문이다:

| 요건 | 지금의 알림 |
|---|---|
| "전자적 전송매체로 **전송**하려는 자" | 🔴 그 시각에 **전송하는 주체가 없다.** 기기 안에서 스스로 뜬다 |
| "**영리목적의 광고성** 정보" | 사용자가 저장한 자기 단어의 복습 안내다 |
| "**수신자로부터** 별도 동의" | **수신자 본인이 그 시각을 골랐다** — 동의보다 강한 의사표시다 |

그래서 야간 시각을 고를 때 동의 화면을 띄우지 않는다. 띄우면 방금 23:00 을 고른 사람에게
23:00 에 보내도 되냐고 되묻는 꼴이고, 우리가 야간에 광고를 보낸다는 오해만 만든다.

🔴 **뒤집히는 조건은 하나다 — 알림이 우리 서버에서 출발하는 것.**
공지 푸시·리텐션 푸시(FCM 등)를 붙이는 순간 첫 요건이 성립하고, "오랜만이에요" 류의
재방문 유도 문구는 방통위가 광고성으로 보는 쪽에 가깝다. **그때는 야간(21:00~08:00) 별도
동의가 실제로 필요하다.** 푸시를 검토할 때 이 절을 먼저 읽는다.

⚠ 법률 자문이 아니다 — 조문 요건에 대조한 판단이다. 서버 발신으로 넘어갈 때는 확인이 필요하다.

#### ✅ 1.4.0 릴리스 빌드 E2E 통과 (2026-09-07)

공용 `common_2`(API 35)에서 릴리스 APK 로 확인했다. **알림을 추가한 뒤에도 아무 모듈도 조용히 죽지 않았고**,
알림 자체도 실물로 동작한다:

| 확인 | 근거 |
|---|---|
| 정확 알람 권한 | 병합 매니페스트에 `EXACT_ALARM` **0건** · 실제 알람이 `window=+1h`(부정확) → Play 정당화 불필요 |
| 예약 | `origWhen` 이 **내일부터 7일치, 지정 시각 정각** · `Pending alarms per uid` 로 7개 |
| 시각 변경 | 20:00 → 02:00 → 00:00 → 21:00 전부 예약이 따라 바뀜 |
| 토글 OFF | 대기 알람 목록에서 **uid 자체가 사라짐** |
| 🔴 재부팅 | **앱을 열지 않았는데 7개 그대로 복원** → R8 이 `BOOT_COMPLETED` 리시버를 안 지웠다 |
| 실제 발화 | 00:00 에 알림이 떴고 예약이 7→6 · 문구·**아이콘이 흰 사각형이 아님** · `vis=PRIVATE` |
| 배경 전환 재예약 | 홈으로 나가자 장부 해시가 바뀜 |
| 권유 시트 | 첫 퀴즈 뒤 홈에서 1회 · 수락 후 재시작해도 다시 안 뜸 |
| 기존 모듈 | `SecureStore.xml`(키 2개) · `EASSharedPreferences.xml`(**expo-updates**) · `admob.xml` · 설정에 광고제거/복원 |
| 오프라인 부팅 | 비행기 모드에서 화면 정상 · **오류 문구 0건** |

⚠ 화면으로만 잡힌 버그가 하나 있었다(시각 목록이 선택값을 안 보여 줌). 단위 테스트로는 안 잡힌다.

#### 🗓 1.5.0 은 **다음 주에 올린다** (2026-09-07 사용자 결정)

개발은 지금 하되 업로드를 미룬다. 사용자가 든 이유는 "업데이트가 잦으면 검색 순위에 좋다"였고,
그 근거 자체는 약하지만(Play 는 설치 속도·유지율·평점·제거율 같은 실사용 신호를 본다)
**미루는 결정 자체는 더 강한 이유로 옳다**:

🔴 **1.4.0 의 알림은 아직 아무도 받아 본 적이 없다.** 알림은 설치·실행 **다음 날**부터 뜨는
구조라, 게시 당일에는 실사용 데이터가 구조적으로 0이다. 크래시·ANR·"실제로 뜨는가"를
며칠 관찰한 뒤에 그 위에 다음 릴리스를 얹는다.

⚠ 순위가 목표라면 지렛대는 업데이트 빈도가 아니라 **스토어 등록정보**(제목·짧은 설명·
스크린샷)다 — 설치가 7건인 단계에서는 그쪽이 비교가 안 되게 크다. 별건으로 남겨 둔다.

#### ⏭ Play 가 새로 준 숙제 — **R8 을 절반만 켜 두었다** (2026-09-07)

난독화 경고가 사라지자 `권장 조치`에 새 항목이 떴다: **"R8 최적화로 앱의 메모리 및 성능 개선"**.
콘솔이 짚은 세 가지를 우리 설정과 대조한 결과 **두 개는 사실이고 하나는 우리 손 밖이다**:

| Play 지적 | 우리 실제 | 고칠 수 있나 |
|---|---|---|
| 최적화가 사용 설정되지 않음 | `proguardFiles getDefaultProguardFile("proguard-android.txt")` — **최적화를 끄는** 기본 파일이다(`proguard-android-optimize.txt` 가 켜는 판) | ✅ 한 줄 |
| 리소스 축소가 사용 설정되지 않음 | `android.enableShrinkResourcesInReleaseBuilds` 미설정 → `shrinkResources=false` | ✅ 한 줄 |
| AGP 9.0 이상으로 업그레이드 | Expo SDK 가 정한다(`classpath('com.android.tools.build:gradle')` 버전 미지정) | ❌ SDK 55 대기 |

⚠ **9-01 에 "리소스 축소는 위험만 더한다"고 적어 둔 판단은 그때 기준이 난독화율뿐이었기 때문이다.**
Play 가 메모리·성능 축으로도 보기 시작했으므로 그 판단은 갱신 대상이다.

🔴 **둘 다 R8 을 더 공격적으로 만든다 — 조용한 기능 실종 위험이 다시 올라간다.**
특히 `shrinkResources` 는 이름으로만 참조되는 리소스를 지운다. 켤 때는 **알림 아이콘처럼
매니페스트에서 `@drawable` 로 참조되는 것**까지 릴리스 빌드 E2E 로 다시 잰다.
→ 다음 기능 릴리스에 **함께** 싣는다. 그것만으로 릴리스를 만들지 않는다(9-02 와 같은 이유).

### OTA (expo-updates)

- 채널은 `eas.json` 의 빌드 프로필에 있다(`production`/`preview`/`development`)
- **OTA 는 1.3.3(versionCode 19)부터 동작한다.** 그 이전 버전 사용자는 스토어로 한 번 올라와야 한다
- **OTA 로 내보내는 범위**: 문구·스타일·명백한 JS 버그픽스까지. 로직 변경은 스토어로 간다
  (깨진 번들이 나가면 이미 받은 사용자는 다음 확인 때까지 깨진 채로 남는다 — 심사가 걸러주지 않는다)
- 네이티브 모듈이 바뀌면 OTA 로 못 보낸다. 반드시 스토어 빌드다

상세 가이드: `.claude/SKILL.md` 참조
