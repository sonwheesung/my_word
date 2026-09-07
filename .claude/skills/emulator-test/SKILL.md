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

🔴 **로그로 검증하지 말 것 — 릴리스 빌드는 `__DEV__` 가 false 라 `[commonServer]` 류가 아예 안 찍힌다.**
2026-09-02 에 이 체크리스트의 1번이 그렇게 적혀 있어서 첫 항목부터 막혔다. **디버그에서 만든 절차를
릴리스에 그대로 들고 간 것**이다 — 검증 방법이 검증 대상과 안 맞으면 "확인 못 함"이 "이상 없음"으로 새기 쉽다.

→ `adb root` 로 **실물을 본다**(공용 AVD 는 `google_apis` 이미지라 된다). `MSYS_NO_PATHCONV=1` 을 붙일 것
(안 붙이면 git-bash 가 `/data/...` 를 `C:/Files/Git/data/...` 로 바꿔 조용히 빈 결과가 나온다 — 실제로 당함).

```bash
export MSYS_NO_PATHCONV=1
"$ADB" -s "$S" root; sleep 3
"$ADB" -s "$S" shell "ls /data/data/com.myword.front/shared_prefs/"
# 🔴 키 이름만 본다. 값(기기 식별자·세션 토큰)은 자격증명이라 절대 찍지 않는다
"$ADB" -s "$S" shell "grep -o 'name=\"[^\"]*\"' /data/data/com.myword.front/shared_prefs/SecureStore.xml"
```

- [ ] `SecureStore.xml` 에 `myword_device_id` + `cs_session_myword` → `expo-secure-store`·`expo-crypto` 생존
- [ ] `dev.expo.EASSharedPreferences.xml` 이 있나 → 🔴 **`expo-updates` 생존.** 이게 죽으면
      **다음 OTA 로 그걸 고칠 수단이 없다** — 스스로를 고칠 수 없는 유일한 모듈이라 매번 잰다
- [ ] `admob.xml` 이 있나 → `react-native-google-mobile-ads` 초기화됨
      (배너가 화면에 안 떠도 R8 실패가 아니다 — 에뮬레이터는 광고가 안 채워질 수 있다)
- [ ] 홈 화면 벨에 **안읽음 점**이 뜨나 → `fetchBootstrap` 성공(서버 경로 생존)
- [ ] 앱을 껐다 켜서 세션 키가 **남아 있나** → 재등록이 아니라 복원
- [ ] 설정 하단 버전 표기가 `app.json` 과 같나 → `expo-constants`
- [ ] 설정에 `광고 제거`·`구매 복원` 이 보이나 → `expo-iap`

⚠ **하트비트 도달은 로컬에서 판정할 수 없다.** 토큰 슬라이딩 갱신을 오라클로 쓰면 안 된다 —
서버 `shouldRenew` 가 30일 기준이라 **갓 발급된 토큰은 성공해도 안 바뀐다**(2026-09-02 확인).
번들에 실렸는지까지만 로컬에서 보고(`unzip -p <apk> assets/index.android.bundle | grep -c v1/heartbeat`),
**도달 여부는 공통서버 세션에 묻는다.**

### 알림(1.4.0~)은 `shared_prefs` 로 못 잰다 — **예약을 직접 본다**

`expo.modules.notifications.SharedPreferencesNotificationsStore.xml` 에 예약이 남긴 하지만
**그 파일은 "OS 에 알람이 걸렸다"를 뜻하지 않는다** — 라이브러리가 재부팅 복원용으로 적어 두는
자기 장부일 뿐이고, R8 이 스케줄링 경로를 깨도 장부는 그대로 써진다. 화면에서 토글이 켜지는 것도
증거가 아니다(저장소에 `true` 를 쓴 것일 뿐이다).
**AlarmManager 에 실제로 잡혔는지**가 유일한 실물 증거다.

```bash
export MSYS_NO_PATHCONV=1
# ① 개수 — 🔴 `grep -c` 로 세지 말 것. dumpsys 는 같은 태그를 "App Alarm history" ·
#    "Allow while idle history" 절에도 다시 찍어 **실제보다 두 배가 나온다**(2026-09-07 실측:
#    예약 7개인데 14가 나왔다). 이 줄이 정본이다:
"$ADB" -s "$S" shell "dumpsys alarm | grep 'Pending alarms per uid'"
"$ADB" -s "$S" shell "dumpsys package com.myword.front | grep -m1 userId"   # u0aNNN 대조용

# ② 언제로 잡혔나 — 태그 바로 아래 두 줄에만 origWhen 이 있어 history 절이 안 섞인다
"$ADB" -s "$S" shell "dumpsys alarm | grep -A2 'expo.modules.notifications.NOTIFICATION_EVENT'"   | grep -o 'origWhen=[0-9-]* [0-9:.]*'
```

