# My Word - 데이터 모델

> 2026-09-18 코드에서 다시 뽑았다(앱 1.7.0). 그 전 판은 저장 키 4개만 적혀 있었다.
> 🔴 **운영 중인 앱이라 키는 더하기만 한다.** 기존 키 이름 · 형식 · CSV 포맷은 바꾸지 않는다(되돌릴 수 없다).
> 새 키를 만들면 이 문서에 같은 커밋에서 적는다. `npm run check:docs` 가 코드의 키 목록과 대조한다.

## 개요

학습 기록은 기기 안(AsyncStorage, 웹은 localStorage)에 JSON 으로 있다. 자격증명 둘만 SecureStore 에 둔다.
**단어의 정본은 기기 SQLite** 다(아래 전용 절).

🔴 **「서버에 올리지 않는다」는 2026-10-07 에 깨졌다.** 단어와 그 뜻은 `syncService` 가 공통 서버로
**밀고**(단방향 · 당기기 없음), AI 단어 시험을 쓰면 문제 생성을 위해 국외(OpenAI)로도 간다.
**나가지 않는 것**은 카테고리 · 퀴즈 기록 · SRS · 설정 · 메모 · 예문 · 태그다.
사용자에게 알리는 정본은 `docs/privacy-policy.html` 제5-2·5-3항이다.

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
| `@my_word_exams` | `EXAMS_KEY` · appConfig.ts | `ExamRecord[]` JSON (최근 20판) | ✅ | AI 시험 기록(문제 · 내 답 · 점수) |
| `@my_word_exam_prefs` | `EXAM_PREFS_KEY` · appConfig.ts | `ExamPrefs` JSON | 🚫 | 카테고리별로 고른 **단어의 언어** |
| `@my_word_quiz_prefs` | `QUIZ_PREFS_KEY` · appConfig.ts | `QuizPrefs` JSON | 🚫 | 지난 퀴즈 설정(카테고리 · 모드 · 방향 · 답변 · 문제 수) |
| `@my_word_sync_state` | `SYNC_STATE_KEY` · appConfig.ts | `SyncState` JSON | 🚫 | 단어를 어디까지 밀었나(기기별 진행 상태) |

