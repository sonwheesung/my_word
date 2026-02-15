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
  pronunciation?: string;
  meanings: string[];
  examples: WordExample[];
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
  pronunciation?: string;
  meanings: string[];
  examples: {
    example: string;
    translation?: string;
  }[];
}
