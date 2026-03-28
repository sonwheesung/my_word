# My Word - 데이터 모델

## 개요

모든 데이터는 로컬 저장소(AsyncStorage/localStorage)에 JSON 배열로 저장된다. 서버 없이 클라이언트 단독 동작.

## 저장소 키

| 키 | 설명 | 데이터 형식 |
|----|------|------------|
| `@my_word_categories` | 카테고리 목록 | `Category[]` |
| `@my_word_words` | 단어 목록 | `Word[]` |
| `@my_word_quiz_results` | 퀴즈 결과 이력 | `StoredQuizResult[]` |
| `@my_word_next_id` | 자동증가 ID 카운터 | `number` (문자열로 저장) |

## 엔티티

### Category

| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| `categoryId` | `number` | O | 고유 ID (자동 생성) |
| `categoryName` | `string` | O | 카테고리 이름 (중복 불가, 대소문자 무시) |
| `description` | `string` | X | 카테고리 설명 |
| `displayOrder` | `number` | O | 정렬 순서 |
| `wordCount` | `number` | X | 소속 단어 수 (서비스 레이어에서 계산) |
| `createdAt` | `string` | O | 생성일시 (ISO 8601) |
| `updatedAt` | `string` | O | 수정일시 (ISO 8601) |

### Word

| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| `wordId` | `number` | O | 고유 ID (자동 생성) |
| `categoryId` | `number` | O | 소속 카테고리 ID |
| `word` | `string` | O | 영단어 |
| `meanings` | `string[]` | O | 뜻 목록 (최대 10개) |
| `examples` | `WordExample[]` | O | 예문 목록 (최대 5개) |
| `tags` | `string[]` | X | 태그 (최대 10개) |
| `memo` | `string` | X | 메모 |
| `createdAt` | `string` | O | 생성일시 (ISO 8601) |
| `updatedAt` | `string` | O | 수정일시 (ISO 8601) |

### WordExample

| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| `example` | `string` | O | 영문 예문 |
| `translation` | `string` | X | 한글 번역 |

### StoredQuizResult

| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| `resultId` | `number` | O | 고유 ID (자동 생성) |
| `wordId` | `number` | O | 출제된 단어 ID |
| `isCorrect` | `boolean` | O | 정답 여부 |
| `quizType` | `string` | O | 문제 유형 (`word_to_meaning`, `meaning_to_word`, `example_to_meaning`, `translation_to_example`) |
| `word` | `string` | X | 출제 단어 텍스트 |
| `correctAnswer` | `string` | X | 정답 |
| `userAnswer` | `string` | X | 사용자 입력 답 |
| `takenAt` | `string` | O | 응시일시 (ISO 8601) |

## 엔티티 관계

```
Category (1) ──── (N) Word
    │
    └── categoryId로 연결

Word (1) ──── (N) StoredQuizResult
    │
    └── wordId로 연결
```

## 캐스케이드 삭제

- **카테고리 삭제 시**: 해당 카테고리에 속한 모든 단어도 함께 삭제
- **단어 삭제 시**: 퀴즈 결과는 유지 (통계 보존)

## ID 생성 방식

- 단일 글로벌 카운터 (`@my_word_next_id`)
- 모든 엔티티(Category, Word, QuizResult)가 동일 카운터 공유
- 원자적 증가: 읽기 → +1 → 저장

## 요청 타입 (Request)

### CategoryRequest

```typescript
{
  categoryName: string;
  description?: string;
  displayOrder?: number;
}
```

### WordRequest

```typescript
{
  categoryId: number;
  word: string;
  meanings: string[];
  examples: { example: string; translation?: string }[];
  tags?: string[];
  memo?: string;
}
```

## 파생 데이터 (서비스 레이어에서 계산)

| 데이터 | 계산 방식 | 사용처 |
|--------|----------|--------|
| `wordCount` | 카테고리별 단어 수 집계 | 카테고리 목록 |
| 정확도 (accuracy) | `정답 수 / 전체 문제 수 * 100` | 통계, 홈 |
| 취약 단어 (weak words) | 정확도 < 50% 단어 | 퀴즈 모드, 통계 |
| 연속 학습일 (streak) | 오늘부터 역순 연속 활동일 계산 | 홈, 마이페이지 |
| 일별 활동 (daily activity) | 날짜별 단어 추가 + 퀴즈 응시 수 | 마이페이지 히트맵 |
