import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { categoryService } from '../services/categoryService';
import { wordService } from '../services/wordService';
import type { Category } from '../types/word';
import Toast from '../components/Toast';
import { useToast } from '../hooks/useToast';
import ScreenHeader from '../components/ScreenHeader';

interface AddWordScreenProps {
  wordId?: number | null;
  onWordAdded: () => void;
  onBack: () => void;
}

export default function AddWordScreen({ wordId, onWordAdded, onBack }: AddWordScreenProps) {
  const { toast, showToast, hideToast } = useToast();
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [word, setWord] = useState('');
  const [pronunciation, setPronunciation] = useState('');
  const [meanings, setMeanings] = useState<string[]>(['']);
  const [examples, setExamples] = useState<{ example: string; translation: string }[]>([
    { example: '', translation: '' },
  ]);
  const [loading, setLoading] = useState(false);
  const [loadingCategories, setLoadingCategories] = useState(true);
  const [loadingWord, setLoadingWord] = useState(false);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);

  const isEditMode = !!wordId;

  useEffect(() => {
    loadCategories();
  }, []);

  useEffect(() => {
    if (wordId) {
      loadWord(wordId);
    }
  }, [wordId]);

  const loadCategories = async () => {
    try {
      setLoadingCategories(true);
      const data = await categoryService.getCategories();
      setCategories(data);
      if (data.length > 0 && !wordId) {
        setSelectedCategoryId(data[0].categoryId);
      }
    } catch (error: any) {
      console.error('카테고리 조회 실패:', error);
      showToast('카테고리를 불러오는데 실패했습니다', 'error');
    } finally {
      setLoadingCategories(false);
    }
  };

  const loadWord = async (id: number) => {
    try {
      setLoadingWord(true);
      const wordData = await wordService.getWord(id);
      setSelectedCategoryId(wordData.categoryId);
      setWord(wordData.word);
      setPronunciation(wordData.pronunciation || '');
      setMeanings(wordData.meanings.length > 0 ? wordData.meanings : ['']);
      setExamples(
        wordData.examples && wordData.examples.length > 0
          ? wordData.examples.map(ex => ({ example: ex.example, translation: ex.translation || '' }))
          : [{ example: '', translation: '' }]
      );
    } catch (error: any) {
      console.error('단어 조회 실패:', error);
      showToast('단어를 불러오는데 실패했습니다', 'error');
    } finally {
      setLoadingWord(false);
    }
  };

  const addMeaning = () => {
    setMeanings([...meanings, '']);
  };

  const removeMeaning = (index: number) => {
    if (meanings.length > 1) {
      const newMeanings = meanings.filter((_, i) => i !== index);
      setMeanings(newMeanings);
    }
  };

  const updateMeaning = (index: number, value: string) => {
    const newMeanings = [...meanings];
    newMeanings[index] = value;
    setMeanings(newMeanings);
  };

  const addExample = () => {
    setExamples([...examples, { example: '', translation: '' }]);
  };

  const removeExample = (index: number) => {
    if (examples.length > 1) {
      const newExamples = examples.filter((_, i) => i !== index);
      setExamples(newExamples);
    }
  };

  const updateExample = (index: number, field: 'example' | 'translation', value: string) => {
    const newExamples = [...examples];
    newExamples[index][field] = value;
    setExamples(newExamples);
  };

  const handleSave = () => {
    // 유효성 검사
    if (!selectedCategoryId) {
      showToast('카테고리를 선택해주세요', 'error');
      return;
    }

    if (!word.trim()) {
      showToast('단어를 입력해주세요', 'error');
      return;
    }

    const filteredMeanings = meanings.filter((m) => m.trim());
    if (filteredMeanings.length === 0) {
      showToast('최소 하나의 뜻을 입력해주세요', 'error');
      return;
    }

    // 수정 시 confirm
    if (isEditMode && wordId) {
      Alert.alert('확인', '단어를 수정하시겠습니까?', [
        { text: '취소', style: 'cancel' },
        {
          text: '수정',
          onPress: () => performSave(),
        },
      ]);
    } else {
      // 추가는 바로 실행
      performSave();
    }
  };

  const performSave = async () => {
    // 카테고리 선택 확인 (타입 가드)
    if (!selectedCategoryId) {
      showToast('카테고리를 선택해주세요', 'error');
      return;
    }

    const filteredMeanings = meanings.filter((m) => m.trim());
    const filteredExamples = examples.filter((e) => e.example.trim());

    setLoading(true);
    try {
      if (isEditMode && wordId) {
        // 수정
        await wordService.updateWord(wordId, {
          categoryId: selectedCategoryId,
          word: word.trim(),
          pronunciation: pronunciation.trim() || undefined,
          meanings: filteredMeanings,
          examples: filteredExamples,
        });
        showToast('단어가 수정되었습니다', 'success');
        onWordAdded();
      } else {
        // 추가
        await wordService.createWord({
          categoryId: selectedCategoryId,
          word: word.trim(),
          pronunciation: pronunciation.trim() || undefined,
          meanings: filteredMeanings,
          examples: filteredExamples,
        });
        showToast('단어가 추가되었습니다', 'success');
        onWordAdded();
      }
    } catch (error: any) {
      console.error('단어 저장 실패:', error);
      showToast(error.message || '단어 저장에 실패했습니다', 'error');
    } finally {
      setLoading(false);
    }
  };

  const selectedCategory = categories.find((c) => c.categoryId === selectedCategoryId);

  if (loadingCategories || loadingWord) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#6366F1" />
        <Text style={styles.loadingText}>
          {loadingWord ? '단어 로딩 중...' : '카테고리 로딩 중...'}
        </Text>
      </View>
    );
  }

  if (categories.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <StatusBar style="dark" />
        <Text style={styles.emptyIcon}>📂</Text>
        <Text style={styles.emptyTitle}>카테고리가 없습니다</Text>
        <Text style={styles.emptySubtitle}>먼저 카테고리를 생성해주세요</Text>
        <TouchableOpacity style={styles.backButton} onPress={onBack}>
          <Text style={styles.backButtonText}>돌아가기</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      <ScreenHeader title={isEditMode ? '단어 수정' : '단어 추가'} onBack={onBack} />

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {/* 카테고리 선택 */}
        <View style={styles.section}>
          <Text style={styles.label}>카테고리 *</Text>
          <TouchableOpacity
            style={styles.categorySelector}
            onPress={() => setShowCategoryPicker(true)}
            disabled={loading}
          >
            <Text style={styles.categorySelectorText}>
              {selectedCategory?.categoryName || '카테고리 선택'}
            </Text>
            <Text style={styles.categorySelectorIcon}>▼</Text>
          </TouchableOpacity>

          <Modal
            visible={showCategoryPicker}
            transparent
            animationType="fade"
            onRequestClose={() => setShowCategoryPicker(false)}
          >
            <TouchableOpacity
              style={styles.modalOverlay}
              activeOpacity={1}
              onPress={() => setShowCategoryPicker(false)}
            >
              <View style={styles.modalContent}>
                <Text style={styles.modalTitle}>카테고리 선택</Text>
                <ScrollView style={styles.categoryList}>
                  {categories.map((category) => (
                    <TouchableOpacity
                      key={category.categoryId}
                      style={[
                        styles.categoryOption,
                        selectedCategoryId === category.categoryId && styles.categoryOptionSelected,
                      ]}
                      onPress={() => {
                        setSelectedCategoryId(category.categoryId);
                        setShowCategoryPicker(false);
                      }}
                    >
                      <Text
                        style={[
                          styles.categoryOptionText,
                          selectedCategoryId === category.categoryId &&
                            styles.categoryOptionTextSelected,
                        ]}
                      >
                        {category.categoryName}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            </TouchableOpacity>
          </Modal>
        </View>

        {/* 단어 입력 */}
        <View style={styles.section}>
          <Text style={styles.label}>단어 *</Text>
          <TextInput
            style={styles.input}
            placeholder="단어를 입력하세요"
            value={word}
            onChangeText={(text) => setWord(text.length > 0 ? text[0].toLowerCase() + text.slice(1) : text)}
            autoCapitalize="none"
            editable={!loading}
          />
        </View>

        {/* 발음 입력 */}
        <View style={styles.section}>
          <Text style={styles.label}>발음 (선택)</Text>
          <TextInput
            style={styles.input}
            placeholder="발음을 입력하세요"
            value={pronunciation}
            onChangeText={setPronunciation}
            editable={!loading}
          />
        </View>

        {/* 뜻 입력 */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.label}>뜻 *</Text>
            <TouchableOpacity onPress={addMeaning} disabled={loading} style={styles.addButton}>
              <Text style={styles.addButtonText}>+ 추가</Text>
            </TouchableOpacity>
          </View>

          {meanings.map((meaning, index) => (
            <View key={index} style={styles.listItem}>
              <TextInput
                style={[styles.input, styles.listItemInput]}
                placeholder={`뜻 ${index + 1}`}
                value={meaning}
                onChangeText={(value) => updateMeaning(index, value)}
                editable={!loading}
              />
              {meanings.length > 1 && (
                <TouchableOpacity
                  onPress={() => removeMeaning(index)}
                  disabled={loading}
                  style={styles.removeButton}
                >
                  <Text style={styles.removeButtonText}>✕</Text>
                </TouchableOpacity>
              )}
            </View>
          ))}
        </View>

        {/* 예문 입력 */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.label}>예문 (선택)</Text>
            <TouchableOpacity onPress={addExample} disabled={loading} style={styles.addButton}>
              <Text style={styles.addButtonText}>+ 추가</Text>
            </TouchableOpacity>
          </View>

          {examples.map((example, index) => (
            <View key={index} style={styles.exampleItem}>
              <View style={styles.exampleHeader}>
                <Text style={styles.exampleNumber}>예문 {index + 1}</Text>
                {examples.length > 1 && (
                  <TouchableOpacity
                    onPress={() => removeExample(index)}
                    disabled={loading}
                    style={styles.removeButton}
                  >
                    <Text style={styles.removeButtonText}>✕</Text>
                  </TouchableOpacity>
                )}
              </View>
              <TextInput
                style={[styles.input, styles.exampleInput]}
                placeholder="예문"
                value={example.example}
                onChangeText={(value) => {
                  const formatted = value.length > 0 ? value[0].toUpperCase() + value.slice(1) : value;
                  updateExample(index, 'example', formatted);
                }}
                autoCapitalize="sentences"
                multiline
                editable={!loading}
              />
              <TextInput
                style={[styles.input, styles.exampleInput]}
                placeholder="번역 (선택)"
                value={example.translation}
                onChangeText={(value) => updateExample(index, 'translation', value)}
                multiline
                editable={!loading}
              />
            </View>
          ))}
        </View>

        {/* 저장 버튼 */}
        <TouchableOpacity
          style={[styles.saveButton, loading && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.saveButtonText}>저장</Text>
          )}
        </TouchableOpacity>
      </ScrollView>

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
  loadingContainer: {
    flex: 1,
    backgroundColor: '#F8F9FA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#6B7280',
  },
  emptyContainer: {
    flex: 1,
    backgroundColor: '#F8F9FA',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1A1A1A',
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 24,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    color: '#1A1A1A',
  },
  categorySelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    padding: 12,
  },
  categorySelectorText: {
    fontSize: 15,
    color: '#1A1A1A',
  },
  categorySelectorIcon: {
    fontSize: 12,
    color: '#6B7280',
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
    borderRadius: 12,
    width: '100%',
    maxWidth: 400,
    maxHeight: '60%',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1A1A1A',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  categoryList: {
    maxHeight: 300,
  },
  categoryOption: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  categoryOptionSelected: {
    backgroundColor: '#EEF2FF',
  },
  categoryOptionText: {
    fontSize: 15,
    color: '#374151',
  },
  categoryOptionTextSelected: {
    color: '#6366F1',
    fontWeight: '600',
  },
  addButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#C4B5FD',
    borderRadius: 6,
  },
  addButtonText: {
    fontSize: 13,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  listItemInput: {
    flex: 1,
    marginRight: 8,
  },
  removeButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FECACA',
    borderRadius: 16,
  },
  removeButtonText: {
    fontSize: 16,
    color: '#F87171',
    fontWeight: 'bold',
  },
  exampleItem: {
    marginBottom: 16,
    padding: 12,
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
  },
  exampleHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  exampleNumber: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B7280',
  },
  exampleInput: {
    marginBottom: 8,
  },
  saveButton: {
    backgroundColor: '#C4B5FD',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 24,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  backButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: '#C4B5FD',
    borderRadius: 8,
  },
  backButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
});
