import i18n from '../i18n';
import { LAST_CATEGORY_KEY } from '../constants/appConfig';
import { categoryStorage, readRaw, wordStorage, writeRaw } from '../utils/storage';
import { normalizeForCompare } from '../utils/text';
import { syncScheduler } from './syncScheduler';
import type { Category, CategoryRequest } from '../types/word';

/**
 * 단어 추가 화면이 처음 보여 줄 카테고리. **순수 함수다.**
 *
 * 🔴 **마지막에 쓴 것이 아직 있으면 그것, 없으면 첫 번째다.**
 *    지워진 카테고리 id 를 그대로 돌려주면 화면이 「카테고리 선택」인 채로 멈추고
 *    저장 버튼이 *"카테고리를 선택해주세요"* 로 막는다 — 사용자는 뭘 안 골랐는지 모른다.
 *    (`QuizSetupScreen.canResume` 이 지난 설정을 쓸 때 같은 검사를 한다)
 */
export function pickDefaultCategory(
  categories: readonly Category[],
  lastId: number | null,
): number | null {
  if (categories.length === 0) return null;
  if (lastId !== null && categories.some((c) => c.categoryId === lastId)) return lastId;
  return categories[0].categoryId;
}

/** 저장된 값을 숫자로. 🔴 어떤 입력에도 던지지 않는다 */
export function parseLastCategory(raw: string | null): number | null {
  if (raw === null) return null;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export const categoryService = {
  /** 마지막으로 쓴 카테고리. 없거나 깨졌으면 `null` */
  async loadLastCategoryId(): Promise<number | null> {
    return parseLastCategory(await readRaw(LAST_CATEGORY_KEY));
  },

  /** ⚠ 실패해도 삼킨다 — 취향 한 줄 때문에 단어 저장이 실패하면 안 된다 */
  async saveLastCategoryId(id: number): Promise<void> {
    try {
      await writeRaw(LAST_CATEGORY_KEY, String(id));
    } catch (error: any) {
      console.warn('마지막 카테고리 저장 실패:', error);
    }
  },

  async getCategories(): Promise<Category[]> {
    const categories = await categoryStorage.getAll();
    const allWords = await wordStorage.getAll();
    return categories
      .sort((a, b) => a.displayOrder - b.displayOrder)
      .map((cat) => ({
        ...cat,
        wordCount: allWords.filter((w) => w.categoryId === cat.categoryId).length,
      }));
  },

  async getCategory(id: number): Promise<Category> {
    const category = await categoryStorage.getById(id);
    if (!category) throw new Error(i18n.t('카테고리를 찾을 수 없습니다'));
    const words = await wordStorage.getByCategoryId(id);
    return { ...category, wordCount: words.length };
  },

  async createCategory(data: CategoryRequest): Promise<Category> {
    const existing = await categoryStorage.getAll();
    const target = normalizeForCompare(data.categoryName);
    const duplicate = existing.find((c) => normalizeForCompare(c.categoryName) === target);
    if (duplicate) {
      throw new Error(i18n.t('이미 같은 이름의 카테고리가 존재합니다'));
    }
    const made = await categoryStorage.create(data);
    /*
     * ⚠ **단어장은 아직 서버로 가지 않는다**(`ENABLED_KINDS` 가 막는다 · 처리방침 시행 10-20).
     *   그래도 지금 걸어 두는 이유는, 켜는 사람이 `ENABLED_KINDS` 한 줄만 고칠 것이고
     *   그때 **부르는 곳이 없으면 공시는 넓어졌는데 아무것도 안 밀린다.**
     *   꺼져 있는 동안 이 호출은 타이머만 걸고 아무것도 보내지 않는다.
     */
    syncScheduler.schedule();
    return made;
  },

  async updateCategory(id: number, data: CategoryRequest): Promise<Category> {
    const existing = await categoryStorage.getAll();
    const target = normalizeForCompare(data.categoryName);
    const duplicate = existing.find(
      (c) => c.categoryId !== id && normalizeForCompare(c.categoryName) === target,
    );
    if (duplicate) {
      throw new Error(i18n.t('이미 같은 이름의 카테고리가 존재합니다'));
    }
    const saved = await categoryStorage.update(id, data);
    syncScheduler.schedule();
    return saved;
  },

  async deleteCategory(id: number): Promise<void> {
    await categoryStorage.delete(id);
    // 🔴 그 안의 단어도 함께 묘비가 된다 — 단어 쪽은 지금도 서버로 간다
    syncScheduler.schedule();
  },

  async reorderCategories(
    orders: Array<{ categoryId: number; displayOrder: number }>,
  ): Promise<void> {
    await categoryStorage.reorder(orders);
    syncScheduler.schedule();
  },
};
