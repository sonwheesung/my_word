import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { categoryService } from '../services/categoryService';
import type { Category } from '../types/word';
import Toast from '../components/Toast';
import { useToast } from '../hooks/useToast';
import ScreenHeader from '../components/ScreenHeader';

interface QuizSetupScreenProps {
  onBack: () => void;
  onStartQuiz: (categoryId: number, mode: QuizMode, wordCount: number, direction: QuizDirection) => void;
}

export type QuizMode = 'random' | 'recent' | 'weak' | 'mixed';
export type QuizDirection = 'word_to_meaning' | 'meaning_to_word';

const QUIZ_MODES: Array<{ value: QuizMode; label: string; description: string }> = [
  { value: 'random', label: '모두 무작위', description: '전체 단어에서 랜덤으로 출제' },
  { value: 'recent', label: '최신순', description: '최근에 추가한 단어 위주로 출제' },
  { value: 'weak', label: '취약한 단어', description: '틀린 단어 위주로 출제' },
  { value: 'mixed', label: '여러 형태', description: '다양한 문제 유형으로 출제' },
];

const QUIZ_DIRECTIONS: Array<{ value: QuizDirection; label: string; description: string }> = [
  { value: 'word_to_meaning', label: '단어 → 뜻', description: '단어를 보고 뜻을 입력' },
  { value: 'meaning_to_word', label: '뜻 → 단어', description: '뜻을 보고 단어를 입력' },
];

const WORD_COUNTS = [5, 10, 15, 20, 30];

