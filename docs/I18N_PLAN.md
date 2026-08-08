# 다국어(i18n) 도입 계획

작성: 2026-08-09 · 상태: **승인 대기**

전제: 저장 계층은 이미 다국어 안전하다(커밋 `225f5ea`). 이 문서는 **UI 문구와 사전 연동**을
사용자 언어에 맞추는 작업을 다룬다.

## 결정 사항

| 항목 | 결정 | 근거 |
|---|---|---|
| 라이브러리 | `i18next` + `react-i18next` | 복수형(영어 2형·러시아어 3형·아랍어 6형)을 ICU 규칙으로 처리. 폴백 체인·누락 경고 포함 |
| 언어 결정 | 기기 언어 자동 → 설정에서 변경 | 설치 즉시 자기 언어로 보이고, 틀리면 사용자가 고친다 |
| 적용 범위 | UI 문구 + 사전 번역 언어를 함께 따라감 | 메뉴는 영어인데 뜻은 한국어로 나오면 앱이 고장난 것으로 보인다 |

## 조사로 확정된 제약

- **`dictionaryapi.dev` 는 영어 전용이다.** `Apfel`·`猫`·`книга` 등 유효한 단어도 404.
  언어 코드 문제가 아니라 해당 언어 사전이 존재하지 않는다.
  → **예문 자동 가져오기는 영어 단어에서만 가능하다.** 이 사실을 UI에 드러내야 한다.
- Google Translate `dt=bd` 는 임의 언어쌍에서 동작한다(de→en, ar→en, es→de 확인).
- `sl=auto` 가 동작하며 감지한 언어를 함께 반환한다(`Apfel`→`de`, `猫`→`ja`, `книга`→`ru`).

---

## Phase A — 사전 연동 다국어화

**목표**: 영어가 아닌 단어를 검색해도 뜻이 채워진다.

- `dictionaryService.lookup` 의 `sl=en&tl=ko` → `sl=auto&tl=<사용자 언어>`
- **`toLowerCase()` 제거** (`dictionaryService.ts:100`) — 저장 경로에서 이미 걷어낸 것과 같은 이유.
  독일어 명사를 소문자로 만들어 조회하면 검색 품질이 떨어진다
- 예문은 감지 언어가 영어일 때만 시도. 아닐 때는 **"이 언어는 예문 자동 수집을 지원하지
  않습니다" 안내**를 띄우고 뜻만 채운다 (없는 걸 조용히 비워두지 않는다)
- `constants/partOfSpeech.ts` 의 한글 품사 매핑 → 번역 키로 전환

**산출**: `dictionaryService` 수정, `partOfSpeech` 키 전환, 계약 테스트

## Phase B — i18n 도입 + 영어 추가

**의존성 추가** (CLAUDE.md 라이브러리 규칙에 따라 `npx expo install --check` 검증)
```
npx expo install expo-localization      # SDK 54 → ~17.0.x
npm i i18next react-i18next             # 순수 JS, 네이티브 모듈 없음
```

**구조**
```
src/i18n/
  index.ts          i18next 초기화, 언어 결정 로직
  locales/ko.json   기준 언어(현재 문구를 그대로 옮김)
  locales/en.json
```

**언어 결정 순서**
```
저장된 설정(@my_word_language)  →  기기 언어(expo-localization)  →  en
```
새 AsyncStorage 키 하나만 추가한다. 기존 스키마는 건드리지 않는다.

**문자열 추출** — 약 250개 (파일별 분포)
```
AddWordScreen 40 · QuizScreen 35 · ManageWordsScreen 29 · QuizSetupScreen 24
StatisticsScreen 23 · CategoryManageScreen 22 · ImportWordsScreen 20
HomeScreen 19 · MyPageScreen 15 · SupportScreen 13 · 그 외 ~10
```

서비스 계층(`wordService`·`categoryService`)이 던지는 에러 메시지도 한국어다.
→ 서비스에서 `i18next.t()` 를 직접 호출한다(React 훅 밖에서도 쓸 수 있다).

**언어 선택 UI** — 설정 화면에 `언어` 항목 추가. 변경 즉시 반영(앱 재시작 불필요).

**레이아웃 점검** — 13개 화면. 영어가 한국어보다 길어 버튼·탭이 깨지는 곳을 찾는다.
예: `퀴즈 시작`(5자) → `Start Quiz`(10자), `카테고리 관리` → `Manage Categories`(17자).

## Phase C — 추가 언어 · RTL (별건)

- 언어 추가는 JSON 파일 하나 + 번역. 언어당 반나절(번역 시간 제외)
- **RTL(아랍어·히브리어)은 별도 작업**이다. `I18nManager.forceRTL()` 은 적용에 앱 재시작을
  요구하고, 레이아웃 전체가 좌우 반전되어 13개 화면을 다시 봐야 한다
- Phase B 반응을 보고 결정

---

## 리스크

| 리스크 | 대응 |
|---|---|
| 번역 품질 — 250개를 기계번역하면 리뷰 평점에 영향 | 영어는 초안 후 검수. 추가 언어는 검수 가능한 것만 |
| 문자열 추출 중 누락 → 화면에 키가 그대로 노출(`word.add`) | i18next `saveMissing` 경고 + 전 화면 Puppeteer 순회로 잔여 한국어/키 노출 확인 |
| Hermes `Intl.PluralRules` 미지원 시 복수형 깨짐 | 도입 첫 단계에서 기기/에뮬레이터로 실측 후 진행 |
| 영어 문구가 길어 레이아웃 깨짐 | 화면별 스크린샷 대조(ko/en) |
| 광고·스토어 메타데이터는 별개 | Play Console 스토어 등록정보 다국어는 이 작업 범위 밖 |

## 검증

- `npx tsc --noEmit` 0 에러
- 기존 테스트 108건 유지 + 언어 결정/폴백/복수형 테스트 신규
- Puppeteer: ko/en 각각 13개 화면 순회 → 잔여 한국어·키 노출·레이아웃 붕괴 확인
- 실기기 1회 (기기 언어 변경 시 자동 반영 확인)

## 공수

| Phase | 공수 |
|---|---|
| A 사전 연동 | 반나절 |
| B i18n + 영어 | 1.5~2일 |
| C 언어 추가 | 언어당 반나절 (번역 제외) |
| C RTL | 1일 + 재검증 |

## 범위 밖 (명시)

- Play Console 스토어 등록정보(설명·스크린샷) 다국어화
- 공통 서버 공지사항의 다국어화 — 서버가 언어별 공지를 내려줘야 한다(서버 작업)
- 개인정보처리방침 번역
