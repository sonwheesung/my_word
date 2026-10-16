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

## examService.ts (AI 시험)

| 함수 | 반환 | 설명 |
|------|------|------|
| `examService.loadPrefs()` · `savePrefs(prefs)` | `ExamPrefs` | 저장 실패는 삼킨다 |
| `examService.buildSeeds(categoryId, limit?)` | `SeedPlan` | 만기·취약 조회가 실패하면 무작위로 내려앉는다 |
| `examService.getRecords()` · `saveRecord(record)` | `ExamRecord[]` | 🔴 **저장 실패는 삼키지 않는다** — 성적표가 비면 사용자가 알아야 한다 |
| `examService.recordFirstAttempt(record)` | | 🔴 **이 파일에서 통계를 쓰는 유일한 함수.** `attempts.length !== 1` 이면 아무것도 안 한다 |
| `examService.addAttempt(examId, answers)` | `ExamRecord` | 한 회차를 덧붙인다. 🔴 **회차가 0 이던 판이면 그때 통계에 넣는다**(그게 1회차다 · 2026-10-15). 2회차부터는 안 쓴다 |
| `examQuotaService.loadFreeLeft()` · `saveFreeLeft(n)` | `number` | 남은 무료 판수(시안 #19). 모르면 `EXAM_FREE_QUOTA`. 🚫 구독자(`remaining === null`)에게는 **안 부른다** — 0 으로 읽으면 *"다 썼어요"* 가 뜬다 |
| `examQuotaService.seeSubscription({active, grace})` | `QuotaNotice \| null` | 구독이 끝났으면 사유를 돌려준다(`ended` · `billing`). 🔴 **`proKnown` 전에는 부르지 않는다** — 못 물어본 것을 「끝났다」로 읽으면 없는 사고를 알린다 |
| `examQuotaService.dismissEndedNotice()` | | 「해지 후」 안내를 거둔다(첫 새 시험 뒤). 🚫 「결제 실패」는 안 거둔다 — 구독이 돌아올 때 `seeSubscription` 이 거둔다 |
| `nextSeen(prev, now)` · `parseSubSeen(raw)` · `parseFreeLeft(raw)` | | 순수 함수. 구독을 살 수 있기 전에는 실기기에서 못 밟는 길이라 **여기만 테스트로 지킨다** |
| `examService.saveUnplayed(record)` | | 문제만 받아 둔 판을 성적표에 만든다(`attempts: []` · 2026-10-15). 🚫 **재시험에는 쓰지 않는다** — 쌓인 회차를 지운다 |
| `examService.hasCountedAttempt(examId)` | `boolean` | 통계가 이미 반영됐나. ⚠ **저장 전에** 물어야 한다 — 저장하면 회차가 생겨 구분이 사라진다 |
| `examService.loadJob()` · `saveJob(job)` · `clearJob()` | `ExamJob \| null` | 받아 둔 접수증(**만드는 중**). 🔴 `saveJob` 만 **삼키지 않는다** — 못 적으면 만들어진 시험을 영영 못 찾는다 |
| `examService.loadProgress()` · `saveProgress(p)` · `clearProgress()` | `ExamProgress \| null` | 풀다 만 시험(**푸는 중** · 2026-10-14). ⚠ **전부 삼킨다** — 못 적어도 지금 풀고 있는 판은 멀쩡하고, 여기서 던지면 문제를 고를 때마다 화면이 멈춘다 |
| `parseExamProgress(raw)` | `ExamProgress \| null` | 순수 함수. 문제 0개·`examId` 없음이면 `null`, `index` 는 범위로 끌어들이고 `answers` 길이를 문제 수에 맞춘다 |
| `pickSeeds(words, dueIds, weakIds, limit?, rng?)` | `SeedPlan` | 순수 함수. 만기 4 · 취약 3 · 무작위 3. **앞이 비면 뒤가 채운다** |
| `scoreExam(questions, answers)` | `ExamScore` | 순수 함수. 🔴 **넘긴 문제를 분모에서 빼지 않는다** |
| `detectLanguage(text)` · `detectCategoryLanguage(words)` · `countLanguages(words)` | | 순수 함수. 판정 불가면 `null` — **추측으로 보내지 않는다** |
| `parseRecords(raw)` · `parseExamPrefs(raw)` · `parseExamJob(raw)` · `trimRecords(records, max?)` | | 순수 함수. 어떤 입력에도 throw 하지 않는다 |
| `parseAttempts(obj, questions)` | `ExamAttempt[]` | 옛 모양(`answers`·`score` 가 기록에 직접 있는 것)을 1회차로 옮긴다. **저장본을 고치지 않고 읽을 때 고친다** |
| `toSeedPayload(plan)` | `{word, meaning?}[]` | 뜻은 첫 번째만 보낸다 |

🔴 **통계에 들어가는 것은 1회차뿐이다**(2026-10-07 Phase 5 에서 켰다). 기획: *"내 단어 문제만
반영하고 재시험은 반영하지 않는다"*. 같은 문제를 다시 풀면 **외워서 맞히므로** 정답률이 조용히 부푼다.
쓰기는 `recordFirstAttempt` **한 곳에서만** 일어나고, 그 함수는 내 단어장에서 찾은 단어의
**안 넘긴** 문제만 쓴다. `__tests__/examService.test.ts` 가 **소스 훑기 + 실제 저장소 동작**
양쪽으로 지킨다 — 소스 훑기만으로는 변이 셋이 빠져나갔다.

⚠ **저장된 점수를 그대로 믿지 않는다**(`usableScore`). `correct`·`total`·`accuracy` 가 유한수가
아니면 버리고 `scoreExam` 으로 다시 센다. 2026-10-07 실기기에서 `Best NaN%` 가 떠서 생긴 가드이고,
가드를 넣자 그 기록들이 **실제 점수(0% · 30%)로 되살아났다** — 숨긴 것이 아니다.

⚠ `detectLanguage` 는 `utils/text.ts` 의 `detectSpeechLanguage` 와 **일부러 따로 둔다.**
그쪽은 발음용 BCP-47(`ja-JP`)이고 한자를 중국어로 떨어뜨리는데, 이쪽은 서버가 받는 짧은 코드이고
**한자를 일본어로 본다**(이 앱 사용자의 단어장이 일본어가 압도적이다). 섞으면 한쪽을 고칠 때 다른 쪽이 틀어진다.

🔴 서버 호출은 `examService` 가 아니라 **SDK**(`commonServer.generateExam` · `reportQuestion`)가 한다.
`generateExam` 만 타임아웃이 **120초**다 — 기본 10초로는 서버가 멀쩡히 문제를 만드는 동안 앱이 abort 하고
`offline` 이라고 말한다(그 호출의 원가는 이미 나갔으므로 가장 나쁜 실패다).

## examQuotaService.ts (남은 무료 판수 · 구독이 끝난 사실)

시험 진입 카드(`FreeExamCard` · 시안 단어앱#19)가 쓰는 **기기 쪽 기억**이다. 둘 다 화면을
그리기 위한 것이고 **정본이 아니다.**

```
@my_word_exam_free_left   남은 무료 판수. 서버는 remaining 을 **시험을 받은 응답에만** 싣는다
@my_word_sub_seen         마지막으로 본 구독 상태. 끝난 것을 카드가 직접 말하기 위해서다
```

🔴 **남은 판수는 대략이다.** 「지우기」 · 구독 전환 · 로그인 뒤에는 틀려질 수 있어
**시작을 막는 데 쓰지 않는다** — 틀린 값이 사람을 가두면 안 된다. 서버가 403 을 주면
그때 실패 화면이 안내한다(그쪽이 정본이다).

🔴 **구독자는 `remaining` 이 `null`(판수 제한 없음)이다. 0 과 반드시 구별한다** —
`null` 을 0 으로 읽으면 구독자에게 *"다 썼어요"* 가 뜬다.

🔴 **`proActive === false` 는 「아니다」와 「아직 못 물어봤다」 둘 다다.** 그래서 화면은
`proKnown`(서버에 **성공적으로** 물어본 뒤에만 참)이 켜진 뒤에만 `seeSubscription` 을 부른다.
안 그러면 네트워크가 잠깐 끊긴 구독자가 다음에 들어왔을 때 *"구독이 끝나서…"* 를 본다 —
**없는 사고를 알리는 것**이 가장 나쁘다.

| 본 것 | 적는 것 |
|---|---|
| 처음 본다 | 지금 상태만. 알릴 것 없음(과거를 모른다) |
| 지금 구독 중 | 알릴 것 없음 — 돌아왔으면 하던 안내도 거둔다 |
| 켜짐 → 꺼짐 | 유예 중이었으면 **결제 실패**, 아니면 **해지** |
| 계속 꺼짐 | 들고 있던 안내를 그대로 유지 |

⚠ 사유를 모르면 **해지**로 읽는다. 권한 정보는 `active · expiresAt · willRenew ·
inGracePeriod` 넷뿐이라 환불과 해지를 구분하지 못한다 — *"구독이 끝나서"* 는 환불에도
틀린 말이 아니고, **나무라지 않는 쪽으로 틀리는 것**이 안전하다.

## syncService.ts (학습 데이터 밀기)

| 함수 | 반환 | 설명 |
|------|------|------|
| `syncService.pushOnce()` | `{pushed, remaining, reason?}` | **던지지 않는다.** 실패하면 다음 기회에 다시 민다 |
| `syncService.loadState()` · `saveState(s)` | `SyncState` | 저장 실패는 삼킨다 |
| `syncService.pushRest()` | `[{kind, pushed, reason?}]` | 카테고리·결과·시험. 🔴 `ENABLED_KINDS` 밖은 쳐다보지 않는다. **부르는 곳은 `BootstrapContext` 하나**(단어 밀기 뒤에 직렬로) |
| `pickChanged(words, since, limit?)` | `PushableWord[]` | 순수 함수. 🔴 경계를 **`>=`** 로 본다 — `>` 면 같은 밀리초의 단어를 영원히 빠뜨린다 |
| `pickResults(results, after, limit)` | 결과 배열 | 순수 함수. ⚠ 경계가 **`>`** 다 — 푼 기록은 바뀌지 않으므로 다시 보낼 이유가 없다 |
| `toPayload(words)` | 서버 모양 | 🔴 **메모·예문·태그를 안 담는다.** `deletedAt` 은 담는다(묘비) |
| `fingerprint(json)` | `string` | 순수 함수. 작고 통째로 미는 종류(카테고리·시험)가 "바뀌었나"를 판정한다 |
| `wordsForPush()` | `PushableWord[]` | 🔴 **묘비를 포함해** 읽는다(`syncRepo`). `wordService.getWords()` 로는 못 본다 |
| `isEnabled(kind)` | `boolean` | 공시된 종류인가 |
| `needsRewind(state, localCount)` | `boolean` | 순수 함수. 🔴 **서버가 나보다 적게 들고 있으면 장부를 되감는다**(아래) |
| `parseState(raw)` | `SyncState` | 어떤 입력에도 throw 하지 않는다 |

🔴 **기기가 정본이고 서버는 사본이자 분석 창고다**(mission 기둥 6 승계). 이 서비스가 통째로
실패해도 사용자는 아무것도 잃지 않으므로 **실패를 화면에 띄우지 않는다.**

🔴 **이 서비스는 밀기만 한다.** 당기기는 `restoreService` 에 따로 있다(아래) —
미는 쪽은 부팅마다 조용히 돌고 당기는 쪽은 사용자가 고른 순간에만 돈다. 섞으면 자동 경로가
언젠가 기기를 덮어쓸 수 있고 그 사고는 조용하다. `__tests__/syncService.test.ts` 가 소스를 읽어
이 서비스에 `syncPull`·`syncCounts`·`restoreService` 가 들어오면 FAIL 한다.

### 🔴 밀 수 있는 종류는 **처리방침이 정한다** (2026-10-12)

```
ENABLED_KINDS = ['words']      ← 지금 이것뿐이다
```

서버에 표(`user_categories`·`user_quiz_results`·`user_exams`)와 라우트를 다 만들어 두었지만
**켜지 않았다.** 게시 중인 `privacy-policy.html` 이 *"퀴즈 기록·설정)은 기기 밖으로 나가지
않습니다"* · *"시험의 점수와 답안은 기기에만 저장되며 서버로 전송되지 않습니다"* 라고 말한다.
켜는 것은 코드가 아니라 **문서를 고치는 결정**이다(`SERVER_RESTORE_PLAN.md` §8 B 단계).

🔴 `__tests__/syncDisclosure.test.ts` 가 `ENABLED_KINDS` 와 처리방침 본문을 **대조한다.**
공시되지 않은 종류가 켜져 있으면 FAIL 하고, 그 가드 자신이 0개를 검사하고 초록이 되지 않도록
*"지금 처리방침은 퀴즈 기록·시험을 부정하고 있다"* 를 함께 확인한다.

#### 🔴 그런데 공시를 넓히는 것만으로는 안 밀린다 (2026-10-13 에 잡았다)

`pushRest()` 를 10-12 에 만들고 **부르는 곳을 안 만들었다.** 테스트도 그 함수를 한 번도
건드리지 않았으니 601개가 전부 초록이었다. `ENABLED_KINDS = ['words']` 라 그날 증상은 0이었지만,
처리방침을 개정해 종류를 켜는 사람은 그 배열 **한 줄만** 고칠 것이고 그때 이렇게 된다:

```
공시   넓어졌다 (처리방침이 퀴즈 기록을 적는다)
코드   ENABLED_KINDS 에 들어왔다
실제   🔴 아무것도 안 밀린다 · 오류도 안 난다 · 서버는 영원히 빈 표를 들고 있다
```

→ `BootstrapContext` 가 `pushOnce()` **뒤에** 직렬로 붙여 부른다. 지금은 아무것도 보내지 않는
호출이지만, 켜는 날 배선을 찾아 헤매지 않도록 **꺼져 있는 동안에 넣어 둔다.**

⚠ **직렬인 것은 의도다.** 동시에 보내면 느린 기기에서 단어 밀기가 늦어지고, 단어 경로는
실기기에서 두 번 고쳐 가며 검증한 길이라 양보받을 쪽이 아니다.

가드 넷이 `__tests__/syncService.test.ts` 에 붙었다 — 부팅 경로가 **둘 다** 부르는가 ·
`await` 로 첫 화면을 막지 않는가 · 켤 수 있는 종류마다 `isEnabled` 분기가 있는가.
🔴 **「함수가 있다」와 「그 함수가 불린다」는 다른 명제이고, 타입 체크는 전자만 본다.**

🔴 **기기 장부를 서버가 주는 숫자로 의심한다**(2026-10-07 실기기에서 찾았다). 장부는
*"10:46 까지 다 밀었다"* 인데 서버에는 단어가 **17개 중 1개**뿐이었다. 서버는 매번 자기가 가진
수(`total`)를 돌려주고 기기는 그걸 `serverTotal` 로 **저장까지 하고 있었다** — 증거를 손에 들고 안 봤다.

```
needsRewind   serverTotal < 내 단어 수  →  장부를 null 로 되감아 전부 다시 민다
rewoundFor    같은 숫자로는 두 번 되감지 않는다 (부팅마다 전부 다시 미는 것을 막는다)
```

- ⚠ **어긋남은 한 라운드 뒤에 발견된다.** 서버 수를 아는 길이 밀어 보고 듣는 것뿐이다
- 🔴 **경계를 `>=` 로 둔 것이 여기서도 일한다** — 밀 것이 늘 하나는 있어서 라운드가 끊기지 않는다.
  `>` 였다면 어긋난 기기가 **아무것도 안 보내며 영원히 조용하다**
- ⚠ **모르는 것으로 되감지 않는다.** `serverTotal` 이나 `lastUpdatedAt` 이 `null` 이면 판단하지 않는다
- 서버가 **더** 많이 들고 있어도 되감지 않는다 — 지운 단어가 서버에 남는 정상 상태다
- ✅ 실기기 검증: 어긋난 장부를 심고 띄우자 **17개를 다시 밀고 `rewoundFor: 1` 을 남겼다.**
  한 번 더 띄워도 다시 밀지 않았다

⚠ **지운 단어는 아직 못 민다.** 기기가 진짜로 지우므로(soft delete 아님) "지웠다"는 사실이 안 남는다.
서버 표에 `deleted_at` 칸은 미리 만들어 뒀다. 기기 삭제를 묘비로 바꿀 때 쓴다.

⚠ 부팅에서 `setLoaded(true)` **뒤에** 떼어 붙인다 — 사용자에게 값을 주지 않는 일이 첫 화면을 막으면 안 된다.

## syncScheduler.ts (언제 미는가)

| 함수 | 설명 |
|------|------|
| `syncScheduler.schedule()` | 「바뀌었다」를 알린다. **3초로 묶는다** — 10개를 연달아 넣어도 요청은 하나다 |
| `syncScheduler.now()` | 앱 복귀. 묶을 이유가 없으므로 **바로** 민다 |
| `syncScheduler.register(fn)` | 실제로 미는 함수를 꽂는다. 🔴 **`BootstrapContext` 한 곳에서만** |
| `syncScheduler.isPending()` | 보낼 것이 밀려 있나(진단·테스트) |

부르는 곳: `wordService.{createWord,updateWord,deleteWord}` · `categoryService.{createCategory,
updateCategory,deleteCategory,reorderCategories}` · `quizService.saveQuizResults` ·
`examService.saveRecord`(재시험도 여기를 거친다) · `BootstrapContext`(복귀).

### 🔴 왜 만들었나 — 15시간

```
10-12 20:43   앱이 서버에 마지막으로 올림
10-12 20:46   사장님이 일본어 12개를 넣으심
10-13 11:35   🔴 그 사이 약 15시간 동안 그 12개는 서버에 없었다
```

밀기가 **JS 프로세스 시작당 1회**였다. 홈 버튼은 프로세스를 안 죽이므로 폰을 내려놓으면
그 상태가 밤새 이어진다. 「분석 창고」였을 때는 흠이 아니었지만 **「복구 수단」으로는 흠이다.**

### 🟢 큐는 만들지 않았다 — 이미 있다

`pickChanged` 가 `updated_at >= 마지막으로 민 시각` 인 것을 고른다. 저장·수정·삭제가 전부 그
칸을 올리므로(삭제는 묘비가 올린다), 실패하면 `lastUpdatedAt` 이 안 움직이고 **쌓인 것이 다음
성공 때 전부 함께 간다.** 기기 DB 자체가 큐다. 그래서 이 파일은 **타이머 하나**이고 자료구조가 없다.

### ⚠ 네트워크 감지 모듈을 쓰지 않은 이유

「인터넷이 붙는 순간」을 들으려면 네이티브 모듈이 필요하고, 그러면 `runtimeVersion` 이 올라가
**지금까지 낸 OTA 가 전부 끊긴다.** 실패를 30초→2분→5분으로 다시 미는 것이 같은 일을 하고,
백그라운드 백업에서 「붙는 그 순간」과 「붙고 30초 안」의 차이는 사용자에게 의미가 없다.

### 🔴 고리를 피하려고 잎으로 두었다

`wordService → syncService → wordService` 가 되므로, 이 모듈은 **아무것도 import 하지 않는다.**
미는 함수는 부팅 배선이 `register()` 로 꽂는다. 꽂히기 전에 들어온 저장도 버리지 않는다.

⚠ 겹침을 막는 곳은 `run()` 안의 한 줄이다. `schedule()`·`now()` 의 같은 검사는 **최적화**이고
안전장치가 아니다 — 그 둘을 지워도 테스트가 안 깨지고, `run()` 쪽을 지우면 깨진다.

## shareService.ts (CSV)

| 함수 | 설명 |
|------|------|
| ~~`exportWordsToCSV(words)`~~ | 🔴 **2026-10-12 제거**(공유 기능 삭제). 생성기는 `test-utils/csvWriter.ts` 로 옮겨 **파서의 왕복·퍼즈 검사**만 지킨다 |
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

## restoreService.ts (서버 복구)

| 함수 | 반환 | 설명 |
|------|------|------|
| `restoreService.serverCounts()` | `{counts}` | 🔴 **아무것도 내려받기 전에** 「가져올 게 있나」를 말한다 |
| `restoreService.fetchAll()` | `{backup, counts}` | 네 종류를 끝까지 당겨 **복원 파일 모양**으로 조립한다. 아직 안 쓴다 |
| `toWords` · `toCategories` · `toResults` · `toExams` | 기기 모양 | 순수 함수. 🔴 서버는 `meanings`·`questions`·`attempts`·`score` 를 **JSON 문자열**로 준다 |
| `nextIdFor(words, categories, results)` | `number` | 🔴 카운터 하나를 셋이 함께 쓴다. 낮게 잡으면 **퀴즈 결과가 엉뚱한 단어에 붙는다** |

🔴 **이 서비스는 아무것도 쓰지 않는다. 받아서 조립만 한다.** 기기에 쓰는 일은 설정 화면의
`runRestore` 하나가 한다 — **덮어쓰기 직전에 안전 사본을 남기고 번들을 다시 올리는** 유일한 자리다.

⚠ 2026-10-13 에 여기 있던 `apply()`(= `backupService.restore` 한 줄)를 **지웠다.** 부르는 곳이
**0건**이었고, 남겨 두면 다음 사람이 그걸 부르면서 **안전 사본과 재시작을 같이 건너뛴다** —
그쪽이 더 짧아 보이기 때문이다. 같은 날 아침 `pushRest()` 가 같은 모양으로 비어 있었다.
🔴 **「함수가 있다」와 「그 함수가 불린다」는 다른 명제이고, 타입 체크는 앞쪽만 본다.**

🔴 **덮어쓰기지 합치기가 아니다.** 같은 id 가 서로 다른 단어를 가리키는 경우를 다루려면 병합
코드가 필요하고, 그 코드는 틀렸을 때 조용히 틀린다. 그래서 「이 기기 유지」와 「가져오기」 중
하나를 사용자가 고른다. 직전 상태는 화면이 `myword-before-restore.json` 으로 남긴다.

🔴 **빈 것으로 기기를 덮지 않는다.** 서버가 0개를 돌려줬을 때 그대로 덮으면 복구가 아니라
삭제다 — 네트워크가 반쯤 되는 상태에서 실제로 일어날 수 있다. `reason: 'empty'` 로 물러난다.

⚠ **되돌려 주지 못하는 것: 예문 · 태그 · 메모.** 밀기가 그 셋을 보내지 않는다(사적인 내용이다).
그래서 복구 수단이 둘이고 역할이 다르다:

```
백업 파일   전부 돌아온다              🚫 파일을 잃으면 끝이다
서버 복구   단어 · 뜻 · 기록이 돌아온다   ✅ 폰을 잃어도 남아 있다
```

⚠ 당기는 루프에 **상한(`MAX_PAGES` 200)** 과 **커서 전진 검사**가 있다. 서버가 같은 커서를
다시 주면 영원히 같은 페이지를 받으며 데이터 요금과 배터리만 쓴다.

## googleAuth.ts (구글 로그인 — 네이티브 껍데기)

| 함수 | 반환 | 설명 |
|------|------|------|
| `googleAvailable()` | `boolean` | 이 빌드에서 쓸 수 있나. **Expo Go · 웹이면 false** |
| `signInGoogle()` | `{ok:true,idToken}` 또는 실패 | 계정 선택 창 → **ID 토큰만** 받는다. 검증은 서버가 한다 |
| `signOutGoogle()` | — | 구글 세션만 끊는다 |
| `revokeGoogle()` | — | 권한까지 회수. 다음 로그인에서 동의 화면이 다시 뜬다 |

🔴 **`webClientId` 는 웹 클라이언트 ID 다.** 안드로이드 네이티브 로그인도 ID 토큰의 `aud` 를
웹 클라이언트 ID 로 발급한다. Android 클라이언트 ID 를 넣으면 **로그인은 되는데 서버가 전부 401**
이다(`common_server/lib/auth/providers.ts` 주석이 같은 함정을 적어 두었다).

🔴 **Android OAuth 클라이언트가 둘 있어야 한다** — `myword-android-upload`(업로드 키 SHA-1)와
`myword-android-play`(**Play 앱 서명** SHA-1). Play 앱 서명을 쓰므로 사용자 기기의 앱은 구글이
다시 서명한다. 업로드 키만 등록하면 **로컬에서는 되고 운영에서만 깨진다.**

⚠ `signInGoogle` 은 `NO_ID_TOKEN` 을 따로 돌려준다 — `webClientId` 가 틀리면 **로그인은 되는데
토큰만 비어서** 오고, 그대로 보내면 서버 401 로 위장되어 원인이 안 보인다.
⚠ 실패 `code` 는 **번역하지 않고 그대로** 화면에 보인다. `DEVELOPER_ERROR`(10)는 지문·패키지
문제이고, 그 글자가 보여야 원인을 찾는다.

## subscriptionService.ts (구독 소유자 묶기)

| 함수 | 반환 | 설명 |
|------|------|------|
| `subscriptionService.isAvailable()` | `boolean` | 공개 SDK 키가 있고 네이티브 모듈이 붙었나. **키가 없으면 꺼진 것으로 다룬다** |
| `subscriptionService.syncSubject(id)` | — | `app_user_id` 를 우리 주체 ID 에 맞춘다. 같은 ID 면 아무것도 안 한다 |
| `subscriptionService.restore()` | `{ found: boolean }` | 스토어에 물어 **소유자를 지금 주체로 옮긴다**. ⚠ 반환값으로 판정하지 않는다 |
| `subscriptionService.getPlans()` | `SubPlan[]` | 파는 요금제(연간·월간). 🔴 **못 가져오면 빈 배열 — 가격을 지어내지 않는다.** 화면이 가격을 비우고 [다시 시도]를 준다(시안 #20) |
| `subscriptionService.activePlanKind()` | `'yearly' \| 'monthly' \| null` | 지금 쓰는 요금제가 무엇인가(시안 #21). 🔴 **서버는 모른다** — 상품 종류는 기기의 스토어 SDK 에만 있다. 🚫 금액은 여기서도 안 가져온다. 모르면 화면이 **안 적는다** |
| `subscriptionService.purchase(kind)` | `SubPurchaseResult` | 🚫 **던지지 않는다.** 결과는 `ok` · `cancelled` · `already-owned` · `not-allowed` · `unavailable` · `error`. ⚠ `getPlans()` 를 먼저 불러야 한다(SDK 에 **그때 받은 묶음**을 돌려줘야 한다) |
| `usePurchase().recheckPro(fresh?)` | `boolean \| null` | **서버에 구독을 다시 묻는다.** 결제 직후 「확인 중」이 이 함수로 몇 번 묻는다(#20·#23·#26 이 같은 길을 쓴다). 🔴 **`null` 은 「못 물어봤다」** — `false` 로 읽으면 네트워크가 잠깐 끊긴 사람에게 「구독이 아니다」가 된다 |

🔴 **결제가 끝나도 곧바로 구독자가 아니다.** Play → RevenueCat 웹훅 → 우리 서버까지 몇 초가 걸린다.
그 사이를 **실패로 보여 주면 이미 돈을 낸 사람이 놀란다** — 「확인 중」을 띄우고 `recheckPro(true)` 로 다시 묻는다.

🔴 **결제 사유를 하나로 접지 않는다.** `not-allowed`(보호자 승인 거부 · 기기 결제 제한)는 `error` 와 다르다 —
사용자 잘못이 아니고 「다시 시도」로도 안 풀린다. 2026-10-15 의 AI 시험 실패 화면이 일곱 가지를
*"잠시 뒤에 다시 시도해 주세요"* 하나로 뭉갰던 것과 같은 잘못을 여기서 되풀이하지 않는다.

⚠ SDK 에러 코드는 **문자열**이다(`'1'` 취소 · `'3'` 허용 안 됨 · `'6'` 이미 구매).
`=== 1` 로 비교하면 영영 안 맞는다 — 두 경우 다 테스트가 지킨다.

### 🔴 왜 서버만으로는 안 되나

서버에는 RevenueCat 에서 상태를 당겨 오는 폴백이 이미 있다(`common_server/lib/rcPull.ts`).
그런데 **그 조회의 키가 `app_user_id` = 우리 주체 ID** 다. 기기를 바꾸거나 설정에서
「서버에 보관된 내용 지우기」를 누르면 주체가 새로 생기고, RevenueCat 은 그 **새 ID 가 무엇을
가졌는지 모른다** — 구매는 죽은 옛 ID 에 묶여 있다. 그래서 서버가 아무리 물어도 빈손이다.

```
해지 후 같은 기기에서 재구독   🟢 주체가 그대로라 이 서비스 없이도 된다
폰을 바꿨을 때                 🔴 필요하다
「지우기」를 누른 뒤            🔴 필요하다
구글 로그인으로 주체가 바뀔 때   🔴 필요하다
```

🔴 **`app_user_id` 를 익명으로 두면 조용히 실패한다.** RevenueCat 은 ID 를 안 주면 스스로
`$RCAnonymousID:…` 를 만들고, 그 상태의 결제는 웹훅이 `anonymous-app-user-id` 로 **거부**한다.
결제는 성공하고 권한만 안 생기는, 가장 찾기 어려운 실패다 — 그래서 **주체 ID 를 알기 전에는
`configure` 를 부르지 않는다.** 늦게 켜는 쪽이 안전하다.

### 호출하는 자리 (여기서 갈라 쓰지 않는다)

`authService` 의 `bindSubscription()` 하나로 모은다. 주체가 바뀌는 네 자리가 전부 그걸 쓴다 —
`refresh()` · `signIn()` · `signOut()` · `afterServerErased()`.
🔴 호출부마다 `configure`/`logIn` 을 고르게 하면 **어느 경로 하나가 익명으로 초기화**하고,
그 사고는 결제한 뒤에야 드러난다.

### 「구매 복원」의 순서

```
① subscriptionService.restore()   스토어에 묻고 소유자를 옮긴다
② refreshPro(fresh)               서버의 엔타이틀먼트를 읽는다
```

🔴 **거꾸로 하면 옮기기 전의 빈손을 읽는다.** 기기를 바꾼 사람에게는 그게 「구독 없음」으로
보이고, 그 화면이 이 버튼의 전부다.

### ⚠ `remove_ads` 는 여기서 다루지 않는다

평생 광고 제거는 `expo-iap` 이 그대로 맡는다. 게시된 약관 제6조가 *"평생 광고 제거에 관하여
구매 토큰을 포함한 어떠한 결제 정보도 회사 서버로 전송하거나 저장하지 않는다"* 고 적고 있고,
그 약속을 지키려면 그 상품은 RevenueCat 을 거치지 않아야 한다.

🟢 RevenueCat SDK 와 자체 IAP 코드를 **함께 쓰는 것은 공식 지원**이다(Play Billing 8 이상 조건).
실측: `expo-iap` 이 끌어오는 BillingClient 가 **9.1.0** 이다.
🔴 다만 **두 라이브러리가 같은 빌드에 들어간 것을 아직 구워 본 적이 없다.** 릴리스 빌드 E2E 에서
**광고 제거 구매·복원이 여전히 되는지** 반드시 다시 잰다.

## authService.ts (로그인 상태와 갈아타기)

| 함수 | 반환 | 설명 |
|------|------|------|
| `authService.isAvailable()` | `boolean` | 계정 줄을 띄워도 되나(모듈 + 서버 설정) |
| `authService.current()` | `AuthState` | 들고 있는 것. ⚠ **이것만으로 화면을 그리지 않는다**(아래) |
| `authService.refresh()` | `Promise<AuthState>` | 서버에 물어 최신 주체. 계정 줄이 있는 화면이 뜰 때 |
| `authService.signIn()` | `SignInFail \| null` | 구글 → 서버 로그인 → 🔴 **장부 비우고 다시 밀기** |
| `authService.signOut()` | — | 구글·서버 세션 정리 → 기기 세션 복구 → 🔴 같은 되감기 |
| `authService.afterServerErased()` | — | 서버 사본을 지운 **뒤** 뒷정리(권한 회수 · 기기 세션 · 장부 비우기) |

### 🔴 승계를 만들지 않았다 — 「다시 민다」가 전부다

구글로 로그인하면 서버에 **새 주체**가 생기고 기기 주체의 사본은 고아가 된다. 두 주체를 섞는
병합 코드를 쓰지 않는다 — 틀리면 **남의 단어가 내 단어장에 들어오고**, 그 사고는 조용하다.

```
기기가 정본이다 → 갈아탄 뒤 기기에 있는 것을 전부 다시 민다
```

🔴 그 「다시」를 만드는 것이 **장부 비우기 한 줄**이다. `pickChanged` 는 `updated_at > 마지막으로
민 시각` 인 것만 고르므로, 갈아탄 뒤에도 그 시각이 남아 있으면 **아무것도 안 골라서 새 계정의
서버가 영원히 빈다.** 로그인·로그아웃·서버 사본 삭제 **셋이 같은 함수**를 쓴다 — 한 곳이라도
빠지면 그 경로에서만 조용히 빈다.

### ⚠ `current()` 만으로 화면을 그리면 깜빡인다

SDK 의 `getSubject()` 는 **이 JS 프로세스에서** `login`·`restoreSession` 을 한 번 부른 뒤에만
채워진다. 콜드부팅 직후에는 세션이 멀쩡해도 `null` 이라, 로그인해 둔 사람에게 「구글로 로그인」
줄이 잠깐 보였다 사라진다. 그래서 화면은 `refresh()` 를 부르고 **그 전까지는 「확인 중」**으로 둔다.

### ⚠ 지운 뒤에 다시 올라가는 것은 설계다

`afterServerErased` 는 **비우되 밀지는 않는다.** 바로 밀면 방금 지운 것이 곧바로 올라가 지운
의미가 없다. 그래도 **비우기는 한다** — 안 비우면 다음에 단어 하나를 고쳤을 때 그 한 줄만
올라가 **반쪽짜리 사본**이 생기고, 「복구하면 돌아온다」가 거짓이 된다.

```
지운 직후    서버에 아무것도 없다
계속 쓰시면   다음에 뭔가 바뀔 때 새 식별자로 처음부터 다시 보관된다
```

그대로 처리방침 제5-3항과 `docs/delete-data.html` 에 적혀 있다.
