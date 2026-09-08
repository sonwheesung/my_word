import i18n from '../i18n';
import { wordStorage } from '../utils/storage';
import { normalizeForCompare } from '../utils/text';
import type { Word, WordRequest } from '../types/word';

export const wordService = {
  /**
   * 카테고리 안의 단어. **인자를 생략하면 전체**를 준다.
   *
   * 원래 필수였다. 간격 반복의 복습 큐가 카테고리를 가로지르므로 열었다 —
   * 덤으로 객관식 오답 보기의 후보 풀도 넓어져, 단어가 3~4개뿐인 카테고리에서
   * `기억나지 않음` 같은 더미 보기가 나오던 것이 사라진다.
   */
  async getWords(categoryId?: number): Promise<Word[]> {
    if (categoryId === undefined) return wordStorage.getAll();
    return wordStorage.getByCategoryId(categoryId);
  },

  async getWord(id: number): Promise<Word> {
    const word = await wordStorage.getById(id);
    if (!word) throw new Error(i18n.t('단어를 찾을 수 없습니다'));
    return word;
  },

  async checkDuplicate(word: string, categoryId: number, excludeWordId?: number): Promise<Word | null> {
    const words = await wordStorage.getByCategoryId(categoryId);
    const target = normalizeForCompare(word);
    return words.find(
      (w) => normalizeForCompare(w.word) === target && w.wordId !== excludeWordId,
    ) || null;
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