- [ ] 설정 → 학습 알림 ON → 권한 대화상자가 뜨나 → 허용 후 **예약이 0이 아닌가**
- [ ] 시각을 바꾸면 예약 시각이 따라 바뀌나
- [ ] 토글 OFF → 예약이 **0**이 되나
- [ ] 🔴 **기기를 재부팅해도 예약이 남아 있나** — 안드로이드는 재부팅 시 알람을 지운다.
      라이브러리가 `RECEIVE_BOOT_COMPLETED` 리시버로 되살리게 돼 있지만 **R8 이 그 리시버를
      지웠는지는 재부팅해 봐야만 안다.** 크래시가 아니라 조용한 실종이라 눈으로 못 본다
- [ ] 알림 문구에 **아직 안 푼 단어**가 나오나(단어 2개를 넣고 하나만 퀴즈를 풀어 확인)
- [ ] 앱을 열었다 닫으면 예약이 **다시 걸리나**(취소 후 재예약이므로 개수가 유지돼야 한다)

⚡ **시각을 기다리지 않고 터뜨리는 법** (2026-09-07 실측으로 정리):

1. `adb shell date ...` **만으로는 안 터진다.** AlarmManager 는 RTC 알람도 내부적으로 경과시간
   기준으로 들고 있어, 시계만 바꾸면 기준이 그대로다. `am broadcast -a android.intent.action.TIME_SET`
   을 함께 쏴야 다시 잰다.
2. 가장 깔끔한 방법은 **자정 직전으로 맞추고 알림 시각을 `00:00` 으로 두는 것**이다.
   예약은 "내일부터"라 23:57 로 맞추면 첫 알람이 **3분 뒤**가 된다.

🚫 **시계를 앞뒤로 옮기면 유령 중복이 생긴다 — 앱 버그로 오해하지 말 것.**
   밀려 있던 옛 알람이 `TIME_SET` 순간에 한꺼번에 터진다. 실제로 같은 문구가 2개 쌓였는데,
   `dumpsys notification --noredact` 의 `mCreationTimeMs` 두 개가 **시계를 옮긴 순간**과
   **진짜 알람 시각**으로 갈려 있어서 구분됐다. 중복이 보이면 그 값부터 본다.

🚫 **알림 아이콘이 흰 사각형으로 뜨면 R8 문제가 아니다** — `drawable-*/notification_icon.png`
   가 없는 것이다(prebuild 를 돌리지 않아 config plugin 이 실행되지 않는다).
   `node scripts/generate-notification-icon.js` 로 만든다.

### 리소스 축소(1.5.0~)를 켠 뒤 — **파일명으로 리소스를 검증하지 마라**

`shrinkResources` 를 켜면 APK 안 리소스 **이름이 난독화된다**(`res/-B.png`, `res/0c.9.png`).
`unzip -l app.apk | grep notification_icon` 은 **0개**를 낸다 — 지워진 것이 아니라 이름이 바뀐 것이다.

```bash
# ID 매핑을 본다(이름은 리소스 테이블에 남는다)
AAPT=$(ls "$LOCALAPPDATA/Android/Sdk/build-tools/"*/aapt2.exe | tail -1)
"$AAPT" dump resources <apk> | grep -E "drawable/notification_icon|color/notification_icon_color"
"$AAPT" dump xmltree --file AndroidManifest.xml <apk> | grep -A1 default_notification
```
→ 매니페스트 meta-data 의 `@0x…` 와 위 resource id 가 같아야 한다.
**그래도 최종 판정은 알림을 터뜨려 눈으로 본다.**

### 테스트 데이터는 sqlite3 로 심는다 (UI 로 만들면 오래 걸린다)

AsyncStorage 는 `databases/RKStorage` 의 `catalystLocalStorage(key,value)` 다.
**여러 날에 걸친 날짜**를 넣어야 스트릭·히트맵이 살아나고, 그래야 백업 검증이 의미가 있다.

```bash
"$ADB" -s "$S" shell am force-stop com.myword.front       # 앱이 덮어쓰지 않게 먼저 멈춘다
"$ADB" -s "$S" push seed.sql /data/local/tmp/seed.sql
"$ADB" -s "$S" shell "sqlite3 /data/data/com.myword.front/databases/RKStorage < /data/local/tmp/seed.sql"
```

### 백업 파일은 공유 시트 **전에** 캐시에 쓰인다 — 실물을 읽을 수 있다

```bash
"$ADB" -s "$S" shell "ls -la /data/data/com.myword.front/cache/*.json"
"$ADB" -s "$S" shell "cat /data/data/com.myword.front/cache/myword-backup-*.json" > backup.json
```
복원 테스트는 이 파일을 `/sdcard/Download/` 로 push 하면 문서 선택기에 바로 뜬다.
🔴 **금지 키가 안 담겼는지 여기서 본다** — `ad_free`(결제 우회) · `myword_device_id`(자격증명).

하나라도 어긋나면 `android/app/proguard-rules.pro` 에 keep 을 **좁게** 추가한다.
🚫 `com.facebook.react.**` 통째 keep 금지 — 난독화율이 바닥이 되어 R8 을 켠 의미가 사라진다.