export default function QuizSetupScreen({ onBack, onStartQuiz }: QuizSetupScreenProps) {
  const { toast, showToast, hideToast } = useToast();
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [selectedMode, setSelectedMode] = useState<QuizMode>('random');
  const [selectedDirection, setSelectedDirection] = useState<QuizDirection>('word_to_meaning');
  const [selectedWordCount, setSelectedWordCount] = useState(10);
  const [loading, setLoading] = useState(true);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [isStarting, setIsStarting] = useState(false);

  useEffect(() => {
    loadCategories();
  }, []);

  const loadCategories = async () => {
    try {
      setLoading(true);
      const data = await categoryService.getCategories();
      setCategories(data);
      if (data.length > 0) {
        setSelectedCategoryId(data[0].categoryId);
        // 첫 카테고리의 단어 수에 맞게 문제 수 자동 조정
        const firstWordCount = data[0].wordCount ?? 0;
        if (firstWordCount > 0 && selectedWordCount > firstWordCount) {
          const closest = WORD_COUNTS.filter((c) => c <= firstWordCount).pop();
          setSelectedWordCount(closest ?? firstWordCount);
        }
      }
    } catch (error: any) {
      console.warn('카테고리 조회 실패:', error);
      showToast('카테고리를 불러오는데 실패했습니다', 'error');
    } finally {
      setLoading(false);
    }
  };

  const selectedCategory = categories.find((c) => c.categoryId === selectedCategoryId);
  const availableWordCount = selectedCategory?.wordCount ?? 0;

  const handleCategorySelect = (categoryId: number) => {
    setSelectedCategoryId(categoryId);
    setShowCategoryPicker(false);
    const category = categories.find((c) => c.categoryId === categoryId);
    const catWordCount = category?.wordCount ?? 0;
    if (catWordCount > 0 && selectedWordCount > catWordCount) {
      const closest = WORD_COUNTS.filter((c) => c <= catWordCount).pop();
      setSelectedWordCount(closest ?? catWordCount);
      showToast(`단어가 ${catWordCount}개뿐이어서 문제 수를 조정했습니다`, 'info');
    }
  };

  const handleStartQuiz = () => {
    if (isStarting) return;
    if (!selectedCategoryId) {
      showToast('카테고리를 선택해주세요', 'error');
      return;
    }
    if (availableWordCount === 0) {
      showToast('선택한 카테고리에 단어가 없습니다', 'error');
      return;
    }
    if (selectedWordCount > availableWordCount) {
      showToast(`단어가 ${availableWordCount}개뿐입니다. 문제 수를 줄여주세요`, 'error');
      return;
    }
    setIsStarting(true);
    onStartQuiz(selectedCategoryId, selectedMode, selectedWordCount, selectedDirection);
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#C4B5FD" />
        <Text style={styles.loadingText}>로딩 중...</Text>
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
      <ScreenHeader title="퀴즈 설정" onBack={onBack} />

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {/* 카테고리 선택 */}
        <View style={styles.section}>
          <Text style={styles.label}>카테고리</Text>
          <TouchableOpacity
            style={styles.selector}
            onPress={() => setShowCategoryPicker(true)}
          >
            <View style={styles.selectorLeft}>
              <Text style={styles.selectorText}>
                {selectedCategory?.categoryName || '카테고리 선택'}
              </Text>
              {selectedCategory && (
                <Text style={styles.selectorWordCount}>
                  {availableWordCount}개 단어
                </Text>
              )}
            </View>
            <Text style={styles.selectorIcon}>▼</Text>
          </TouchableOpacity>
        </View>

        {/* 모드 선택 */}
        <View style={styles.section}>
          <Text style={styles.label}>퀴즈 모드</Text>
          {QUIZ_MODES.map((mode) => (
            <TouchableOpacity
              key={mode.value}
              style={[
                styles.modeOption,
                selectedMode === mode.value && styles.modeOptionSelected,
              ]}
              onPress={() => setSelectedMode(mode.value)}
            >
              <View style={styles.modeOptionContent}>
                <Text
                  style={[
                    styles.modeOptionLabel,
                    selectedMode === mode.value && styles.modeOptionLabelSelected,
                  ]}
                >
                  {mode.label}
                </Text>
                <Text style={styles.modeOptionDescription}>{mode.description}</Text>
              </View>
              <View
                style={[
                  styles.radio,
                  selectedMode === mode.value && styles.radioSelected,
                ]}
              >
                {selectedMode === mode.value && <View style={styles.radioDot} />}
              </View>
            </TouchableOpacity>
          ))}
        </View>

        {/* 출제 방향 선택 (여러 형태 모드 제외) */}
        {selectedMode !== 'mixed' && (
          <View style={styles.section}>
            <Text style={styles.label}>출제 방향</Text>
            {QUIZ_DIRECTIONS.map((dir) => (
              <TouchableOpacity
                key={dir.value}
                style={[
                  styles.modeOption,
                  selectedDirection === dir.value && styles.modeOptionSelected,
                ]}
                onPress={() => setSelectedDirection(dir.value)}
              >
                <View style={styles.modeOptionContent}>
                  <Text
                    style={[
                      styles.modeOptionLabel,
                      selectedDirection === dir.value && styles.modeOptionLabelSelected,
                    ]}
                  >
                    {dir.label}
                  </Text>
                  <Text style={styles.modeOptionDescription}>{dir.description}</Text>
                </View>
                <View
                  style={[
                    styles.radio,
                    selectedDirection === dir.value && styles.radioSelected,
                  ]}
                >
                  {selectedDirection === dir.value && <View style={styles.radioDot} />}
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* 단어 수 선택 */}
        <View style={styles.section}>
          <View style={styles.labelRow}>
            <Text style={[styles.label, { marginBottom: 0 }]}>문제 수</Text>
            {availableWordCount > 0 && (
              <Text style={styles.labelHint}>최대 {availableWordCount}개</Text>
            )}
          </View>
          <View style={styles.wordCountButtons}>
            {availableWordCount > 0 && availableWordCount < WORD_COUNTS[0] && (
              <TouchableOpacity
                style={[
                  styles.wordCountButton,
                  selectedWordCount === availableWordCount && styles.wordCountButtonSelected,
                ]}
                onPress={() => setSelectedWordCount(availableWordCount)}
              >
                <Text
                  style={[
                    styles.wordCountButtonText,
                    selectedWordCount === availableWordCount && styles.wordCountButtonTextSelected,
                  ]}
                >
                  전체 ({availableWordCount})
                </Text>
              </TouchableOpacity>
            )}
            {WORD_COUNTS.map((count) => {
              const isDisabled = availableWordCount > 0 && count > availableWordCount;
              return (
                <TouchableOpacity
                  key={count}
                  style={[
                    styles.wordCountButton,
                    selectedWordCount === count && styles.wordCountButtonSelected,
                    isDisabled && styles.wordCountButtonDisabled,
                  ]}
                  onPress={() => !isDisabled && setSelectedWordCount(count)}
                  disabled={isDisabled}
                >
                  <Text
                    style={[
                      styles.wordCountButtonText,
                      selectedWordCount === count && styles.wordCountButtonTextSelected,
                      isDisabled && styles.wordCountButtonTextDisabled,
                    ]}
                  >
                    {count}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          {availableWordCount > 0 && availableWordCount < 5 && (
            <Text style={styles.wordCountWarning}>
              단어가 {availableWordCount}개뿐입니다. 단어를 더 추가해보세요!
            </Text>
          )}
        </View>

        <TouchableOpacity
          style={[styles.startButton, isStarting && { opacity: 0.6 }]}
          onPress={handleStartQuiz}
          disabled={isStarting}
        >
          <Text style={styles.startButtonText}>퀴즈 시작</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* 카테고리 선택 모달 */}
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
                  onPress={() => handleCategorySelect(category.categoryId)}
                >
                  <View style={styles.categoryOptionRow}>
                    <Text
                      style={[
                        styles.categoryOptionText,
                        selectedCategoryId === category.categoryId &&
                          styles.categoryOptionTextSelected,
                      ]}
                    >
                      {category.categoryName}
                    </Text>
                    <Text
                      style={[
                        styles.categoryOptionCount,
                        selectedCategoryId === category.categoryId &&
                          styles.categoryOptionCountSelected,
                      ]}
                    >
                      {category.wordCount ?? 0}개
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </TouchableOpacity>
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
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  section: {
    marginBottom: 24,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1A1A1A',
    marginBottom: 12,
  },
  labelHint: {
    fontSize: 13,
    color: '#C4B5FD',
    fontWeight: '600',
  },
  selector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    padding: 14,
  },
  selectorLeft: {
    flex: 1,
  },
  selectorText: {
    fontSize: 15,
    color: '#1A1A1A',
  },
  selectorWordCount: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  selectorIcon: {
    fontSize: 12,
    color: '#6B7280',
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  modeOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    padding: 14,
    marginBottom: 8,
  },
  modeOptionSelected: {
    borderColor: '#C4B5FD',
    backgroundColor: '#EEF2FF',
  },
  modeOptionContent: {
    flex: 1,
  },
  modeOptionLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1A1A1A',
    marginBottom: 4,
  },
  modeOptionLabelSelected: {
    color: '#C4B5FD',
  },
  modeOptionDescription: {
    fontSize: 13,
    color: '#6B7280',
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#D1D5DB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: {
    borderColor: '#C4B5FD',
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#C4B5FD',
  },
  wordCountButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  wordCountButton: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
  },
  wordCountButtonSelected: {
    backgroundColor: '#C4B5FD',
    borderColor: '#C4B5FD',
  },
  wordCountButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#6B7280',
  },
  wordCountButtonTextSelected: {
    color: '#FFFFFF',
  },
  wordCountButtonDisabled: {
    backgroundColor: '#F3F4F6',
    borderColor: '#E5E7EB',
    opacity: 0.5,
  },
  wordCountButtonTextDisabled: {
    color: '#D1D5DB',
  },
  wordCountWarning: {
    fontSize: 13,
    color: '#F59E0B',
    marginTop: 8,
  },
  startButton: {
    backgroundColor: '#C4B5FD',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  startButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
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
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  categoryOptionSelected: {
    backgroundColor: '#EEF2FF',
  },
  categoryOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  categoryOptionText: {
    fontSize: 15,
    color: '#374151',
  },
  categoryOptionTextSelected: {
    color: '#C4B5FD',
    fontWeight: '600',
  },
  categoryOptionCount: {
    fontSize: 13,
    color: '#9CA3AF',
  },
  categoryOptionCountSelected: {
    color: '#C4B5FD',
  },
});
