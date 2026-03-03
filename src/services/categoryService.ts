import { categoryStorage, wordStorage } from '../utils/storage';
import type { Category, CategoryRequest } from '../types/word';

export const categoryService = {
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
    if (!category) throw new Error('카테고리를 찾을 수 없습니다');
    const words = await wordStorage.getByCategoryId(id);
    return { ...category, wordCount: words.length };
  },

  async createCategory(data: CategoryRequest): Promise<Category> {
    const existing = await categoryStorage.getAll();
    const duplicate = existing.find(
      (c) => c.categoryName.trim().toLowerCase() === data.categoryName.trim().toLowerCase(),
    );
    if (duplicate) {
      throw new Error('이미 같은 이름의 카테고리가 존재합니다');
    }
    return categoryStorage.create(data);
  },

  async updateCategory(id: number, data: CategoryRequest): Promise<Category> {
    const existing = await categoryStorage.getAll();
    const duplicate = existing.find(
      (c) =>
        c.categoryId !== id &&
        c.categoryName.trim().toLowerCase() === data.categoryName.trim().toLowerCase(),
    );
    if (duplicate) {
      throw new Error('이미 같은 이름의 카테고리가 존재합니다');
    }
    return categoryStorage.update(id, data);
  },

  async deleteCategory(id: number): Promise<void> {
    return categoryStorage.delete(id);
  },

  async reorderCategories(
    orders: Array<{ categoryId: number; displayOrder: number }>,
  ): Promise<void> {
    return categoryStorage.reorder(orders);
  },
};
