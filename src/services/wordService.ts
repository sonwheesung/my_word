import { wordStorage } from '../utils/storage';
import type { Word, WordRequest } from '../types/word';

export const wordService = {
  async getWords(categoryId: number): Promise<Word[]> {
    return wordStorage.getByCategoryId(categoryId);
  },

  async getWord(id: number): Promise<Word> {
    const word = await wordStorage.getById(id);
    if (!word) throw new Error('단어를 찾을 수 없습니다');
    return word;
  },

  async createWord(data: WordRequest): Promise<Word> {
    return wordStorage.create(data);
  },

  async updateWord(id: number, data: WordRequest): Promise<Word> {
    return wordStorage.update(id, data);
  },

  async deleteWord(id: number): Promise<void> {
    return wordStorage.delete(id);
  },
};
