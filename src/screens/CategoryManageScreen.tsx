import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
  ActivityIndicator,
  Platform,
  Modal,
  RefreshControl,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { categoryService } from '../services/categoryService';
import type { Category } from '../types/word';
import Toast from '../components/Toast';
import { useToast } from '../hooks/useToast';
import ScreenHeader from '../components/ScreenHeader';
import { CategoryCardSkeleton } from '../components/SkeletonLoader';
import { useTheme } from '../contexts/ThemeContext';

interface CategoryManageScreenProps {
  onBack: () => void;
}

export default function CategoryManageScreen({ onBack }: CategoryManageScreenProps) {
  const { colors } = useTheme();
  const { toast, showToast, hideToast } = useToast();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [categoryName, setCategoryName] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  const descriptionRef = useRef<TextInput>(null);

  useEffect(() => {
    loadCategories();
  }, []);

  const loadCategories = async () => {
    try {
      setLoading(true);
      const data = await categoryService.getCategories();
      setCategories(data);
    } catch (error: any) {
      console.warn('카테고리 조회 실패:', error);
      showToast('카테고리를 불러오는데 실패했습니다', 'error');
    } finally {
      setLoading(false);
    }
  };

  const openCreateModal = () => {
    setEditingCategory(null);
    setCategoryName('');
    setDescription('');
    setModalVisible(true);
  };

  const openEditModal = (category: Category) => {
    setEditingCategory(category);
    setCategoryName(category.categoryName);
    setDescription(category.description || '');
    setModalVisible(true);
  };

  const closeModal = () => {
    setModalVisible(false);
    setEditingCategory(null);
    setCategoryName('');
    setDescription('');
  };

  const handleSave = async () => {
    if (saving) return; // 이중 방어

    if (!categoryName.trim()) {
      showToast('카테고리 이름을 입력해주세요', 'error');
      return;
    }

    setSaving(true);
    try {
      if (editingCategory) {
        // 수정
        await categoryService.updateCategory(editingCategory.categoryId, {
          categoryName: categoryName.trim(),
          description: description.trim() || undefined,
          displayOrder: editingCategory.displayOrder,
        });
        showToast('카테고리가 수정되었습니다', 'success');
      } else {
        // 생성
        await categoryService.createCategory({
          categoryName: categoryName.trim(),
          description: description.trim() || undefined,
        });
        showToast('카테고리가 생성되었습니다', 'success');
      }
      closeModal();
      loadCategories();
    } catch (error: any) {
      console.warn('카테고리 저장 실패:', error);
      showToast(error.message || '카테고리 저장에 실패했습니다', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (category: Category) => {
    Alert.alert(
      '카테고리 삭제',
      `"${category.categoryName}" 카테고리를 삭제하시겠습니까?\n\n⚠️ 해당 카테고리의 모든 단어도 함께 삭제됩니다.`,
      [
        { text: '취소', style: 'cancel' },
        {
          text: '삭제',
          style: 'destructive',
          onPress: async () => {
            try {
              await categoryService.deleteCategory(category.categoryId);
              showToast('카테고리가 삭제되었습니다', 'success');
              loadCategories();
            } catch (error: any) {
              console.warn('카테고리 삭제 실패:', error);
              showToast(error.message || '카테고리 삭제에 실패했습니다', 'error');
            }
          },
        },
      ]
    );
  };

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await loadCategories();
    } finally {
      setRefreshing(false);
    }
  };

  const moveCategory = async (index: number, direction: 'up' | 'down') => {
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= categories.length) return;

    // 로컬 상태 업데이트
    const newCategories = [...categories];
    [newCategories[index], newCategories[newIndex]] = [
      newCategories[newIndex],
      newCategories[index],
    ];
    setCategories(newCategories);

    // API 호출하여 순서 저장
    try {
      await categoryService.reorderCategories(
        newCategories.map((cat, idx) => ({
          categoryId: cat.categoryId,
          displayOrder: idx + 1,
        }))
      );
    } catch (error: any) {
      console.warn('카테고리 순서 변경 실패:', error);
      showToast('카테고리 순서 변경에 실패했습니다', 'error');
      loadCategories(); // 실패 시 다시 로드
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <StatusBar style={colors.isDark ? 'light' : 'dark'} />
        <ScreenHeader title="카테고리 관리" onBack={onBack} />
        <View style={[styles.skeletonAddButton, { backgroundColor: colors.border }]}>
          <View style={styles.skeletonBar} />
        </View>
        <View style={{ padding: 16, paddingTop: 0 }}>
          {[1, 2, 3, 4].map((i) => (
            <CategoryCardSkeleton key={i} />
          ))}
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style={colors.isDark ? 'light' : 'dark'} />
      <ScreenHeader title="카테고리 관리" onBack={onBack} />

      {/* 추가 버튼 */}
      <TouchableOpacity style={[styles.addButton, { backgroundColor: colors.accent }]} onPress={openCreateModal}>
        <Text style={styles.addButtonText}>+ 카테고리 추가</Text>
      </TouchableOpacity>

      {/* 카테고리 목록 */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[colors.primary]}
            tintColor={colors.primary}
          />
        }
      >
        {categories.length === 0 ? (
          <View style={styles.emptyContainer}>
            <MaterialIcons name="folder-open" size={64} color={colors.textTertiary} />
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>등록된 카테고리가 없습니다</Text>
            <Text style={[styles.emptyHint, { color: colors.textTertiary }]}>카테고리를 추가해보세요</Text>
          </View>
        ) : (
          categories.map((category, index) => (
            <View key={category.categoryId} style={[styles.categoryCard, { backgroundColor: colors.card }]}>
              {/* 순서 변경 버튼 */}
              <View style={styles.orderButtons}>
                <TouchableOpacity
                  onPress={() => moveCategory(index, 'up')}
                  disabled={index === 0}
                  style={[styles.orderButton, { backgroundColor: colors.borderLight }, index === 0 && styles.orderButtonDisabled]}
                >
                  <MaterialIcons name="arrow-drop-up" size={20} color={index === 0 ? '#9CA3AF' : colors.primary} />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => moveCategory(index, 'down')}
                  disabled={index === categories.length - 1}
                  style={[
                    styles.orderButton,
                    { backgroundColor: colors.borderLight },
                    index === categories.length - 1 && styles.orderButtonDisabled,
                  ]}
                >
                  <MaterialIcons name="arrow-drop-down" size={20} color={index === categories.length - 1 ? '#9CA3AF' : colors.primary} />
                </TouchableOpacity>
              </View>

              {/* 카테고리 정보 */}
              <View style={styles.categoryInfo}>
                <View style={styles.categoryNameRow}>
                  <Text style={[styles.categoryNameText, { color: colors.text }]}>{category.categoryName}</Text>
                  {category.wordCount != null && (
                    <Text style={[styles.categoryWordCountBadge, { color: colors.primary, backgroundColor: colors.primaryLight }]}>{category.wordCount}개</Text>
                  )}
                </View>
                {category.description && (
                  <Text style={[styles.categoryDescription, { color: colors.textSecondary }]}>{category.description}</Text>
                )}
              </View>

              {/* 수정/삭제 버튼 */}
              <View style={styles.categoryActions}>
                <TouchableOpacity
                  style={[styles.editButton, { backgroundColor: colors.primaryLight }]}
                  onPress={() => openEditModal(category)}
                >
                  <Text style={[styles.editButtonText, { color: colors.primary }]}>수정</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.deleteButton}
                  onPress={() => handleDelete(category)}
                >
                  <Text style={styles.deleteButtonText}>삭제</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}
      </ScrollView>

      {/* 추가/수정 모달 */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={closeModal}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>
              {editingCategory ? '카테고리 수정' : '카테고리 추가'}
            </Text>

            <View style={styles.modalForm}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>카테고리 이름 *</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
                placeholder="예: 영어, 일본어, 중국어"
                placeholderTextColor={colors.textTertiary}
                value={categoryName}
                onChangeText={setCategoryName}
                autoCorrect={false}
                returnKeyType="next"
                blurOnSubmit={false}
                onSubmitEditing={() => descriptionRef.current?.focus()}
                editable={!saving}
                maxLength={20}
              />

              <Text style={[styles.label, { color: colors.textSecondary }]}>설명 (선택)</Text>
              <TextInput
                ref={descriptionRef}
                style={[styles.input, styles.textArea, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
                placeholder="카테고리 설명"
                placeholderTextColor={colors.textTertiary}
                value={description}
                onChangeText={setDescription}
                autoCorrect={false}
                multiline
                numberOfLines={3}
                maxLength={200}
                editable={!saving}
              />
            </View>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalCancelButton, { backgroundColor: colors.border }]}
                onPress={closeModal}
                disabled={saving}
              >
                <Text style={[styles.modalCancelButtonText, { color: colors.textSecondary }]}>취소</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalSaveButton, { backgroundColor: colors.accent }, saving && styles.modalButtonDisabled]}
                onPress={handleSave}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.modalSaveButtonText}>저장</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Toast
        message={toast.message}
        type={toast.type}
        visible={toast.visible}
        onHide={hideToast}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  addButton: {
    backgroundColor: '#C4B5FD',
    margin: 16,
    padding: 14,
    borderRadius: 16,
    alignItems: 'center',
  },
  addButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  skeletonAddButton: {
    margin: 16,
    padding: 14,
    backgroundColor: '#E5E7EB',
    borderRadius: 16,
    alignItems: 'center',
  },
  skeletonBar: {
    height: 16,
    backgroundColor: '#D1D5DB',
    borderRadius: 4,
    width: '40%',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingTop: 0,
  },
  emptyContainer: {
    padding: 40,
    alignItems: 'center',
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  emptyText: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 4,
  },
  emptyHint: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  categoryCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    ...Platform.select({
      web: { boxShadow: '0 2px 12px rgba(0, 0, 0, 0.08)' },
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 12,
        elevation: 4,
      },
    }),
  },
  orderButtons: {
    flexDirection: 'column',
    marginRight: 12,
    gap: 4,
  },
  orderButton: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F3F4F6',
    borderRadius: 4,
  },
  orderButtonDisabled: {
    opacity: 0.3,
  },
  orderButtonText: {
    fontSize: 12,
    color: '#6366F1',
    fontWeight: 'bold',
  },
  orderButtonTextDisabled: {
    color: '#9CA3AF',
  },
  categoryInfo: {
    flex: 1,
  },
  categoryNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  categoryNameText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  categoryWordCountBadge: {
    fontSize: 12,
    color: '#6366F1',
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    overflow: 'hidden',
    fontWeight: '600',
  },
  categoryDescription: {
    fontSize: 14,
    color: '#6B7280',
  },
  categoryActions: {
    flexDirection: 'row',
    gap: 8,
  },
  editButton: {
    backgroundColor: '#E9D5FF',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  editButtonText: {
    color: '#A78BFA',
    fontSize: 14,
    fontWeight: '600',
  },
  deleteButton: {
    backgroundColor: '#FECACA',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  deleteButtonText: {
    color: '#F87171',
    fontSize: 14,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    width: '100%',
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1A1A1A',
    marginBottom: 20,
  },
  modalForm: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 16,
    padding: 12,
    fontSize: 15,
    color: '#1A1A1A',
    marginBottom: 16,
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  modalButton: {
    flex: 1,
    padding: 14,
    borderRadius: 16,
    alignItems: 'center',
  },
  modalCancelButton: {
    backgroundColor: '#E5E7EB',
  },
  modalCancelButtonText: {
    color: '#374151',
    fontSize: 15,
    fontWeight: '600',
  },
  modalSaveButton: {
    backgroundColor: '#C4B5FD',
  },
  modalSaveButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  modalButtonDisabled: {
    opacity: 0.6,
  },
});
