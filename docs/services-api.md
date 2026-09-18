# My Word - 서비스 레이어 API 명세

> 2026-09-18 코드에서 다시 뽑았다(앱 1.7.0). 그 전 판은 서비스 4개만 적혀 있었다.
> `src/services/` 에 파일을 더하면 이 문서도 같은 커밋에서 고친다. `npm run check:docs` 가 파일 목록을 대조한다.
> 타입의 전체 필드는 코드가 정본이다. 여기에는 화면에서 부르는 모양만 적는다.

```
Screen → Service → utils/storage.ts (AsyncStorage / localStorage)
                 → 외부: dictionaryService.ts (번역 · 사전) · commonServer/ (공통 서버)
```

`fetch` 를 직접 부르는 곳은 `dictionaryService.ts` 와 `commonServer/index.ts` 둘뿐이다. 나머지는 기기 안에서 끝난다.

---

## wordService.ts · categoryService.ts

| 함수 | 반환 | 설명 |
|------|------|------|
| `wordService.getWords(categoryId?)` | `Word[]` | 생략하면 전체 |
| `wordService.getWord(id)` | `Word` | 없으면 throw |
| `wordService.checkDuplicate(word, categoryId, excludeWordId?)` | `Word \| null` | 같은 카테고리 안 정규화 비교. 겹치는 단어를 돌려준다 |
| `wordService.createWord(data)` · `updateWord(id, data)` · `deleteWord(id)` | | 단어만 지운다(퀴즈 결과는 남는다) |
| `categoryService.getCategories()` | `Category[]` | `displayOrder` 순 · `wordCount` 를 붙인다 |
| `categoryService.getCategory(id)` | `Category` | 없으면 throw |
| `categoryService.createCategory(data)` · `updateCategory(id, data)` | `Category` | 이름 중복이면 throw |
| `categoryService.deleteCategory(id)` | | 소속 단어도 지운다 |
| `categoryService.reorderCategories(orders)` | | `{ categoryId, displayOrder }[]` |

## quizService.ts

| 함수 | 반환 | 설명 |
|------|------|------|
| `saveQuizResults(results)` | | 한 판의 결과를 이어 붙인다(모두 같은 `takenAt`) |
| `getWeakWordIds(limit = 20)` | `number[]` | 정답률 50% 미만, 낮은 순 |
| `getStatistics()` | `QuizStatistics` | 전체 퀴즈 수 · 정답 · 오답 · 정답률 · 단어 · 카테고리 · 취약 수 |
| `getWordQuizStats(filterCategoryId?)` | `WordQuizStats[]` | 삭제된 단어는 `(삭제된 단어)` · categoryId 0 |
| `getCategoryQuizStats()` | `CategoryQuizStats[]` | 고아 결과는 건너뛴다 |
| `getMyPageStats()` | `MyPageStats` | 단어 수 · 퀴즈 수 · 연속 학습 · 총 활동일 · 날짜별 활동 |

## srsService.ts (간격 복습)

| 함수 | 반환 | 설명 |
|------|------|------|
| `srsService.getDueSummary(now?)` | `DueSummary` | `{ total, byCategory, nextDue }`. 실패하면 0 |
| `srsService.getDueWordIds(limit, categoryId?, now?)` | `number[]` | 만기 지난 순 → 안 푼 단어(오래된 순) |
| `srsService.recordAnswers(answers, now?)` | | 한 판의 답을 증분 반영. 안전하지 않으면 저장본을 버린다 |
| `srsService.getReminderPlan(days, now?)` | `ReminderDay[]` | 알림용 날짜별 만기 수와 단어 |
| `srsService.invalidate()` | | 저장본을 버린다(⚠ `src/` 안에 부르는 곳이 없다) |

순수 함수(테스트 대상): `buildStore` · `applyAnswer` · `selectDue` · `nextDueKey` · `summarize` · `forecast` · `canApplyIncrementally` · `parseStore`.
간격 계산 자체는 `src/utils/srs.ts`(FSRS-5, `firstReview` · `nextReview` · `intervalDays` · `dueKeyAfter`).

## flashcardService.ts

| 함수 | 반환 | 설명 |
|------|------|------|
| `flashcardService.loadPrefs()` · `savePrefs(prefs)` | `FlashcardPrefs` | 저장 실패는 삼킨다 |
| `flashcardService.getCards(categoryId, order)` | `Word[]` | `due` 순서는 만기를 앞에, 나머지를 등록순으로 뒤에. 만기 조회가 실패하면 등록순 |
| `buildSequence(words, order, dueIds?, rng?)` · `parsePrefs(raw)` · `isCardOrder(v)` | | 순수 함수. `parsePrefs` 는 어떤 입력에도 throw 하지 않는다 |

🔴 이 파일과 플래시카드 화면 둘, `FlipCard` 는 퀴즈 결과를 쓰지 않는다. `__tests__/flashcardService.test.ts` 가 소스를 읽어 지킨다.

## shareService.ts (CSV)

| 함수 | 설명 |
|------|------|
| `exportWordsToCSV(words)` | 헤더 `단어,뜻,예문,태그,메모`. 뜻 · 태그는 `\|`, 예문은 `예문::번역` 을 `\|` 로 |
| `parseCSV(csv)` | 따옴표 안 줄바꿈 지원. 헤더 줄 건너뜀. 예문은 첫 `::` 만 구분자. `{ success, errors: {line, content, reason}[] }` |
| `checkDuplicates(parsed, categoryId)` | 정규화 비교로 `{ newWords, duplicateWords }` |

