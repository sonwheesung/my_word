# My Word - 서비스 레이어 API 명세

## 개요

서비스 레이어는 저장소(storage)와 화면(screens) 사이의 비즈니스 로직을 담당한다.

```
Screen → Service → Storage (AsyncStorage/localStorage)
                 → External API (Google Translate, Free Dictionary)
```

---

## wordService

**파일**: `src/services/wordService.ts`

| 함수 | 파라미터 | 반환 | 설명 |
|------|---------|------|------|
| `getWords(categoryId)` | `categoryId: number` | `Promise<Word[]>` | 카테고리별 단어 목록 조회 |
| `getWord(id)` | `id: number` | `Promise<Word>` | 단어 상세 조회 (없으면 throw) |
| `checkDuplicate(word, categoryId, excludeWordId?)` | `word: string`, `categoryId: number`, `excludeWordId?: number` | `Promise<boolean>` | 중복 단어 검사 (대소문자 무시) |
| `createWord(data)` | `data: WordRequest` | `Promise<Word>` | 단어 생성 |
| `updateWord(id, data)` | `id: number`, `data: WordRequest` | `Promise<Word>` | 단어 수정 |
| `deleteWord(id)` | `id: number` | `Promise<void>` | 단어 삭제 |

---

## categoryService

**파일**: `src/services/categoryService.ts`

| 함수 | 파라미터 | 반환 | 설명 |
|------|---------|------|------|
| `getCategories()` | - | `Promise<Category[]>` | 전체 카테고리 (displayOrder 정렬, wordCount 포함) |
| `getCategory(id)` | `id: number` | `Promise<Category>` | 단일 카테고리 (wordCount 포함, 없으면 throw) |
| `createCategory(data)` | `data: CategoryRequest` | `Promise<Category>` | 카테고리 생성 (이름 중복 검사) |
| `updateCategory(id, data)` | `id: number`, `data: CategoryRequest` | `Promise<Category>` | 카테고리 수정 (이름 중복 검사) |
| `deleteCategory(id)` | `id: number` | `Promise<void>` | 카테고리 삭제 (소속 단어 캐스케이드 삭제) |
| `reorderCategories(orders)` | `orders: {categoryId, displayOrder}[]` | `Promise<void>` | 카테고리 순서 변경 |

---

## quizService

**파일**: `src/services/quizService.ts`

### 데이터 저장

| 함수 | 파라미터 | 반환 | 설명 |
|------|---------|------|------|
| `saveQuizResults(results)` | `QuizResult[]` | `Promise<void>` | 퀴즈 결과 일괄 저장 |

### 통계 조회

| 함수 | 파라미터 | 반환 | 설명 |
|------|---------|------|------|
| `getWeakWordIds(limit?)` | `limit?: number` | `Promise<number[]>` | 취약 단어 ID 목록 (정확도 < 50%) |
| `getStatistics()` | - | `Promise<QuizStatistics>` | 전체 퀴즈 통계 |
| `getWordQuizStats(filterCategoryId?)` | `filterCategoryId?: number` | `Promise<WordQuizStats[]>` | 단어별 퀴즈 성적 |
| `getCategoryQuizStats()` | - | `Promise<CategoryQuizStats[]>` | 카테고리별 퀴즈 성적 |
| `getMyPageStats()` | - | `Promise<MyPageStats>` | 마이페이지 활동 데이터 |

### 타입 정의

```typescript
interface QuizResult {
  wordId: number;
  isCorrect: boolean;
  quizType: string;
  word?: string;
  correctAnswer?: string;
  userAnswer?: string;
}

interface QuizStatistics {
  totalQuizCount: number;
  totalCorrect: number;
  totalWrong: number;
  accuracy: number;          // 0~100
  weakWordCount: number;
  totalWords: number;
  totalCategories: number;
}

interface WordQuizStats {
  wordId: number;
  word: string;
  categoryId: number;
  totalCount: number;
  correctCount: number;
  wrongCount: number;
  accuracy: number;          // 0~100
}

interface CategoryQuizStats {
  categoryId: number;
  categoryName: string;
  totalCount: number;
  correctCount: number;
  accuracy: number;          // 0~100
  weakWordCount: number;
}

interface DailyActivity {
  date: string;              // YYYY-MM-DD
  wordCount: number;
  quizCount: number;
}

interface MyPageStats {
  totalWords: number;
  totalQuizCount: number;
  streakDays: number;
  dailyActivities: DailyActivity[];
}
```

---

## dictionaryService

**파일**: `src/services/dictionaryService.ts`

| 함수 | 파라미터 | 반환 | 설명 |
|------|---------|------|------|
| `lookup(word)` | `word: string` | `Promise<DictionaryResult>` | 통합 사전 검색 (뜻 + 예문 + 품사) |
| `fetchKoreanMeanings(word)` | `word: string` | `Promise<{meanings, partsOfSpeech}>` | Google Translate로 한국어 뜻 조회 (최대 5개) |
| `translateToKorean(text)` | `text: string` | `Promise<string>` | 영→한 번역 |
| `fetchExamples(word)` | `word: string` | `Promise<{example, translation}[]>` | Free Dictionary API에서 예문 + 번역 |

### 외부 API

| API | 용도 | 엔드포인트 |
|-----|------|-----------|
| Google Translate | 한국어 뜻, 품사, 번역 | `translate.googleapis.com/translate_a/single` |
| Free Dictionary | 영문 예문 | `api.dictionaryapi.dev/api/v2/entries/en/{word}` |

### DictionaryResult 타입

```typescript
interface DictionaryResult {
  word: string;
  meanings: string[];
  examples: { example: string; translation: string }[];
  partsOfSpeech: string[];   // 한글 품사 (명사, 동사 등)
}
```

---

## Storage (저장소 추상화)

**파일**: `src/utils/storage.ts`

### categoryStorage

| 함수 | 설명 |
|------|------|
| `getAll()` | 전체 카테고리 배열 |
| `getById(id)` | ID로 단일 조회 |
| `create(data)` | 생성 (자동 ID) |
| `update(id, data)` | 수정 |
| `delete(id)` | 삭제 + 소속 단어 캐스케이드 삭제 |
| `reorder(orders)` | 순서 변경 |

### wordStorage

| 함수 | 설명 |
|------|------|
| `getAll()` | 전체 단어 배열 |
| `getByCategoryId(categoryId)` | 카테고리별 단어 조회 |
| `getById(id)` | ID로 단일 조회 |
| `create(data)` | 생성 (자동 ID) |
| `update(id, data)` | 수정 |
| `delete(id)` | 삭제 |

### quizResultStorage

| 함수 | 설명 |
|------|------|
| `getAll()` | 전체 퀴즈 결과 배열 |
| `saveResults(results)` | 결과 일괄 저장 (자동 ID, 현재 시각) |

### 유틸리티

| 함수 | 설명 |
|------|------|
| `clearAllData()` | 전체 데이터 초기화 (디버깅/리셋용) |
