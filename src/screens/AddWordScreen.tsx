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
  Modal,
  Keyboard,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { categoryService } from '../services/categoryService';
import { wordService } from '../services/wordService';
import { dictionaryService } from '../services/dictionaryService';
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
  const [meanings, setMeanings] = useState<string[]>(['']);
  const [examples, setExamples] = useState<{ example: string; translation: string }[]>([
    { example: '', translation: '' },
  ]);
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [memo, setMemo] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingCategories, setLoadingCategories] = useState(true);
  const [loadingWord, setLoadingWord] = useState(false);
  const [searching, setSearching] = useState(false);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);

  const firstMeaningRef = useRef<TextInput>(null);

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
      console.warn('카테고리 조회 실패:', error);
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
      setMeanings(wordData.meanings.length > 0 ? wordData.meanings : ['']);
      setExamples(
        wordData.examples && wordData.examples.length > 0
          ? wordData.examples.map(ex => ({ example: ex.example, translation: ex.translation || '' }))
          : [{ example: '', translation: '' }]
      );
      setTags(wordData.tags ?? []);
      setMemo(wordData.memo ?? '');
    } catch (error: any) {
      console.warn('단어 조회 실패:', error);
      showToast('단어를 불러오는데 실패했습니다', 'error');
    } finally {
      setLoadingWord(false);
    }
  };

  const addMeaning = () => {
    if (meanings.length >= 10) {
      showToast('뜻은 최대 10개까지 추가할 수 있습니다', 'error');
      return;
    }
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
    if (examples.length >= 5) {
      showToast('예문은 최대 5개까지 추가할 수 있습니다', 'error');
      return;
    }
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

  const addTag = () => {
    const trimmed = tagInput.trim();
    if (!trimmed) return;
    if (tags.length >= 10) {
      showToast('태그는 최대 10개까지 추가할 수 있습니다', 'error');
      setTagInput('');
      return;
    }
    if (tags.some(t => t.toLowerCase() === trimmed.toLowerCase())) {
      showToast('이미 추가된 태그입니다', 'error');
      setTagInput('');
      return;
    }
    setTags([...tags, trimmed]);
    setTagInput('');
  };

  const removeTag = (index: number) => {
    setTags(tags.filter((_, i) => i !== index));
  };

  const handleDictionarySearch = async () => {
    if (searching) return;

    const trimmed = word.trim();
    if (!trimmed) {
      showToast('단어를 입력해주세요', 'error');
      return;
    }

    Keyboard.dismiss();
    setSearching(true);

    try {
      const result = await dictionaryService.lookup(trimmed);

      if (!result) {
        showToast('사전에서 단어를 찾을 수 없습니다', 'error');
        return;
      }

      // 기존 데이터 초기화 후 검색 결과로 덮어쓰기
      setMeanings(result.meanings.length > 0 ? result.meanings : ['']);
      setExamples(result.examples.length > 0 ? result.examples : [{ example: '', translation: '' }]);
      setTags(result.partOfSpeech);
      setMemo('');

      showToast(`뜻 ${result.meanings.length}개, 예문 ${result.examples.length}개를 가져왔습니다`, 'success');
    } catch (error: any) {
      console.warn('사전 검색 실패:', error);
      showToast(error.message || '사전 검색에 실패했습니다', 'error');
    } finally {
      setSearching(false);
    }
  };

  const handleSave = async () => {
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

    // 중복 단어 체크
    const duplicate = await wordService.checkDuplicate(
      word.trim(),
      selectedCategoryId,
      isEditMode ? wordId ?? undefined : undefined,
    );

    if (duplicate) {
      Alert.alert(
        '중복 단어',
        `"${word.trim()}" 단어가 이미 등록되어 있습니다.\n그래도 저장하시겠습니까?`,
        [
          { text: '취소', style: 'cancel' },
          { text: '저장', onPress: () => performSave() },
        ],
      );
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
      performSave();
    }
  };

  const performSave = async () => {
    if (loading) return; // 이중 방어

    // 카테고리 선택 확인 (타입 가드)
    if (!selectedCategoryId) {
      showToast('카테고리를 선택해주세요', 'error');
      return;
    }

    const filteredMeanings = meanings.filter((m) => m.trim()).map((m) => m.trim());
    const filteredExamples = examples
      .filter((e) => e.example.trim())
      .map((e) => ({ example: e.example.trim(), translation: e.translation.trim() }));

    setLoading(true);
    try {
      if (isEditMode && wordId) {
        // 수정
        await wordService.updateWord(wordId, {
          categoryId: selectedCategoryId,
          word: word.trim(),
          meanings: filteredMeanings,
          examples: filteredExamples,
          tags,
          memo: memo.trim(),
        });
        showToast('단어가 수정되었습니다', 'success');
        onWordAdded();
      } else {
        // 추가
        await wordService.createWord({
          categoryId: selectedCategoryId,
          word: word.trim(),
          meanings: filteredMeanings,
          examples: filteredExamples,
          tags,
          memo: memo.trim(),
        });
        showToast('단어가 추가되었습니다', 'success');
        onWordAdded();
      }
    } catch (error: any) {
      console.warn('단어 저장 실패:', error);
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

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
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
          <View style={styles.wordInputRow}>
            <TextInput
              style={[styles.input, styles.wordInput]}
              placeholder="단어를 입력하세요"
              value={word}
              onChangeText={(text) => setWord(text.length > 0 ? text[0].toLowerCase() + text.slice(1) : text)}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
              blurOnSubmit={false}
              onSubmitEditing={handleDictionarySearch}
              maxLength={100}
              editable={!loading && !searching}
            />
            <TouchableOpacity
              style={[styles.searchButton, (searching || !word.trim()) && styles.searchButtonDisabled]}
              onPress={handleDictionarySearch}
              disabled={searching || !word.trim() || loading}
            >
              {searching ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.searchButtonText}>검색</Text>
              )}
            </TouchableOpacity>
          </View>
          <Text style={styles.wordInputHint}>단어 입력 후 검색 버튼을 누르면 뜻과 예문을 자동으로 가져옵니다</Text>
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
                ref={index === 0 ? firstMeaningRef : undefined}
                style={[styles.input, styles.listItemInput]}
                placeholder={`뜻 ${index + 1}`}
                value={meaning}
                onChangeText={(value) => updateMeaning(index, value)}
                autoCorrect={false}
                maxLength={200}
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
                autoCorrect={false}
                multiline
                maxLength={300}
                editable={!loading}
              />
              <TextInput
                style={[styles.input, styles.exampleInput]}
                placeholder="번역 (선택)"
                value={example.translation}
                onChangeText={(value) => updateExample(index, 'translation', value)}
                autoCorrect={false}
                multiline
                maxLength={300}
                editable={!loading}
              />
            </View>
          ))}
        </View>

        {/* 태그 입력 */}
        <View style={styles.section}>
          <Text style={styles.label}>태그 (선택)</Text>
          {tags.length > 0 && (
            <View style={styles.tagChipsContainer}>
              {tags.map((tag, index) => (
                <View key={index} style={styles.tagChip}>
                  <Text style={styles.tagChipText}>{tag}</Text>
                  <TouchableOpacity
                    onPress={() => removeTag(index)}
                    disabled={loading}
                    style={styles.tagChipRemove}
                  >
                    <Text style={styles.tagChipRemoveText}>✕</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}
          <View style={styles.tagInputRow}>
            <TextInput
              style={[styles.input, styles.tagInput]}
              placeholder="태그 입력 (예: 동사, 비즈니스)"
              value={tagInput}
              onChangeText={setTagInput}
              onSubmitEditing={addTag}
              returnKeyType="done"
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={30}
              editable={!loading}
            />
            <TouchableOpacity
              onPress={addTag}
              disabled={loading || !tagInput.trim()}
              style={[
                styles.tagAddButton,
                (!tagInput.trim() || loading) && styles.tagAddButtonDisabled,
              ]}
            >
              <Text style={styles.tagAddButtonText}>추가</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* 메모 */}
        <View style={styles.section}>
          <Text style={styles.label}>메모 (선택)</Text>
          <TextInput
            style={[styles.input, styles.memoInput]}
            placeholder="헷갈리는 점, 외우는 팁 등을 메모하세요"
            value={memo}
            onChangeText={setMemo}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
            maxLength={500}
            editable={!loading}
          />
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
  wordInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  wordInput: {
    flex: 1,
    marginRight: 8,
  },
  searchButton: {
    backgroundColor: '#8B5CF6',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 56,
  },
  searchButtonDisabled: {
    opacity: 0.5,
  },
  searchButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  wordInputHint: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 6,
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
  tagChipsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  tagChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EDE9FE',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  tagChipText: {
    fontSize: 13,
    color: '#7C3AED',
    fontWeight: '500',
    marginRight: 6,
  },
  tagChipRemove: {
    width: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#DDD6FE',
    borderRadius: 9,
  },
  tagChipRemoveText: {
    fontSize: 10,
    color: '#7C3AED',
    fontWeight: 'bold',
  },
  tagInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  tagInput: {
    flex: 1,
    marginRight: 8,
  },
  tagAddButton: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#C4B5FD',
    borderRadius: 8,
  },
  tagAddButtonDisabled: {
    opacity: 0.5,
  },
  tagAddButtonText: {
    fontSize: 14,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  memoInput: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
});
