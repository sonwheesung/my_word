# My Word - 데이터 모델

> 2026-09-18 코드에서 다시 뽑았다(앱 1.7.0). 그 전 판은 저장 키 4개만 적혀 있었다.
> 🔴 **운영 중인 앱이라 키는 더하기만 한다.** 기존 키 이름 · 형식 · CSV 포맷은 바꾸지 않는다(되돌릴 수 없다).
> 새 키를 만들면 이 문서에 같은 커밋에서 적는다. `npm run check:docs` 가 코드의 키 목록과 대조한다.

## 개요

학습 데이터는 전부 기기 안(AsyncStorage, 웹은 localStorage)에 JSON 으로 있다. 서버에 올리지 않는다.
자격증명 둘만 SecureStore 에 둔다.

## 저장 키 (AsyncStorage)

| 키 | 상수 · 위치 | 값 | 백업 | 용도 |
|----|------|------|:--:|------|
| `@my_word_categories` | `CATEGORIES_KEY` · storage.ts | `Category[]` | ✅ | 카테고리 |
| `@my_word_words` | `WORDS_KEY` · storage.ts | `Word[]` | ✅ | 단어 |
| `@my_word_quiz_results` | `QUIZ_RESULTS_KEY` · storage.ts | `StoredQuizResult[]` | ✅ | 퀴즈 이력. **모든 통계 · 연속 학습 · 복습 만기의 원천** |
| `@my_word_next_id` | `NEXT_ID_KEY` · storage.ts | 정수 문자열 | ✅ | 전역 ID 카운터 |
| `@my_word_theme` | `THEME_KEY` · appConfig.ts | 테마 id | ✅ 설정 | 색상 테마(indigo · mint · rose · orange · sky · dark) |
| `@my_word_language` | `LANGUAGE_KEY` · appConfig.ts | `ko` · `en` · `ja` | ✅ 설정 | 앱 언어. 없으면 기기 언어 |
| `@my_word_read_notices` | `NOTICE_READ_KEY` · appConfig.ts | `string[]` | ✅ 설정 | 읽은 공지 id. 서버에 없는 id 는 저장할 때 정리 |
| `@my_word_notify_enabled` | `NOTIFY_ENABLED_KEY` · appConfig.ts | `'true'` · `'false'` | ✅ 설정 | 학습 알림 켜짐 |
| `@my_word_notify_time` | `NOTIFY_TIME_KEY` · appConfig.ts | `"HH:mm"` (기본 `20:00`) | ✅ 설정 | 알림 시각 |
| `@my_word_notify_prompted` | `NOTIFY_PROMPTED_KEY` · appConfig.ts | `'true'` | ✅ 설정 | 알림 권유를 이미 띄웠나 |
| `@my_word_skipped_version` | `VERSION_SKIP_KEY` · appConfig.ts | 버전 문자열 | | 건너뛴 업데이트 안내 |
| `@my_word_ad_free` | `AD_FREE_KEY` · appConfig.ts | `'1'` · `'0'` | 🚫 | 광고 제거 구매 **캐시**. 진실은 Play 구매 이력 |
| `@my_word_srs` | `SRS_KEY` · appConfig.ts | `SrsStore` JSON, 비우면 `''` | 🚫 | 복습 만기 캐시(파생값) |
| `@my_word_flashcard_prefs` | `FLASHCARD_PREFS_KEY` · appConfig.ts | `FlashcardPrefs` JSON | 🚫 | 이 기기의 카드 보기 취향 |

**SecureStore** (키 이름만 적는다. 값은 자격증명이다)

| 키 | 용도 |
|---|---|
| `myword_device_id` | 문의를 이 기기에 귀속시키는 무작위 UUID. 최초 실행 때 한 번 만든다 |
| `cs_session_myword` | 공통 서버 SDK 의 세션 토큰(`cs_session_${appCode}`) |

🔴 둘 다 AsyncStorage 로 옮기지 않는다. 웹에서는 저장하지 않고 세션을 메모리에만 둔다.

## 엔티티

### Category

| 필드 | 타입 | 필수 | 설명 |
|------|------|:--:|------|
| `categoryId` | `number` | O | 전역 카운터에서 |
| `categoryName` | `string` | O | 중복 불가(정규화 비교: trim · 소문자 · NFC) |
| `description` | `string` | | 설명 |
| `displayOrder` | `number` | O | 정렬 순서. 만들 때 기본 `개수 + 1` |
| `wordCount` | `number` | | **저장하지 않는다.** 조회할 때 붙인다 |
| `createdAt` · `updatedAt` | `string` | O | ISO 8601 |

### Word

| 필드 | 타입 | 필수 | 설명 |
|------|------|:--:|------|
| `wordId` | `number` | O | 전역 카운터에서 |
| `categoryId` | `number` | O | 소속 카테고리 |
| `word` | `string` | O | 단어(소문자로 바꾸지 않는다) |
| `meanings` | `string[]` | O | 최대 10개 |
| `examples` | `WordExample[]` | O | 최대 5개. 만들 때 기본 `[]` |
| `tags` | `string[]` | | 최대 10개. 만들 때 기본 `[]` |
| `memo` | `string` | | 최대 500자. 만들 때 기본 `''` |
| `createdAt` · `updatedAt` | `string` | O | ISO 8601. `createdAt` 은 연속 학습의 활동일로도 쓴다 |

`WordExample` = `{ example: string; translation?: string }`

### StoredQuizResult

