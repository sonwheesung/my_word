import i18n from '../i18n';
import { wordStorage } from '../utils/storage';
import { normalizeForCompare } from '../utils/text';
import { syncScheduler } from './syncScheduler';
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

  /*
   * 🔴 **쓰고 나면 서버로 밀 것을 예약한다**(2026-10-13).
   *
   *    `syncScheduler.schedule()` 은 **3초 뒤에 한 번** 민다. 연달아 넣으면 계속 미뤄져
   *    마지막 입력 3초 뒤에 **한 번에** 간다 — 10개를 넣어도 요청은 하나다.
   *
   * ⚠ **await 하지 않는다.** 저장 버튼의 반응이 통신을 기다리면 안 된다.
   * ⚠ 실패해도 사용자에게 알리지 않는다 — 기기가 정본이라 아무것도 잃지 않는다.
   *    실패한 것은 `updated_at` 이 그대로 남아 다음 성공 때 함께 간다.
   */
  async createWord(data: WordRequest): Promise<Word> {
    const made = await wordStorage.create(data);
    syncScheduler.schedule();
    return made;
  },

  async updateWord(id: number, data: WordRequest): Promise<Word> {
    const saved = await wordStorage.update(id, data);
    syncScheduler.schedule();
    return saved;
  },

  async deleteWord(id: number): Promise<void> {
    await wordStorage.delete(id);
    // 🔴 삭제도 민다 — 묘비가 `updated_at` 을 올리므로 「지웠다」가 그대로 실려 간다
    syncScheduler.schedule();
  },
};
