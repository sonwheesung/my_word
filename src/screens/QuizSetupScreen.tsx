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
import { MaterialIcons } from '@expo/vector-icons';
import { categoryService } from '../services/categoryService';
import type { Category } from '../types/word';
import Toast from '../components/Toast';
import { useToast } from '../hooks/useToast';
import ScreenHeader from '../components/ScreenHeader';
import { useTheme } from '../contexts/ThemeContext';

interface QuizSetupScreenProps {
  onBack: () => void;
  onStartQuiz: (categoryId: number, mode: QuizMode, wordCount: number, direction: QuizDirection, answerType: QuizAnswerType) => void;
}

export type QuizMode = 'random' | 'recent' | 'weak' | 'mixed';
export type QuizDirection = 'word_to_meaning' | 'meaning_to_word';
export type QuizAnswerType = 'subjective' | 'multiple_choice';

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

const QUIZ_ANSWER_TYPES: Array<{ value: QuizAnswerType; label: string; description: string }> = [
  { value: 'subjective', label: '주관식', description: '직접 입력하여 답변' },
  { value: 'multiple_choice', label: '객관식 (4지선다)', description: '4개 보기 중 선택' },
];

const WORD_COUNTS = [5, 10, 15, 20, 30];

export default function QuizSetupScreen({ onBack, onStartQuiz }: QuizSetupScreenProps) {
  const { colors } = useTheme();
  const { toast, showToast, hideToast } = useToast();
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [selectedMode, setSelectedMode] = useState<QuizMode>('random');
  const [selectedDirection, setSelectedDirection] = useState<QuizDirection>('word_to_meaning');
  const [selectedAnswerType, setSelectedAnswerType] = useState<QuizAnswerType>('subjective');
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
    onStartQuiz(selectedCategoryId, selectedMode, selectedWordCount, selectedDirection, selectedAnswerType);
  };

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={[styles.loadingText, { color: colors.textSecondary }]}>로딩 중...</Text>
      </View>
    );
  }

  if (categories.length === 0) {
    return (
      <View style={[styles.emptyContainer, { backgroundColor: colors.background }]}>
        <StatusBar style={colors.isDark ? 'light' : 'dark'} />
        <MaterialIcons name="folder-open" size={64} color={colors.textTertiary} />
        <Text style={[styles.emptyTitle, { color: colors.text }]}>카테고리가 없습니다</Text>
        <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>먼저 카테고리를 생성해주세요</Text>
        <TouchableOpacity style={[styles.backButton, { backgroundColor: colors.accent }]} onPress={onBack}>
          <Text style={styles.backButtonText}>돌아가기</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style={colors.isDark ? 'light' : 'dark'} />
      <ScreenHeader title="퀴즈 설정" onBack={onBack} />

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {/* 카테고리 선택 */}
        <View style={styles.section}>
          <Text style={[styles.label, { color: colors.text }]}>카테고리</Text>
          <TouchableOpacity
            style={[styles.selector, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => setShowCategoryPicker(true)}
          >
            <View style={styles.selectorLeft}>
              <Text style={[styles.selectorText, { color: colors.text }]}>
                {selectedCategory?.categoryName || '카테고리 선택'}
              </Text>
              {selectedCategory && (
                <Text style={[styles.selectorWordCount, { color: colors.textSecondary }]}>
                  {availableWordCount}개 단어
                </Text>
              )}
            </View>
            <MaterialIcons name="keyboard-arrow-down" size={20} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* 모드 선택 */}
        <View style={styles.section}>
          <Text style={[styles.label, { color: colors.text }]}>퀴즈 모드</Text>
          {QUIZ_MODES.map((mode) => (
            <TouchableOpacity
              key={mode.value}
              style={[
                styles.modeOption,
                { backgroundColor: colors.card, borderColor: colors.border },
                selectedMode === mode.value && { borderColor: colors.accent, backgroundColor: colors.primaryLight },
              ]}
              onPress={() => setSelectedMode(mode.value)}
            >
              <View style={styles.modeOptionContent}>
                <Text
                  style={[
                    styles.modeOptionLabel,
                    { color: colors.text },
                    selectedMode === mode.value && { color: colors.accent },
                  ]}
                >
                  {mode.label}
                </Text>
                <Text style={[styles.modeOptionDescription, { color: colors.textSecondary }]}>{mode.description}</Text>
              </View>
              <View
                style={[
                  styles.radio,
                  selectedMode === mode.value && { borderColor: colors.accent },
                ]}
              >
                {selectedMode === mode.value && <View style={[styles.radioDot, { backgroundColor: colors.accent }]} />}
              </View>
            </TouchableOpacity>
          ))}
        </View>

        {/* 출제 방향 선택 (여러 형태 모드 제외) */}
        {selectedMode !== 'mixed' && (
          <View style={styles.section}>
            <Text style={[styles.label, { color: colors.text }]}>출제 방향</Text>
            {QUIZ_DIRECTIONS.map((dir) => (
              <TouchableOpacity
                key={dir.value}
                style={[
                  styles.modeOption,
                  { backgroundColor: colors.card, borderColor: colors.border },
                  selectedDirection === dir.value && { borderColor: colors.accent, backgroundColor: colors.primaryLight },
                ]}
                onPress={() => setSelectedDirection(dir.value)}
              >
                <View style={styles.modeOptionContent}>
                  <Text
                    style={[
                      styles.modeOptionLabel,
                      { color: colors.text },
                      selectedDirection === dir.value && { color: colors.accent },
                    ]}
                  >
                    {dir.label}
                  </Text>
                  <Text style={[styles.modeOptionDescription, { color: colors.textSecondary }]}>{dir.description}</Text>
                </View>
                <View
                  style={[
                    styles.radio,
                    selectedDirection === dir.value && { borderColor: colors.accent },
                  ]}
                >
                  {selectedDirection === dir.value && <View style={[styles.radioDot, { backgroundColor: colors.accent }]} />}
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* 답변 방식 선택 */}
        <View style={styles.section}>
          <Text style={[styles.label, { color: colors.text }]}>답변 방식</Text>
          {QUIZ_ANSWER_TYPES.map((at) => (
            <TouchableOpacity
              key={at.value}
              style={[
                styles.modeOption,
                { backgroundColor: colors.card, borderColor: colors.border },
                selectedAnswerType === at.value && { borderColor: colors.accent, backgroundColor: colors.primaryLight },
              ]}
              onPress={() => setSelectedAnswerType(at.value)}
            >
              <View style={styles.modeOptionContent}>
                <Text
                  style={[
                    styles.modeOptionLabel,
                    { color: colors.text },
                    selectedAnswerType === at.value && { color: colors.accent },
                  ]}
                >
                  {at.label}
                </Text>
                <Text style={[styles.modeOptionDescription, { color: colors.textSecondary }]}>{at.description}</Text>
              </View>
              <View
                style={[
                  styles.radio,
                  selectedAnswerType === at.value && { borderColor: colors.accent },
                ]}
              >
                {selectedAnswerType === at.value && <View style={[styles.radioDot, { backgroundColor: colors.accent }]} />}
              </View>
            </TouchableOpacity>
          ))}
        </View>

        {/* 단어 수 선택 */}
        <View style={styles.section}>
          <View style={styles.labelRow}>
            <Text style={[styles.label, { marginBottom: 0, color: colors.text }]}>문제 수</Text>
            {availableWordCount > 0 && (
              <Text style={[styles.labelHint, { color: colors.accent }]}>최대 {availableWordCount}개</Text>
            )}
          </View>
          <View style={styles.wordCountButtons}>
            {availableWordCount > 0 && availableWordCount < WORD_COUNTS[0] && (
              <TouchableOpacity
                style={[
                  styles.wordCountButton,
                  { backgroundColor: colors.card, borderColor: colors.border },
                  selectedWordCount === availableWordCount && { backgroundColor: colors.accent, borderColor: colors.accent },
                ]}
                onPress={() => setSelectedWordCount(availableWordCount)}
              >
                <Text
                  style={[
                    styles.wordCountButtonText,
                    { color: colors.textSecondary },
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
                    { backgroundColor: colors.card, borderColor: colors.border },
                    selectedWordCount === count && { backgroundColor: colors.accent, borderColor: colors.accent },
                    isDisabled && styles.wordCountButtonDisabled,
                  ]}
                  onPress={() => !isDisabled && setSelectedWordCount(count)}
                  disabled={isDisabled}
                >
                  <Text
                    style={[
                      styles.wordCountButtonText,
                      { color: colors.textSecondary },
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
          style={[styles.startButton, { backgroundColor: colors.accent }, isStarting && { opacity: 0.6 }]}
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
          <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
            <Text style={[styles.modalTitle, { color: colors.text, borderBottomColor: colors.border }]}>카테고리 선택</Text>
            <ScrollView style={styles.categoryList}>
              {categories.map((category) => (
                <TouchableOpacity
                  key={category.categoryId}
                  style={[
                    styles.categoryOption,
                    { borderBottomColor: colors.borderLight },
                    selectedCategoryId === category.categoryId && { backgroundColor: colors.primaryLight },
                  ]}
                  onPress={() => handleCategorySelect(category.categoryId)}
                >
                  <View style={styles.categoryOptionRow}>
                    <Text
                      style={[
                        styles.categoryOptionText,
                        { color: colors.textSecondary },
                        selectedCategoryId === category.categoryId && { color: colors.accent, fontWeight: '600' },
                      ]}
                    >
                      {category.categoryName}
                    </Text>
                    <Text
                      style={[
                        styles.categoryOptionCount,
                        { color: colors.textTertiary },
                        selectedCategoryId === category.categoryId && { color: colors.accent },
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
    borderRadius: 16,
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
    padding: 20,
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
    borderRadius: 16,
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
    borderRadius: 16,
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
    borderRadius: 16,
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
    borderRadius: 16,
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
    borderRadius: 20,
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
