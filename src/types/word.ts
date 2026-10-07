// 카테고리 타입
export interface Category {
  categoryId: number;
  categoryName: string;
  description?: string;
  displayOrder: number;
  wordCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface CategoryRequest {
  categoryName: string;
  description?: string;
  displayOrder?: number;
}

// 단어 타입
export interface Word {
  wordId: number;
  categoryId: number;
  word: string;
  meanings: string[];
  examples: WordExample[];
  tags?: string[];
  memo?: string;
  /**
   * 이 단어가 어느 언어인가 — `ja` · `en` · `ko` · `zh` (2026-10-07 신설).
   *
   * 🟢 **지금도 뜻 찾기가 감지하고 있는데 버리고 있었다.** 저장만 하면 AI 시험의 언어 판정이
   *    정확해지고 **발음 재생도 같이 고쳐진다**(한자만 있는 단어가 지금 중국어로 읽힌다).
   *
   * ⚠ **기존 단어에는 이 값이 없다.** `undefined` 를 허용하고 글자 추정으로 메운다 —
   *    마이그레이션을 돌리지 않는다(운영 중인 앱이라 저장본을 건드리지 않는다).
   */
  language?: string;
  createdAt: string;
  updatedAt: string;
}

export interface WordExample {
  example: string;
  translation?: string;
}

export interface WordRequest {
  categoryId: number;
  word: string;
  meanings: string[];
  examples: {
    example: string;
    translation?: string;
  }[];
  tags?: string[];
  memo?: string;
  /**
   * 어느 언어인가. 뜻 찾기가 감지한 값을 그대로 담는다(2026-10-07).
   * ⚠ 없어도 된다 — 손으로 넣은 단어는 이 값이 없다.
   */
  language?: string;
}
