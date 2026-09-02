---
name: reload-docs
description: My Word 의 문서 전체(`docs/` + `.claude/SKILL.md` + `.agents/` + 공용 `C:\project\common`)를 한 번에 다시 읽어 컨텍스트를 복원한다. `/compact` 직후 1순위 — 요약은 수치·계약·네이티브 설정의 세부를 버린다. "문서 다시 읽어" · "reload docs" · "컴팩트했어" 로도 부른다. **버전·게시 상태·에뮬레이터 점유처럼 세션 중에 상하는 값을 말하기 직전**에도 §3 만 다시 본다.
---

# reload-docs (My Word 판)

> **왜·무엇을·어떻게의 일반론은 공용 스킬에 있다** —
> `C:\project\common\.claude\skills\reload-docs\SKILL.md`
> (docs-first 원칙 · 추측 금지 조약 · 버그 발견 시 사각 분석 3종 문서).
> 이 문서는 **My Word 에서 실제로 어디를 읽어야 하는지와, 여기서만 통하는 예외**를 적는다.

## 1. 읽는 순서

```bash
# ① 척추 — 자동 주입되지만 결정 직전이면 한 번 더 짚는다
CLAUDE.md                       # 네이티브 수동 동기화 표 · R8 · OTA 절
.claude/SKILL.md                # 842줄 코딩 규칙 본문 (아래 🔴 참조)

# ② 프로젝트 문서 — 🔴 .md 글롭만 쓰면 법무 문서를 통째로 놓친다
docs/*.md                       # architecture · data-model · screens · services-api
                                # test-cases · CHANGELOG · DISTRIBUTION_POLICY · I18N_PLAN
docs/*.html                     # privacy-policy · terms-of-service ← 게시 중인 정본
README.md  test-report.md

# ③ 역할 지침 — CLAUDE.md §2 가 가리키는 실체
.agents/*.md                    # 12개 (pm · planner · developer · reviewer · tester …)

# ④ ★ 공용 기준 문서 — 프로젝트 불문 항상 (12개)
C:/project/common/*.md
```

읽을 땐 5~6개씩 묶어 병렬로. 목록과 대조해 누락 0건인지 확인한다.

## 2. 🔴 My Word 고유 함정 — 공용 규칙이 여기선 틀린다

**① `.claude/SKILL.md` 를 제외하면 안 된다.**
공용 스킬은 *"`.claude/` 는 도구 정의라 지식 재적재 대상이 아니다"* 라고 한다. 이 프로젝트는 예외다 —
`.claude/SKILL.md` 는 프론트매터 없는 **842줄짜리 코딩 규칙 본문**이고, `CLAUDE.md` 마지막 줄이
*"상세 가이드: `.claude/SKILL.md` 참조"* 로 직접 가리킨다. 스킬이 아니라 문서다. 반드시 읽는다.
(`.claude/skills/*/SKILL.md` 와 `.claude/commands/*.md` 는 진짜 도구 정의이므로 제외.
`.claude/input/SKILL.md` 는 **0바이트 빈 파일** — 무시한다.)

**② `docs/**/*.md` 글롭은 법무 문서를 놓친다.**
`privacy-policy.html` · `terms-of-service.html` 은 `.html` 이라 `.md` 글롭에 안 걸린다.
그런데 이 둘은 **GitHub Pages 로 게시 중이고 Play 콘솔에 URL 이 걸린 정본**이다 —
"사용자에게 무엇을 약속했나"의 유일한 근거다. 개인정보·수집항목·보관기간 이야기가 나오면 **반드시** 연다.

**③ `android/` 는 git 에 없다.**
네이티브 설정(서명 · `versionCode` · `runtimeVersion` · R8 플래그 · ProGuard 룰)은 **문서에만 있고
레포에는 없다.** 컴팩트 후 "`expo prebuild` 한 번 돌리면 되겠네"로 흐르기 쉬운데 **그 순간 다 날아간다.**
`CLAUDE.md` 의 동기화 표는 *무엇이 맞아야 하는지*만 말한다. *실제로 맞는지*는 파일을 봐야 안다:

```bash
android/app/build.gradle                          # versionCode · versionName
android/app/src/main/res/values/strings.xml       # expo_runtime_version
android/gradle.properties                         # android.enableMinifyInReleaseBuilds
android/app/proguard-rules.pro                    # expo.modules.** keep
```

## 3. ★ 세션 중에 상하는 값 — 말하기 직전에 다시 본다 (기억 금지)

컴팩트 여부와 무관하다. **세션 초반의 사실이 굳어서 낡은 채로 보고되는 것**이 진짜 실패 원인이다.

| 무엇 | 근거 파일 | 왜 상하나 |
|---|---|---|
| **앱 버전 / OTA 런타임** | `app.json` + 위 네이티브 3파일 | 손 동기화라 한쪽만 올라가 있을 수 있다 |
| **게시·심사 상태** | Play 콘솔 (문서 아님) · `common/CLOSED_TESTING.md` §0 | 심사는 세션 중에 통과된다 |
| **에뮬레이터 점유** | `common/.emulator-claims/*.lock` + `adb devices` | **다른 프로젝트가 세션 중에 잡고 놓는다.** 파일은 약속이고 `adb` 가 진실이다 |
| 사업자·법적 상호 | `common/BUSINESS_INFO.md` | 기억으로 쓰면 상호를 틀린다 |

🔴 **"남은 것" · "다음 할 일" 같은 표를 쓸 때 자가 점검한다** — 각 줄이 *방금 읽은 파일*에서 나왔나,
아니면 *세션 초반 기억*에서 나왔나? 후자면 그 줄의 근거 파일을 그 자리에서 열고 쓴다.

## 4. 🔴 재적재 때 **기계로 대조하는 두 줄** — 첫 실행에서 둘 다 걸렸다

문서는 "읽었다"로 안 닫힌다. 아래 둘은 **명령 한 줄로 늙었는지 검출된다.** 재적재 때마다 돌린다.

```bash
# ① CHANGELOG 최신 항목 vs 실제 배포 버전
grep -m1 "^## \[" docs/CHANGELOG.md
python -c "import io,json;print(json.load(io.open('app.json',encoding='utf-8'))['expo']['version'])"

# ② 오픈소스 고지 vs 의존성 — 아래가 더 최근이면 고지는 이미 거짓이다
git log -1 --format=%ad --date=short -- docs/open-source-licenses.html
git log -1 --format=%ad --date=short -- package.json
```

**2026-09-02 첫 실행 결과 — 둘 다 낡아 있었다**(그날 고쳤다):

| | 문서가 말한 것 | 실제 | 결과 |
|---|---|---|---|
| CHANGELOG | 최신 `[1.3.1] - 2026-08-18` | **1.3.3 (vc19)** | 1.3.2·1.3.3 **두 릴리스가 통째로 비어 있었다** |
| 오픈소스 고지 | 162개 (2026-08-18 생성) | **176개** | `expo-updates`·`expo-secure-store`·`expo-crypto` 등 **14개 누락** |

🔴 **②가 더 무겁다.** MIT·Apache-2.0 은 *"저작권 고지를 배포물에 포함할 것"* 을 **조건**으로 달고,
그 고지는 앱에서 링크되어 **게시돼 있다** — 즉 **고지의 거짓은 라이선스 위반**이다
(`common/GAME_ASSET_SOURCING.md` §3.3). 생성기(`scripts/generate-oss-licenses.js`)는 있지만
**드리프트 가드가 없어서**, "다시 돌려야 한다"를 기억하는 사람이 유일한 방어선이다.

⚠ **재생성만으로는 안 닫힌다 — 커밋·푸시해야 게시본이 바뀐다.** GitHub Pages 가 서빙하는 것은 `main` 이다.

## 5. 읽고 난 뒤

- **장황한 요약 금지.** "문서 N개 재적재 완료" + 직전 작업 맥락 한 줄이면 된다.
- 곧바로 중단됐던 작업으로 복귀한다. 재적재한 내용을 근거로 판단하고 다시 Read 하지 않는다.
- 문서와 코드가 어긋나면 **코드가 진실**이다 — 문서는 작성 시점 스냅샷이다. 어긋난 걸 발견하면
  덮어쓰지 말고 먼저 짚는다.