`QuizPrefs` = `{ categoryId, mode, direction, answerType, wordCount }` (2026-10-08 시안 #8)
🔴 **예전에는 일부러 기억하지 않았다** — `screens.md` §6 이 *"지난 선택은 기억하지 않는다"* 로
적고 있었다. 「지난 설정 그대로」 카드가 그 결정을 뒤집었다.
⚠ **읽을 때 모르는 값은 통째로 버린다**(`parseQuizPrefs` → `null`). `mode` 에 없는 모드가 들어오면
`QuizScreen` 의 분기를 전부 빠져나가 **문제가 0개인 퀴즈**가 된다.
⚠ 저장은 `시작` 을 누를 때 한 번. 카드는 **그때 저장된 것**을 보여주고 아래 선택지는 늘 기본값이다 —
묶으면 아래를 한 칸 바꿨을 때 카드가 거짓말이 된다.

`SyncState` = `{ lastUpdatedAt, lastSyncedAt, serverTotal, rewoundFor }`
🔴 **`serverTotal` 은 진단용이 아니다** — 내 단어 수보다 작으면 서버가 행을 잃은 것이라 장부를
`null` 로 되감아 전부 다시 민다. `rewoundFor` 는 같은 숫자로 두 번 되감지 않기 위한 표식이다
(없으면 서버가 끝내 다 못 받는 상태에서 **부팅마다 전부 다시 민다**). 자세한 것은 `services-api.md`.

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


### ExamRecord (`@my_word_exams`)

AI 시험 한 판. **문제 본문을 그대로 담는다** — 재시험과 성적표가 읽어야 하고, 서버에 다시 묻는 것은
돈이 들며 구독을 끊으면 물을 수도 없다.

| 필드 | 뜻 |
|---|---|
| `examId` | 서버가 준 시험 id. 없으면 `local-<시각>` |
| `language` | 시험 대상 언어(`ja` 등) |
| `takenAt` | ISO. 최신순 정렬의 축 |
| `questions` | `ExamQuestion[]` — 본문 · 보기 4개 · 정답 번호 · 뜻 · 해설. **회차 밖에 있다** |
| `attempts` | `ExamAttempt[]` — 회차 목록. **1회차가 `[0]`** 이고 뒤로 쌓인다 |

`ExamAttempt` = `{ answers: (number \| null)[], score, takenAt }`
(`null` 은 넘긴 문제 · `score` 는 `correct` · `wrong` · `skipped` · `total` · `accuracy`)

- 🔴 **통계에 들어가는 것은 1회차뿐이다.** 같은 문제를 다시 풀면 외워서 맞히므로 정답률이 조용히 부푼다.
  ✅ 실기기에서 재시험 뒤 `quiz_results` 49건 불변 · `@my_word_srs` md5 동일을 확인했다(2026-10-07)
- ⚠ **옛 기록은 `answers`·`score` 를 기록에 직접 들고 있었다.** `parseAttempts` 가 읽을 때 1회차로 옮긴다 —
  저장본을 고치는 마이그레이션을 돌리지 않는다(운영 중인 앱이라 저장본을 건드리는 쪽이 늘 더 위험하다)
- ⚠ **저장된 점수가 유한수가 아니면 버리고 다시 센다**(`usableScore`). 실기기가 `Best NaN%` 를 보여 줘서
  생겼다 — 모양이 객체인 것과 값이 쓸 만한 것은 다른 명제다

- 🔴 **최근 20판(`EXAM_HISTORY_MAX`)만 남긴다.** 무제한이면 백업이 커져 복원이 실패할 수 있다
- 🔴 **정답 번호를 기기가 갖는다.** 숨기면 채점마다 서버를 불러야 하고 그러면 구독을 끊은 사람이
  재시험조차 못 치고 오프라인에서 이어 풀 수도 없다. 잃는 것은 *"앱을 뜯으면 정답을 알 수 있다"* 인데
  그건 자기 학습을 자기가 망치는 것이라 막을 가치가 없다
- ⚠ `questions[].meaning` · `explanation` 은 **`null` 일 수 있다** — 그 언어로 아직 만들어지지 않은 문제다
- 🔴 **백업에 담지만 `schemaVersion` 을 올리지 않았다.** 올리면 1.7.0 사용자가 새 백업을 `newer-schema`
  로 거부한다. 옵셔널 필드를 더하는 것이라 양방향으로 안전하다(`__tests__/backupService.test.ts` 가 지킨다)

### ExamPrefs (`@my_word_exam_prefs`)

```
languageByCategory   { "<categoryId>": "ja" | "en" | "ko" | "zh" }
lastCategoryId       마지막에 고른 카테고리
```

🔴 **`BACKUP_KEYS` 에 일부러 넣지 않았다.** 학습 기록이 아니라 이 기기에서의 선택이고,
백업에 담으면 복원한 기기의 설정이 조용히 바뀐다(`FlashcardPrefs` 와 같은 판단).

⚠ **모르는 언어 코드는 읽을 때 버린다.** 서버가 모르는 코드를 받으면 400 이므로,
저장본이 오염돼도 그 값이 요청까지 흘러가지 않게 한다.

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

---

## 🔴 로컬 SQLite — 단어의 정본 (2026-10-07 전환)

단어 저장이 **AsyncStorage(JSON 한 덩어리) → 기기 SQLite** 로 옮겨졌다.
구조는 `mission` 에서 승계했다(그쪽은 Re:Read 에서 승계).

```
src/db/schema.ts            표 5개 · Expand-only · 순수(expo 를 모른다)
src/db/migrate.ts           러너 · SqlDriver · 다운그레이드 거부
src/db/importFromLegacy.ts  AsyncStorage → SQLite 이사
src/db/repo.ts              읽기·쓰기. storage.ts 와 시그니처가 같다
src/db/index.ts             expo-sqlite 연결(여기만 안다) · 부팅
```

파일: `files/SQLite/myword.db` (⚠ `databases/` 가 아니다 — 거긴 AsyncStorage 의 RKStorage 다)

| 표 | 담는 것 |
|---|---|
| `categories` | 카테고리 |
| `words` | 단어. 뜻·예문·태그는 JSON 문자열 |
| `quiz_results` | 퀴즈 결과 |
| `exams` | AI 시험 기록 (+ `category_id` · v2, + `attempts` · v3) |
| `meta` | `schema_version` · `legacy_imported_at` |

**v3 (2026-10-07)**: `exams.attempts` 추가(회차 JSON). 🔴 **실기기가 `Best NaN%` 를 띄워서 잡혔다** —
`ExamRecord` 를 회차 구조로 바꾼 뒤에도 `examRepo.save` 가 옛 칸(`answers`·`score`)에만 쓰고 있었고,
읽을 때 빈 값이 점수로 들어가 NaN 이 됐다. **타입 체크도 테스트 447개도 통과한 채였다** —
칸이 모자란 것은 타입이 못 보고, 저장소를 거치지 않는 테스트도 못 본다.

**v2 (2026-10-07)**: `exams.category_id` 추가. 🔴 **V1 을 고치지 않고 덧붙였다** —
이미 v1 을 지나간 기기가 있고(그날 에뮬레이터가 그랬다) V1 을 고치면 그 기기는 변경을 영원히 못 받는다.
단어 담기가 이 값을 쓴다(담을 단어장이 어디인지). 옛 기록에는 없으므로 NULL 을 허용한다.
✅ 실기기에서 v1 → v2 올라가는 것과 옛 행이 사는 것을 확인했다.

### 🔴 이사가 지키는 것 넷

1. **옛 데이터를 지우지 않는다.** `@my_word_*` 는 이사 뒤에도 그대로다 — 되돌릴 길
2. **멱등이다.** 부팅마다 불러도 안전하다(표식이 있으면 건너뛴다)
3. **`wordId` 를 새로 매기지 않는다.** `quiz_results.word_id` 와 `@my_word_srs` 가 참조한다 —
   다시 매기면 **정답률이 엉뚱한 단어에 붙고 오류는 안 난다**
4. **한 트랜잭션이다.** 반쯤 옮겨진 상태로 끝나지 않는다. 표식은 맨 마지막에 찍는다

실패하면 던지고, `db/index.ts` 가 받아 **옛 저장소로 계속 돈다.** 이사 실패로 앱을 못 쓰게 만들지 않는다.

✅ **실기기 검증 (2026-10-07 · AVD `my_word`)**: 단어 15개가 든 기기에 덮어 설치 →
`wordId` **101~115 그대로** · 퀴즈 결과가 가리키는 단어 일치 · 뜻 보존 ·
홈 숫자가 이사 전과 **완전히 동일**(15 단어 · 78% · 복습 15) · 옛 저장소 2498B 그대로.

### ⚠ 아직 두 벌이다

`utils/storage.ts` 는 `getDb()` 가 `null` 이면 **옛 구현**을 쓴다. `null` 이 되는 경우는
웹(Puppeteer 검증 전용이라 SQLite 를 안 켠다)과 DB 를 못 연 사고다.
동기화까지 끝나고 한 릴리스가 조용히 지나가면 옛 쪽을 지운다.

🔴 `@my_word_next_id` 는 **그대로 AsyncStorage 에 있다.** 백업의 `repairNextId` 가 그 값을 고쳐
주는 구조라 옮기면 그쪽이 같이 흔들린다.

### 🔴 되돌릴 수 없는 릴리스다

이사 뒤 새 단어는 SQLite 에만 들어간다. 옛 키는 **이사 시점 스냅샷으로 멈춘다.**
그래서 이 버전보다 낮은 버전으로 되돌리면 그 뒤에 추가한 단어가 안 보인다.
네이티브 모듈(`expo-sqlite`)이 늘었으므로 **OTA 로도 못 나간다** — 스토어 빌드이고
`runtimeVersion` 을 1.6.0 → **1.8.0** 으로 올렸다(`app.json` · `strings.xml` 양쪽).
