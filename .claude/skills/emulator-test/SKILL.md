---
name: emulator-test
description: My Word 를 안드로이드 에뮬레이터에 올려 화면을 보며 터치로 검증한다 ("에뮬레이터 테스트", "에뮬로 띄워서 확인", "실기기처럼 눌러봐", "E2E 돌려줘", "릴리스 빌드로 확인"). 공용 2대를 클레임 걸고 빌려 쓰며, 이 PC 고유의 창 오류·Metro 함정·오프라인 검증 제약을 담고 있다. 단위/타입 검사만 필요하면 `npx tsc --noEmit` 로 충분하니 부르지 않는다.
---

# emulator-test (My Word 판)

> **방법은 공용 스킬에 있다** — `C:\project\common\.claude\skills\emulator-test\SKILL.md`
> (클레임 절차 · 보고-판단-탭 루프 · 좌표 환산 · uiautomator bounds · 사전조건 7항목).
> 이 문서는 **My Word 의 구체값과 이 PC 에서 실제로 당한 것**만 적는다. 방법을 여기 베끼지 않는다 — 베끼면 갈라진다.

## 구체값

| | 값 |
|---|---|
| 패키지 | `com.myword.front` |
| 해상도 | 1080 × 2400 (`screencap` 좌표 기준) |
| 릴리스 빌드 | `cd android && ./gradlew assembleRelease` → `app/build/outputs/apk/release/app-release.apk` |
| 디버그 빌드 | `npx expo run:android --device common_1` (+ Metro 별도) |
| 서명 | `keystore.properties`(레포 루트, gitignore) 자동 적용. 운영키 SHA-256 `EE:68:31:DB:…:86:1F:5B` |

## 🔴 이 PC 에서 실제로 당한 것

**1. 창 모드로 안 뜬다.** 그냥 띄우면 `Critical: Failed to load opengl32sw` 로 즉시 죽는다.
AVD 문제가 아니라 Qt 창 문제다. **headless 로 띄운다** — 규약 옵션과 함께:

```bash
"$EMU" -avd common_1 -port 5580 -no-snapshot -no-snapshot-save \
       -no-window -no-audio -no-boot-anim -gpu swiftshader_indirect
```

창이 없어도 `screencap` · `input tap` 은 그대로 된다.

**2. 에뮬레이터·Metro 를 파이프로 받으면 죽는다.** `| tail -30` 을 붙이면 프로세스가 종료된다.
백그라운드로 돌리고 로그 파일을 따로 읽는다.

**3. Metro 가 죽어도 8081 을 좀비가 잡는다.** 재시작이 `Port 8081 is being used` 로 막히면
`netstat -ano | grep :8081` → `taskkill //F //PID <pid>`.

**4. 빌드 직후 Metro 가 `Failed to start watch mode` 로 뜬다.** gradle 이 `android/` 에 GB 를 쏟는
동안 파일 크롤링이 타임아웃한 것이다. 빌드가 끝난 뒤 재시작하면 풀린다.

**5. 🔴 오프라인 검증은 디버그 빌드로 못 한다.** 비행기 모드에서 디버그 앱은 Metro 로부터 번들을
못 받아 `Unable to load script` 로 죽는다 — 개발 빌드만의 현상이라 검증이 성립하지 않는다.
**릴리스 빌드(번들 내장)로 재야 한다.** ([[feedback-offline-no-error-ui]])

**6. 🔴 클레임 파일이 있어도 안 떠 있을 수 있다 (유령 락).**
`.emulator-claims/*.lock` 은 세션이 끝나거나 PC 가 재부팅돼도 **안 지워진다.**
2026-09-02 실측: 락 2개가 하루 넘게 남아 있었는데 `adb devices` 는 **완전히 비어 있었다.**

```bash
ls "$CLAIMS"/*.lock          # 약속
"$ADB" devices               # 🔴 진실 — 여기 없으면 유령 락이다
```

락만 보고 *"둘 다 사용 중"* 으로 읽으면 **빌릴 수 있는 에뮬레이터를 두고 작업을 접는다.**
빼앗는 것이 아니므로 공용 §3(사용자에게 묻기)의 대상이 아니지만, `note=` 에 그 사실을 남긴다.

## 반드시 보는 동선

앱이 100% 로컬(AsyncStorage)이고 서버는 부가 기능이라, **서버가 죽어도 앱이 멀쩡한지**가 핵심이다.

1. 홈 → 단어 추가 → 단어장 → 퀴즈 → 통계 (핵심 기능. 서버 무관)
2. 설정 → 문의하기 → 전송 (토스트가 하단에 뜨는지 · 잘리지 않는지)
3. 카테고리 관리 · 단어 상세 **시트** — 하단 버튼이 내비게이션 바에 잘리지 않는지
   (edge-to-edge + Modal 조합에서 실제로 잘렸던 자리다)
4. **비행기 모드 부팅** — 오류 표시가 **0건**이어야 한다. 공지 화면은 빈 상태로 뜬다

## ⚠ R8 을 켠 뒤(2026-09-01)에는 이것도 본다

R8 은 **크래시가 아니라 조용한 기능 실종**으로 깨진다. 릴리스 빌드에서만 재현된다.

- [ ] 부팅 로그에 `[commonServer] 기기 세션` 이 찍히나 → `expo-secure-store`·`expo-crypto` 생존
- [ ] 관리자 콘솔 사용자 탭에 `device` 주체가 느나 → 등록이 실제로 서버에 닿았나
- [ ] 문의 전송 후 작성자가 **익명이 아닌지** → 세션이 실려 나갔나
- [ ] 배너 광고가 뜨나 → `react-native-google-mobile-ads`
- [ ] 앱을 껐다 켜서 세션이 **복원**되나(재등록이 아니라) → SecureStore 영속화
- [ ] 설정에 표시되는 버전이 맞나 → `expo-constants`

하나라도 어긋나면 `android/app/proguard-rules.pro` 에 keep 을 **좁게** 추가한다.
🚫 `com.facebook.react.**` 통째 keep 금지 — 난독화율이 바닥이 되어 R8 을 켠 의미가 사라진다.
