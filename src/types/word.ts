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
}
