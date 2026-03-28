import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import type { Category, CategoryRequest, Word, WordRequest } from '../types/word';

// AsyncStorage 키
const CATEGORIES_KEY = '@my_word_categories';
const WORDS_KEY = '@my_word_words';
const QUIZ_RESULTS_KEY = '@my_word_quiz_results';
const NEXT_ID_KEY = '@my_word_next_id';

// 웹 환경에서는 localStorage 사용, 모바일에서는 AsyncStorage 사용
const isWeb = Platform.OS === 'web';

const webStorage = {
  async setItem(key: string, value: string): Promise<void> {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(key, value);
    }
  },
  async getItem(key: string): Promise<string | null> {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage.getItem(key);
    }
    return null;
  },
  async removeItem(key: string): Promise<void> {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem(key);
    }
  },
};

const storageImpl = isWeb ? webStorage : AsyncStorage;

// --- ID 생성 ---

async function getNextId(): Promise<number> {
  const currentIdStr = await storageImpl.getItem(NEXT_ID_KEY);
  const currentId = currentIdStr ? parseInt(currentIdStr, 10) : 0;
  const nextId = currentId + 1;
  await storageImpl.setItem(NEXT_ID_KEY, nextId.toString());
  return nextId;
}

// --- 제네릭 컬렉션 헬퍼 ---

async function getCollection<T>(key: string): Promise<T[]> {
  try {
    const json = await storageImpl.getItem(key);
    return json ? JSON.parse(json) : [];
  } catch (error) {
    console.warn(`Failed to load ${key}:`, error);
    return [];
  }
}

async function setCollection<T>(key: string, data: T[]): Promise<void> {
  await storageImpl.setItem(key, JSON.stringify(data));
}

// --- 퀴즈 결과 타입 (저장용) ---

export interface StoredQuizResult {
  resultId: number;
  wordId: number;
  isCorrect: boolean;
  quizType: string;
  answerType?: string; // 'subjective' | 'multiple_choice'
  word?: string;
  correctAnswer?: string;
  userAnswer?: string;
  takenAt: string;
}

// --- 카테고리 저장소 ---

export const categoryStorage = {
  async getAll(): Promise<Category[]> {
    return getCollection<Category>(CATEGORIES_KEY);
  },

  async getById(id: number): Promise<Category | undefined> {
    const categories = await this.getAll();
    return categories.find((c) => c.categoryId === id);
  },

  async create(data: CategoryRequest): Promise<Category> {
    const categories = await this.getAll();
    const now = new Date().toISOString();
    const newCategory: Category = {
      categoryId: await getNextId(),
      categoryName: data.categoryName,
      description: data.description,
      displayOrder: data.displayOrder ?? categories.length + 1,
      createdAt: now,
      updatedAt: now,
    };
    categories.push(newCategory);
    await setCollection(CATEGORIES_KEY, categories);
    return newCategory;
  },

  async update(id: number, data: CategoryRequest): Promise<Category> {
    const categories = await this.getAll();
    const index = categories.findIndex((c) => c.categoryId === id);
    if (index === -1) throw new Error('카테고리를 찾을 수 없습니다');
    categories[index] = {
      ...categories[index],
      categoryName: data.categoryName,
      description: data.description,
      displayOrder: data.displayOrder ?? categories[index].displayOrder,
      updatedAt: new Date().toISOString(),
    };
    await setCollection(CATEGORIES_KEY, categories);
    return categories[index];
  },

  async delete(id: number): Promise<void> {
    let categories = await this.getAll();
    categories = categories.filter((c) => c.categoryId !== id);
    await setCollection(CATEGORIES_KEY, categories);
    // 해당 카테고리의 단어도 삭제
    let words = await getCollection<Word>(WORDS_KEY);
    words = words.filter((w) => w.categoryId !== id);
    await setCollection(WORDS_KEY, words);
  },

  async reorder(orders: Array<{ categoryId: number; displayOrder: number }>): Promise<void> {
    const categories = await this.getAll();
    for (const order of orders) {
      const cat = categories.find((c) => c.categoryId === order.categoryId);
      if (cat) cat.displayOrder = order.displayOrder;
    }
    categories.sort((a, b) => a.displayOrder - b.displayOrder);
    await setCollection(CATEGORIES_KEY, categories);
  },
};

// --- 단어 저장소 ---

export const wordStorage = {
  async getAll(): Promise<Word[]> {
    return getCollection<Word>(WORDS_KEY);
  },

  async getByCategoryId(categoryId: number): Promise<Word[]> {
    const words = await this.getAll();
    return words.filter((w) => w.categoryId === categoryId);
  },

  async getById(id: number): Promise<Word | undefined> {
    const words = await this.getAll();
    return words.find((w) => w.wordId === id);
  },

  async create(data: WordRequest): Promise<Word> {
    const words = await this.getAll();
    const now = new Date().toISOString();
    const newWord: Word = {
      wordId: await getNextId(),
      categoryId: data.categoryId,
      word: data.word,
      meanings: data.meanings,
      examples: data.examples || [],
      tags: data.tags ?? [],
      memo: data.memo ?? '',
      createdAt: now,
      updatedAt: now,
    };
    words.push(newWord);
    await setCollection(WORDS_KEY, words);
    return newWord;
  },

  async update(id: number, data: WordRequest): Promise<Word> {
    const words = await this.getAll();
    const index = words.findIndex((w) => w.wordId === id);
    if (index === -1) throw new Error('단어를 찾을 수 없습니다');
    words[index] = {
      ...words[index],
      categoryId: data.categoryId,
      word: data.word,
      meanings: data.meanings,
      examples: data.examples || [],
      tags: data.tags ?? [],
      memo: data.memo ?? '',
      updatedAt: new Date().toISOString(),
    };
    await setCollection(WORDS_KEY, words);
    return words[index];
  },

  async delete(id: number): Promise<void> {
    let words = await this.getAll();
    words = words.filter((w) => w.wordId !== id);
    await setCollection(WORDS_KEY, words);
  },
};

// --- 퀴즈 결과 저장소 ---

export const quizResultStorage = {
  async getAll(): Promise<StoredQuizResult[]> {
    return getCollection<StoredQuizResult>(QUIZ_RESULTS_KEY);
  },

  async saveResults(
    results: Array<{
      wordId: number;
      isCorrect: boolean;
      quizType: string;
      answerType?: string;
      word?: string;
      correctAnswer?: string;
      userAnswer?: string;
    }>,
  ): Promise<void> {
    const existing = await this.getAll();
    const now = new Date().toISOString();
    const newResults: StoredQuizResult[] = [];
    for (const r of results) {
      newResults.push({
        resultId: await getNextId(),
        wordId: r.wordId,
        isCorrect: r.isCorrect,
        quizType: r.quizType,
        answerType: r.answerType,
        word: r.word,
        correctAnswer: r.correctAnswer,
        userAnswer: r.userAnswer,
        takenAt: now,
      });
    }
    await setCollection(QUIZ_RESULTS_KEY, [...existing, ...newResults]);
  },
};

// --- 전체 초기화 (디버깅/리셋용) ---

export async function clearAllData(): Promise<void> {
  const keys = [CATEGORIES_KEY, WORDS_KEY, QUIZ_RESULTS_KEY, NEXT_ID_KEY];
  if (isWeb) {
    for (const key of keys) {
      await storageImpl.removeItem(key);
    }
  } else {
    await AsyncStorage.multiRemove(keys);
  }
}
