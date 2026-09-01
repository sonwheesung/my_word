---
name: i18n-layout-audit
description: My Word 의 영어 번역이 길어져 화면이 깨지는지 잡는다 — 라벨 잘림(`…`) · 단어 중간 절단 · 컨테이너 밖으로 넘침 · 두 텍스트가 들러붙음. 번역 *누락*이 아니라 *길이*가 원인이라 타입체크로 안 잡히고 **영어로 화면을 봐야만** 보인다. 영어 문구를 추가·수정했을 때 · 새 화면을 만들었을 때 · 출시 전 순회 때 부른다. 사용자가 "영어로 하면 글자가 잘려요"·"레이아웃이 깨져요" 라고 할 때도.
---

# i18n-layout-audit (My Word 판)

> **패턴 카탈로그(원인 8가지)와 검사 방법은 공용 스킬에 있다** —
> `C:\project\common\.claude\skills\i18n-layout-audit\SKILL.md`.
> 여기에는 **My Word 의 구조와 위험 지대**만 적는다.

## 이 앱의 i18n 구조

| | |
|---|---|
| 언어 | **한국어(원문) · 영어** 둘뿐 |
| 키 | **한국어 원문이 곧 키**다 — `t('문의하기')`. 문구를 고치면 **키가 바뀌므로** `en.json` 도 같이 고쳐야 한다 |
| 번역 파일 | `src/i18n/locales/en.json` |
| 화면 | `src/screens/*.tsx` · `src/components/*.tsx` |

🔴 **한국어 문구를 수정하면 영어 번역이 조용히 사라진다.** 키가 바뀌어 폴백이 돌면
영어 화면에 **한국어가 그대로** 나온다. 문구 수정 = `en.json` 키 수정이 세트다.

## 스캔 (경로가 공용 문서와 다르다)

```bash
# 고정 폭 라벨 — 영어가 길어 잘릴 후보
grep -rnE "width: [0-9]{2}" --include=*.tsx src/screens/ src/components/

# 굵은글씨 뒤 이어붙임
grep -rnoE "\}</Text>\{t\('.{0,30}" --include=*.tsx src/screens/ src/components/

# flexWrap 없는 행(칩·버튼이 화면 밖으로)
grep -rnE "flexDirection: 'row'" --include=*.tsx src/screens/ src/components/

```

### 키 누락 검사 — 스크립트로 돈다

```bash
PYTHONIOENCODING=utf-8 python .claude/skills/i18n-layout-audit/scripts/check-keys.py
```

폴백이 돌면 **영어 화면에 한국어가 그대로** 나오므로, 문구를 고칠 때마다 돌린다.
2026-09-01 첫 실행에서 `카테고리 이름`(`CategoryManageScreen.tsx:300`) 1건을 잡았다 —
라벨에서 `*` 를 뗀 뒤 `en.json` 키가 `"카테고리 이름 *"` 로 남아 폴백이 돌고 있었다.

🔴 **직접 한 줄로 짜지 말 것.** 이 검사를 손으로 짜면 세 가지에 걸린다(전부 실제로 당함):

| 함정 | 증상 |
|---|---|
| `grep "t\('...'\)"` | `split('-')`·`at('T')` 같은 **다른 함수가 걸린다**(오탐 12건) |
| `/tmp` 에 중간 파일 | 다른 프로젝트 세션과 **공유되는 자리**라 남의 키가 섞인다(실제로 `subscribe.*` 34건이 섞였다) |
| `.decode('unicode_escape')` | UTF-8 바이트를 Latin-1 로 읽어 **한글이 전부 깨진다** → 234건 전량 누락으로 오판 |

## 위험 지대 — 영어로 반드시 볼 곳

영어가 한국어보다 **1.5~2배 길어지는** 자리들이다.

| 화면 | 자리 | 왜 |
|---|---|---|
| **문의하기** | 상단 고지 박스 | 가장 긴 문장. 영어가 3줄을 넘기면 입력창이 밀린다 |
| 문의하기 | 분류 칩 4개 (오류/건의/질문/기타 → Bug/Suggestion/Question/Other) | 한 줄 4칸 고정. `Suggestion` 이 가장 길다 |
| **홈** | 하단 4버튼 (단어장·카테고리·통계·마이) | 좁은 칸에 한 단어. `Categories` · `Statistics` 가 위험 |
| 홈 | 상단 2카드 부제 (`퀴즈로 단어 복습` 등) | 2줄 넘으면 카드 높이가 어긋난다 |
| 설정 | 항목 부제 | `앱 개선 의견을 보낼 수 있어요` → `Send feedback to help improve the app` |
| 퀴즈 | 보기 버튼 | 단어 자체는 사용자 데이터라 번역 무관. **라벨만** 본다 |
| 통계 | 지표 라벨 | 숫자 옆 좁은 칸 |

## ⚠ 지금 미확인 상태인 것 (2026-09-01)

키 누락은 0건으로 닫혔다(위 스크립트). **남은 것은 레이아웃이다** —
문의 관련 영어 문구 2건을 바꿨는데 **영어 화면으로 본 적이 없다**:

```
"Your inquiry is submitted using a random identifier created on this device.
 We don't send personal details such as your name or email — only your app version
 and device type. Reply viewing is coming soon."
"Send feedback to help improve the app"
```

첫 번째가 특히 길다. **설정 → English 로 바꾼 뒤 문의 화면을 확인해야 한다.**
([[project-android-emulator-headless]] 절차로 에뮬레이터에서)

## 끝나면

- 폭을 고쳤으면 주석에 남긴다: "영어 최장 단어가 이보다 길면 여기도 같이 올린다."
- 🔴 **"영어 확인함"을 실측 범위 넘겨 적지 말 것** — 본 화면만 본 것이다.