🔴 CSV 형식은 운영 중이라 바꾸지 않는다.

## backupService.ts · backupFile.ts

| 함수 | 설명 |
|------|------|
| `backupService.create()` | 지금 상태를 `BackupFile` 로. 날짜 · id 는 그대로 |
| `backupService.serialize(backup)` · `parse(text)` | `parse` 는 throw 하지 않고 `invalid-json` · `not-a-backup` · `newer-schema` · `corrupt` 를 돌려준다 |
| `backupService.summarize(backup)` | 확인 시트용 숫자 |
| `backupService.restore(backup)` | 전체 교체. SRS 저장본을 비운다 |
| `backupFile.exportToFile()` | 캐시에 쓰고 공유 시트로 |
| `backupFile.writeSafetyCopy()` | 복원 직전 `myword-before-restore.json` |
| `backupFile.pickAndParse()` | 문서 선택기로 고르고 `parse` 까지 |
| `backupFile.isSupported()` · `buildFileName(date?)` | |

`backupService` 는 네이티브 모듈을 import 하지 않는다(테스트 가능하게). 네이티브는 `backupFile` 에만 있다.

## notificationService.ts (로컬 알림)

어떤 경우에도 reject 하지 않는다. 서버 · FCM 없음.

| 함수 | 설명 |
|------|------|
| `isSupported()` | iOS · Android 만 true |
| `getPermission()` · `requestPermission()` | `granted` · `denied` · `undetermined` |
| `reschedule(time)` | 전부 취소하고 다시 건다(7일치). **만기가 0인 날은 건너뛴다.** 실제로 건 개수를 돌려준다 |
| `cancelAll()` · `scheduledCount()` | |

## noticeService.ts · versionService.ts · supportService.ts

| 함수 | 설명 |
|------|------|
| `noticeService.getReadIds()` | 읽은 공지 id |
| `noticeService.setReadIds(readIds, serverIds)` | 서버에 있는 것만 남겨 저장. 서버로 보내지 않는다 |
| `evaluateGate(boot, skippedVersion)` | 순수 함수. 점검 > 새 버전 안내. `min` 으로 막지 않는다. `boot` 가 null 이면 `none` |
| `isBlocking(decision)` | 점검일 때만 true |
| `versionService.resolveGate(boot)` · `skipVersion(version)` | 건너뛴 버전은 `@my_word_skipped_version` |
| `supportService.sendInquiry(category, content)` | `{ ok: true }` 또는 `{ ok: false, reason }`. 공통 서버 래퍼 |
| `supportService.isConfigured()` | `commonServer.isConfigured()` 를 그대로 돌려준다(문의 화면은 부르지 않는다) |

## dictionaryService.ts (네트워크)

`dictionaryService.lookup(word)` → `{ ok: true, data }` 또는 `{ ok: false, reason: 'not-found' | 'same-language' }`. 네트워크 · HTTP 실패는 throw.

| 엔드포인트 | 용도 |
|---|---|
| `translate.googleapis.com/translate_a/single` (`sl=auto`, `tl=` 앱 언어) | 뜻 · 품사 (`MAX_MEANINGS = 5`) |
| 같은 주소 `sl=en` | 예문 번역 |
| `api.dictionaryapi.dev/api/v2/entries/en/<word>` | 예문 (`MAX_EXAMPLES = 3`). 감지 언어가 영어일 때만 |

## commonServer/ (공통 서버 SDK)

⚠ **복사본이다. 손으로 고치지 않는다.** 원본 `common_server/client/` 에서 다시 복사한다(머리 주석에 날짜 · `SDK_VERSION`).

| 이 앱이 쓰는 것 | 엔드포인트 |
|---|---|
| `fetchBootstrap()` | `GET /api/v1/bootstrap?app=myword` (공지 · 버전 · 점검) |
| `heartbeat()` | `POST /api/v1/heartbeat` (포그라운드마다, 쿨다운 5분) |
| `sendInquiry(category, content)` | `POST /api/v1/tickets` |
| `registerDevice(deviceId)` (`client.ts` 의 `ensureDeviceSession` 이 부른다. 세션이 SecureStore 에서 복원되면 부르지 않아 기기당 사실상 1회) | `POST /api/v1/devices` |
| `localizeAnnouncement(item, lang)` | 공지 언어 고르기(순수) |
| `compareVersions(a, b)` | 버전 비교(순수) |

SDK 에는 로그인 · 권한 · 내 문의 조회도 있지만 이 앱은 쓰지 않는다. 기본 타임아웃 10초, 어떤 실패에도 throw 하지 않는다.

## utils/storage.ts

| 이름 | 설명 |
|------|------|
| `categoryStorage` · `wordStorage` | `getAll` · `getById` · `create` · `update` · `delete` (+ `getByCategoryId` · `reorder`) |
| `quizResultStorage` | `getAll` · `saveResults` |
| `BACKUP_KEYS` | 백업이 담는 4개 키. `@my_word_ad_free` 와 SecureStore 키는 일부러 없다 |
| `readRaw(key)` · `writeRaw(key, value)` | 원시 값. 읽기 오류는 null |
| `clearAllData()` | 본체 4개 키를 지운다 |
