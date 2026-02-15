import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
  Platform,
  Modal,
  RefreshControl,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { categoryService } from '../services/categoryService';
import { wordService } from '../services/wordService';
import type { Category, Word } from '../types/word';
import Toast from '../components/Toast';
import { useToast } from '../hooks/useToast';
import ScreenHeader from '../components/ScreenHeader';
import { WordCardSkeleton } from '../components/SkeletonLoader';

interface ManageWordsScreenProps {
  onBack: () => void;
  onAddWord: () => void;
  onEditWord: (wordId: number) => void;
  onManageCategories: () => void;
}

export default function ManageWordsScreen({
  onBack,
  onAddWord,
  onEditWord,
  onManageCategories,
}: ManageWordsScreenProps) {
  const { toast, showToast, hideToast } = useToast();
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [words, setWords] = useState<Word[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingWords, setLoadingWords] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedWord, setSelectedWord] = useState<Word | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadCategories();
  }, []);

  useEffect(() => {
    if (selectedCategoryId) {
      loadWords(selectedCategoryId);
    }
  }, [selectedCategoryId]);

  const loadCategories = async () => {
    try {
      setLoading(true);
      const data = await categoryService.getCategories();
      setCategories(data);
      if (data.length > 0 && !selectedCategoryId) {
        setSelectedCategoryId(data[0].categoryId);
      }
    } catch (error: any) {
      console.error('카테고리 조회 실패:', error);
      showToast('카테고리를 불러오는데 실패했습니다', 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadWords = async (categoryId: number) => {
    try {
      setLoadingWords(true);
      const data = await wordService.getWords(categoryId);
      setWords(data);
    } catch (error: any) {
      console.error('단어 조회 실패:', error);
      showToast('단어를 불러오는데 실패했습니다', 'error');
    } finally {
      setLoadingWords(false);
    }
  };

  const handleDeleteWord = (wordId: number, word: string) => {
    Alert.alert('단어 삭제', `"${word}"을(를) 삭제하시겠습니까?`, [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: async () => {
          try {
            await wordService.deleteWord(wordId);
            showToast('단어가 삭제되었습니다', 'success');
            if (selectedCategoryId) {
              loadWords(selectedCategoryId);
            }
            loadCategories();
          } catch (error: any) {
            console.error('단어 삭제 실패:', error);
            showToast(error.message || '단어 삭제에 실패했습니다', 'error');
          }
        },
      },
    ]);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await loadCategories();
      if (selectedCategoryId) {
        await loadWords(selectedCategoryId);
      }
    } finally {
      setRefreshing(false);
    }
  };

  // 검색 필터링
  const filteredWords = words.filter((word) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    return (
      word.word.toLowerCase().includes(query) ||
      word.meanings.some((meaning) => meaning.toLowerCase().includes(query)) ||
      (word.pronunciation && word.pronunciation.toLowerCase().includes(query))
    );
  });

  if (loading) {
    return (
      <View style={styles.container}>
        <StatusBar style="dark" />
        <ScreenHeader
          title="단어장"
          onBack={onBack}
          rightButton={{ text: '관리', onPress: onManageCategories }}
        />
        <View style={styles.contentContainer}>
          <View style={styles.categoryList}>
            {[1, 2, 3].map((i) => (
              <View key={i} style={styles.skeletonCategoryItem}>
                <View style={styles.skeletonBar} />
              </View>
            ))}
          </View>
          <View style={styles.wordsContainer}>
            <View style={{ padding: 16 }}>
              {[1, 2, 3, 4].map((i) => (
                <WordCardSkeleton key={i} />
              ))}
            </View>
          </View>
        </View>
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
        <TouchableOpacity style={styles.primaryButton} onPress={onManageCategories}>
          <Text style={styles.primaryButtonText}>카테고리 관리</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondaryButton} onPress={onBack}>
          <Text style={styles.secondaryButtonText}>돌아가기</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      <ScreenHeader
        title="단어장"
        onBack={onBack}
        rightButton={{ text: '관리', onPress: onManageCategories }}
      />

      <View style={styles.contentContainer}>
        {/* 카테고리 목록 (왼쪽) */}
        <View style={styles.categoryList}>
          <ScrollView showsVerticalScrollIndicator={false}>
            {categories.map((category) => (
              <TouchableOpacity
                key={category.categoryId}
                style={[
                  styles.categoryItem,
                  selectedCategoryId === category.categoryId && styles.categoryItemActive,
                ]}
                onPress={() => setSelectedCategoryId(category.categoryId)}
              >
                <Text
                  style={[
                    styles.categoryItemText,
                    selectedCategoryId === category.categoryId && styles.categoryItemTextActive,
                  ]}
                  numberOfLines={1}
                >
                  {category.categoryName}
                </Text>
                <Text
                  style={[
                    styles.categoryWordCount,
                    selectedCategoryId === category.categoryId && styles.categoryWordCountActive,
                  ]}
                >
                  {category.wordCount ?? 0}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* 단어 목록 (오른쪽) */}
        <View style={styles.wordsContainer}>
          {/* 검색 */}
          <View style={styles.searchContainer}>
            <TextInput
              style={styles.searchInput}
              placeholder="단어 또는 뜻 검색..."
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholderTextColor="#9CA3AF"
            />
          </View>

          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                colors={['#6366F1']}
                tintColor="#6366F1"
              />
            }
          >
        {loadingWords ? (
          <View style={{ padding: 0 }}>
            {[1, 2, 3].map((i) => (
              <WordCardSkeleton key={i} />
            ))}
          </View>
        ) : words.length === 0 ? (
          <View style={styles.emptyWordsContainer}>
            <Text style={styles.emptyWordsIcon}>📝</Text>
            <Text style={styles.emptyWordsText}>등록된 단어가 없습니다</Text>
          </View>
        ) : filteredWords.length === 0 ? (
          <View style={styles.emptyWordsContainer}>
            <Text style={styles.emptyWordsIcon}>🔍</Text>
            <Text style={styles.emptyWordsText}>검색 결과가 없습니다</Text>
          </View>
        ) : (
          filteredWords.map((word) => (
            <TouchableOpacity
              key={word.wordId}
              style={styles.wordCard}
              onPress={() => setSelectedWord(word)}
            >
              <Text style={styles.wordText}>{word.word}</Text>
              {word.pronunciation && (
                <Text style={styles.pronunciationText}>[{word.pronunciation}]</Text>
              )}
              <Text style={styles.wordMeaningPreview} numberOfLines={1}>
                {word.meanings[0]}
              </Text>
            </TouchableOpacity>
          ))
        )}
          </ScrollView>
        </View>
      </View>

      {/* 단어 상세 모달 */}
      <Modal
        visible={!!selectedWord}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedWord(null)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setSelectedWord(null)}
        >
          <TouchableOpacity
            activeOpacity={1}
            onPress={(e) => e.stopPropagation()}
            style={styles.modalContent}
          >
            {selectedWord && (
              <ScrollView>
                <View style={styles.modalHeader}>
                  <View>
                    <Text style={styles.modalWordText}>{selectedWord.word}</Text>
                    {selectedWord.pronunciation && (
                      <Text style={styles.modalPronunciationText}>
                        [{selectedWord.pronunciation}]
                      </Text>
                    )}
                  </View>
                </View>

                {/* 뜻 */}
                <View style={styles.modalSection}>
                  <Text style={styles.modalLabel}>뜻</Text>
                  {selectedWord.meanings.map((meaning, index) => (
                    <Text key={index} style={styles.modalMeaningText}>
                      {index + 1}. {meaning}
                    </Text>
                  ))}
                </View>

                {/* 예문 */}
                {selectedWord.examples && selectedWord.examples.length > 0 && (
                  <View style={styles.modalSection}>
                    <Text style={styles.modalLabel}>예문</Text>
                    {selectedWord.examples.map((example, index) => (
                      <View key={index} style={styles.modalExampleItem}>
                        <Text style={styles.modalExampleText}>{example.example}</Text>
                        {example.translation && (
                          <Text style={styles.modalExampleTranslation}>
                            {example.translation}
                          </Text>
                        )}
                      </View>
                    ))}
                  </View>
                )}

                {/* 버튼 */}
                <View style={styles.modalButtons}>
                  <TouchableOpacity
                    style={styles.modalEditButton}
                    onPress={() => {
                      setSelectedWord(null);
                      onEditWord(selectedWord.wordId);
                    }}
                  >
                    <Text style={styles.modalEditButtonText}>수정</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.modalDeleteButton}
                    onPress={() => {
                      setSelectedWord(null);
                      handleDeleteWord(selectedWord.wordId, selectedWord.word);
                    }}
                  >
                    <Text style={styles.modalDeleteButtonText}>삭제</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.modalCloseButton}
                    onPress={() => setSelectedWord(null)}
                  >
                    <Text style={styles.modalCloseButtonText}>닫기</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            )}
          </TouchableOpacity>
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
  primaryButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: '#C4B5FD',
    borderRadius: 8,
    marginBottom: 12,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  secondaryButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: '#E5E7EB',
    borderRadius: 8,
  },
  secondaryButtonText: {
    color: '#374151',
    fontSize: 15,
    fontWeight: '600',
  },
  contentContainer: {
    flex: 1,
    flexDirection: 'row',
  },
  categoryList: {
    width: 140,
    backgroundColor: '#FFFFFF',
    borderRightWidth: 1,
    borderRightColor: '#E5E7EB',
  },
  categoryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  categoryItemActive: {
    backgroundColor: '#EEF2FF',
    borderLeftWidth: 3,
    borderLeftColor: '#6366F1',
  },
  categoryItemText: {
    fontSize: 13,
    color: '#6B7280',
    fontWeight: '500',
    flex: 1,
  },
  categoryItemTextActive: {
    color: '#6366F1',
    fontWeight: '600',
  },
  categoryWordCount: {
    fontSize: 12,
    color: '#9CA3AF',
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
    minWidth: 24,
    textAlign: 'center',
    overflow: 'hidden',
    fontWeight: '600',
    marginLeft: 4,
  },
  categoryWordCountActive: {
    color: '#6366F1',
    backgroundColor: '#DDD6FE',
  },
  skeletonCategoryItem: {
    paddingHorizontal: 16,
    paddingVertical: 18,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  skeletonBar: {
    height: 14,
    backgroundColor: '#E5E7EB',
    borderRadius: 4,
    width: '70%',
  },
  wordsContainer: {
    flex: 1,
  },
  searchContainer: {
    margin: 16,
  },
  searchInput: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#1A1A1A',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingTop: 0,
  },
  emptyWordsContainer: {
    padding: 40,
    alignItems: 'center',
  },
  emptyWordsIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  emptyWordsText: {
    fontSize: 14,
    color: '#6B7280',
  },
  wordCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
    ...Platform.select({
      web: { boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)' },
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 3,
        elevation: 2,
      },
    }),
  },
  wordText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1A1A1A',
    marginBottom: 4,
  },
  pronunciationText: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 6,
  },
  wordMeaningPreview: {
    fontSize: 14,
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
    maxWidth: 500,
    maxHeight: '80%',
    padding: 20,
  },
  modalHeader: {
    marginBottom: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  modalWordText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1A1A1A',
    marginBottom: 4,
  },
  modalPronunciationText: {
    fontSize: 16,
    color: '#6B7280',
  },
  modalSection: {
    marginBottom: 20,
  },
  modalLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
    marginBottom: 8,
  },
  modalMeaningText: {
    fontSize: 15,
    color: '#374151',
    marginBottom: 6,
    lineHeight: 22,
  },
  modalExampleItem: {
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  modalExampleText: {
    fontSize: 15,
    color: '#1A1A1A',
    marginBottom: 4,
    lineHeight: 22,
  },
  modalExampleTranslation: {
    fontSize: 14,
    color: '#6B7280',
    lineHeight: 20,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 10,
  },
  modalEditButton: {
    flex: 1,
    backgroundColor: '#C4B5FD',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    alignItems: 'center',
  },
  modalEditButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  modalDeleteButton: {
    flex: 1,
    backgroundColor: '#FCA5A5',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    alignItems: 'center',
  },
  modalDeleteButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  modalCloseButton: {
    flex: 1,
    backgroundColor: '#E5E7EB',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    alignItems: 'center',
  },
  modalCloseButtonText: {
    color: '#374151',
    fontSize: 13,
    fontWeight: '600',
  },
});