| 필드 | 타입 | 필수 | 설명 |
|------|------|:--:|------|
| `resultId` | `number` | O | 전역 카운터에서 |
| `wordId` | `number` | O | 단어를 지워도 결과는 남는다(아래) |
| `isCorrect` | `boolean` | O | |
| `quizType` | `string` | O | `word_to_meaning` · `meaning_to_word` · `example_to_meaning` · `translation_to_example` |
| `answerType` | `string` | | `subjective` · `multiple_choice` (객관식이 생긴 뒤부터 기록) |
| `word` · `correctAnswer` · `userAnswer` | `string` | | 출제 문장 · 정답 · 내 답 |
| `takenAt` | `string` | O | ISO 8601. **한 판의 결과는 모두 같은 값** |

저장은 한 판이 끝났을 때 기존 배열 뒤에 이어 붙인다. 🔴 **플래시카드는 이 키를 쓰지 않는다**(CLAUDE.md 플래시카드 절).

### SrsStore (`@my_word_srs`)

```ts
{ v: 1, builtFrom: number, cards: { "<wordId>": { s, d, reps, lapses, last: "YYYY-MM-DD", due: "YYYY-MM-DD" } } }
```

| 필드 | 뜻 |
|---|---|
| `builtFrom` | 이 저장본을 만들 때 쓴 퀴즈 결과 **개수**. 결과 개수와 다르면 통째로 다시 만든다 |
| `s` · `d` | 안정도(일, 0.01~3650) · 난이도(1~10). FSRS-5 기본 가중치, 채점 2단계(오답 1 · 정답 3), 목표 유지율 0.9 |
| `reps` · `lapses` | 복습 횟수 · 잊은 횟수 |
| `due` | 다음 복습일 = 푼 날 + 간격(최소 1일) |

- 한 번도 안 푼 단어는 `cards` 에 없고, 복습 대상에는 들어간다
- 증분 반영은 `builtFrom + 이번 답 수 === 결과 수` 일 때만 한다. 아니면 저장본을 버리고 재생한다(이중 반영 방지 · CLAUDE.md 1.6.0 절)

### FlashcardPrefs (`@my_word_flashcard_prefs`)

`{ order: 'created' | 'shuffle' | 'due', frontIsWord: boolean, autoSpeak: boolean, lastCategoryId: number | null }`
어떤 값이 와도 throw 하지 않고, 이상한 값은 기본값(`created` · `true` · `false` · `null`)으로 돌린다.

## 관계와 삭제

```
Category (1) ── (N) Word (1) ── (N) StoredQuizResult
```

| 지우는 것 | 함께 지워지는 것 | 남는 것 |
|---|---|---|
| 카테고리 | 그 카테고리의 단어 | 퀴즈 결과 |
| 단어 | 없음 | 퀴즈 결과(고아) |

고아 결과는 전체 통계 · 취약 단어 · 단어별 통계(`(삭제된 단어)`) · 연속 학습에 들어가고,
카테고리별 통계와 복습 만기에서는 빠진다. 백업 복원은 고아 결과도 그대로 옮긴다.

## ID 생성

- 카운터 하나(`@my_word_next_id`)를 카테고리 · 단어 · 결과가 같이 쓴다. 읽기 → +1 → 저장
- 백업을 만들거나 읽을 때 `repairNextId` 가 `max(nextId, 최대 wordId, 최대 resultId)` 로 끌어올린다(id 충돌 방지).
  ⚠ categoryId 는 이 계산에 들어가지 않는다

## 백업 파일

| 항목 | 값 |
|---|---|
| 파일 이름 | `myword-backup-YYYY-MM-DD.json` (복원 직전 안전 사본은 `myword-before-restore.json`) |
| `schemaVersion` | 1. 더 큰 값은 `newer-schema` 로 거부 |
| 담는 것 | `BACKUP_KEYS` 4개(카테고리 · 단어 · 결과 · 카운터) + `settings`(테마 · 언어 · 읽은 공지 · 알림 3키) + `appVersion` · `exportedAt` |
| 🚫 담지 않는 것 | `@my_word_ad_free`(결제 우회 경로가 된다) · SecureStore 키(자격증명) · `@my_word_srs`(파생값) · `@my_word_flashcard_prefs`(기기별 취향) · `@my_word_skipped_version` |
| 복원 방식 | **병합하지 않고 교체.** 두 기기의 활동일을 합치면 하지 않은 연속 학습이 생긴다. 날짜는 원본 그대로. 복원 뒤 SRS 저장본을 비워 재생시킨다 |

## 파생 데이터 (저장하지 않고 매번 계산)

| 데이터 | 계산 | 쓰는 곳 |
|--------|------|--------|
| `wordCount` | 카테고리별 단어 수 | 카테고리 목록 |
| 정답률 | `정답 / 전체 × 100` (퀴즈 0건이면 0) | 홈 · 통계 |
| 취약 단어 | 단어별 정답률 50% 미만(코드에 숫자 50으로 있다) | 퀴즈 `weak` · 통계 |
| 연속 학습 | 단어 등록일 또는 퀴즈일이 있는 날(로컬 날짜). 오늘이 아니면 어제부터 거꾸로 센다 | 홈 · 마이 |
| 일별 활동 | 그날 추가한 단어 수 + 그날 퀴즈 결과 수 | 마이 히트맵 |
| 복습 만기 | 위 SrsStore | 홈 배너 · 카테고리 뱃지 · 복습 모드 · 알림 문구 |
