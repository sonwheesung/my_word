import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Platform,
  Modal,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as Clipboard from 'expo-clipboard';
import { categoryService } from '../services/categoryService';
import { wordService } from '../services/wordService';
import { shareService } from '../services/shareService';
import type { ParsedWord, ParseResult, DuplicateCheckResult } from '../services/shareService';
import type { Category } from '../types/word';
import ScreenHeader from '../components/ScreenHeader';
import Toast from '../components/Toast';
import { useToast } from '../hooks/useToast';

interface ImportWordsScreenProps {
  onBack: () => void;
  onImportComplete: () => void;
}

const MAX_IMPORT_COUNT = 200;

export default function ImportWordsScreen({ onBack, onImportComplete }: ImportWordsScreenProps) {
  const { toast, showToast, hideToast } = useToast();

  const [csvInput, setCsvInput] = useState('');
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [skipDuplicates, setSkipDuplicates] = useState(true);

  const [loadingCategories, setLoadingCategories] = useState(true);
  const [isParsing, setIsParsing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // 미리보기 상태
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [duplicateResult, setDuplicateResult] = useState<DuplicateCheckResult | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    loadCategories();
  }, []);

  const loadCategories = async () => {
    try {
      setLoadingCategories(true);
      const data = await categoryService.getCategories();
      setCategories(data);
      if (data.length > 0 && !selectedCategoryId) {
        setSelectedCategoryId(data[0].categoryId);
      }
    } catch (error: any) {
      showToast('카테고리를 불러오는데 실패했습니다', 'error');
    } finally {
      setLoadingCategories(false);
    }
  };

  const handlePaste = useCallback(async () => {
    try {
      const text = await Clipboard.getStringAsync();
      if (text && text.trim().length > 0) {
        setCsvInput(text);
        showToast('클립보드에서 붙여넣었습니다', 'success');
      } else {
        showToast('클립보드가 비어있습니다', 'info');
      }
    } catch (error: any) {
      showToast('클립보드 읽기에 실패했습니다', 'error');
    }
  }, [showToast]);

  const handlePreview = useCallback(async () => {
    if (!csvInput.trim()) {
      showToast('CSV 데이터를 입력해주세요', 'error');
      return;
    }
    if (!selectedCategoryId) {
      showToast('카테고리를 선택해주세요', 'error');
      return;
    }

    setIsParsing(true);
    try {
      const result = shareService.parseCSV(csvInput);

      if (result.success.length === 0) {
        showToast('유효한 단어가 없습니다. 형식을 확인해주세요', 'error');
        setIsParsing(false);
        return;
      }

      if (result.success.length > MAX_IMPORT_COUNT) {
        showToast(`최대 ${MAX_IMPORT_COUNT}개까지 가져올 수 있습니다`, 'error');
        setIsParsing(false);
        return;
      }

      const dupResult = await shareService.checkDuplicates(result.success, selectedCategoryId);

      setParseResult(result);
      setDuplicateResult(dupResult);
      setShowPreview(true);
    } catch (error: any) {
      showToast('파싱 중 오류가 발생했습니다', 'error');
    } finally {
      setIsParsing(false);
    }
  }, [csvInput, selectedCategoryId, showToast]);

  const handleSave = useCallback(async () => {
    if (!duplicateResult || !selectedCategoryId || isSaving) return;

    const wordsToSave = skipDuplicates
      ? duplicateResult.newWords
      : [...duplicateResult.newWords, ...duplicateResult.duplicateWords];

    if (wordsToSave.length === 0) {
      showToast('저장할 단어가 없습니다', 'info');
      return;
    }

    setIsSaving(true);
    try {
      let savedCount = 0;
      let failCount = 0;

      for (const pw of wordsToSave) {
        try {
          await wordService.createWord({
            categoryId: selectedCategoryId,
            word: pw.word.trim(),
            meanings: pw.meanings,
            examples: pw.examples,
            tags: pw.tags,
            memo: pw.memo,
          });
          savedCount++;
        } catch {
          failCount++;
        }
      }

      if (failCount > 0) {
        showToast(`${savedCount}개 저장, ${failCount}개 실패`, 'info');
      } else {
        showToast(`${savedCount}개 단어를 저장했습니다`, 'success');
      }

      setShowPreview(false);
      setCsvInput('');
      setParseResult(null);
      setDuplicateResult(null);

      // 약간의 딜레이 후 완료 콜백
      setTimeout(() => {
        onImportComplete();
      }, 800);
    } catch (error: any) {
      showToast('저장 중 오류가 발생했습니다', 'error');
    } finally {
      setIsSaving(false);
    }
  }, [duplicateResult, selectedCategoryId, skipDuplicates, isSaving, showToast, onImportComplete]);

  const selectedCategory = categories.find((c) => c.categoryId === selectedCategoryId);

  const previewNewCount = duplicateResult?.newWords.length ?? 0;
  const previewDupCount = duplicateResult?.duplicateWords.length ?? 0;
  const previewErrorCount = parseResult?.errors.length ?? 0;
  const totalToSave = skipDuplicates ? previewNewCount : previewNewCount + previewDupCount;

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      <ScreenHeader title="단어 받기" onBack={onBack} />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* 카테고리 선택 */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>저장할 카테고리</Text>
          {loadingCategories ? (
            <ActivityIndicator color="#6366F1" />
          ) : categories.length === 0 ? (
            <Text style={styles.emptyText}>카테고리가 없습니다. 먼저 카테고리를 생성해주세요.</Text>
          ) : (
            <TouchableOpacity
              style={styles.categorySelector}
              onPress={() => setShowCategoryPicker(true)}
            >
              <Text style={styles.categorySelectorText}>
                {selectedCategory?.categoryName ?? '카테고리 선택'}
              </Text>
              <Text style={styles.categorySelectorArrow}>▼</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* CSV 입력 */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionLabel}>CSV 데이터</Text>
            <TouchableOpacity style={styles.pasteButton} onPress={handlePaste}>
              <Text style={styles.pasteButtonText}>붙여넣기</Text>
            </TouchableOpacity>
          </View>
          <TextInput
            style={styles.csvInput}
            placeholder={
              '단어,뜻1|뜻2,예문::번역,태그,메모\napple,사과,This is an apple::이것은 사과입니다,과일,빨간 과일'
            }
            value={csvInput}
            onChangeText={setCsvInput}
            multiline
            numberOfLines={8}
            textAlignVertical="top"
            autoCorrect={false}
            autoCapitalize="none"
            placeholderTextColor="#9CA3AF"
          />
          <Text style={styles.formatHint}>
            형식: 단어,뜻1|뜻2,예문1::번역1|예문2::번역2,태그1|태그2,메모
          </Text>
        </View>

        {/* 중복 처리 옵션 */}
        <View style={styles.section}>
          <TouchableOpacity
            style={styles.checkboxRow}
            onPress={() => setSkipDuplicates(!skipDuplicates)}
          >
            <View style={[styles.checkbox, !skipDuplicates && styles.checkboxChecked]}>
              {!skipDuplicates && <Text style={styles.checkboxMark}>✓</Text>}
            </View>
            <Text style={styles.checkboxLabel}>중복된 단어도 함께 받기</Text>
          </TouchableOpacity>
          <Text style={styles.checkboxHint}>
            {skipDuplicates
              ? '이미 등록된 단어는 건너뜁니다'
              : '이미 등록된 단어도 새로 추가합니다'}
          </Text>
        </View>

        {/* 미리보기 버튼 */}
        <TouchableOpacity
          style={[styles.previewButton, (isParsing || !csvInput.trim()) && styles.buttonDisabled]}
          onPress={handlePreview}
          disabled={isParsing || !csvInput.trim()}
        >
          {isParsing ? (
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : (
            <Text style={styles.previewButtonText}>미리보기</Text>
          )}
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
          <View style={styles.modalContent} onStartShouldSetResponder={() => true}>
            <Text style={styles.modalTitle}>카테고리 선택</Text>
            <ScrollView style={styles.modalList}>
              {categories.map((cat) => (
                <TouchableOpacity
                  key={cat.categoryId}
                  style={[
                    styles.modalItem,
                    selectedCategoryId === cat.categoryId && styles.modalItemActive,
                  ]}
                  onPress={() => {
                    setSelectedCategoryId(cat.categoryId);
                    setShowCategoryPicker(false);
                  }}
                >
                  <Text
                    style={[
                      styles.modalItemText,
                      selectedCategoryId === cat.categoryId && styles.modalItemTextActive,
                    ]}
                  >
                    {cat.categoryName}
                  </Text>
                  <Text style={styles.modalItemCount}>{cat.wordCount ?? 0}개</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity
              style={styles.modalCloseButton}
              onPress={() => setShowCategoryPicker(false)}
            >
              <Text style={styles.modalCloseButtonText}>닫기</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* 미리보기 모달 */}
      <Modal
        visible={showPreview}
        transparent
        animationType="fade"
        onRequestClose={() => setShowPreview(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.previewModalContent}>
            <Text style={styles.modalTitle}>미리보기</Text>

            {/* 요약 */}
            <View style={styles.previewSummary}>
              <View style={styles.previewSummaryRow}>
                <Text style={styles.previewSummaryLabel}>신규 단어</Text>
                <Text style={[styles.previewSummaryValue, { color: '#10B981' }]}>
                  {previewNewCount}개
                </Text>
              </View>
              <View style={styles.previewSummaryRow}>
                <Text style={styles.previewSummaryLabel}>중복 단어</Text>
                <Text style={[styles.previewSummaryValue, { color: '#F59E0B' }]}>
                  {previewDupCount}개
                  {skipDuplicates ? ' (건너뜀)' : ' (포함)'}
                </Text>
              </View>
              {previewErrorCount > 0 && (
                <View style={styles.previewSummaryRow}>
                  <Text style={styles.previewSummaryLabel}>오류</Text>
                  <Text style={[styles.previewSummaryValue, { color: '#EF4444' }]}>
                    {previewErrorCount}건
                  </Text>
                </View>
              )}
              <View style={[styles.previewSummaryRow, styles.previewSummaryTotal]}>
                <Text style={styles.previewSummaryTotalLabel}>저장 예정</Text>
                <Text style={styles.previewSummaryTotalValue}>{totalToSave}개</Text>
              </View>
            </View>

            {/* 단어 목록 */}
            <ScrollView style={styles.previewList}>
              {duplicateResult?.newWords.map((pw, idx) => (
                <View key={`new-${idx}`} style={styles.previewItem}>
                  <View style={[styles.previewBadge, { backgroundColor: '#D1FAE5' }]}>
                    <Text style={[styles.previewBadgeText, { color: '#059669' }]}>신규</Text>
                  </View>
                  <View style={styles.previewItemContent}>
                    <Text style={styles.previewWord}>{pw.word}</Text>
                    <Text style={styles.previewMeaning} numberOfLines={1}>
                      {pw.meanings.join(', ')}
                    </Text>
                  </View>
                </View>
              ))}
              {!skipDuplicates &&
                duplicateResult?.duplicateWords.map((pw, idx) => (
                  <View key={`dup-${idx}`} style={styles.previewItem}>
                    <View style={[styles.previewBadge, { backgroundColor: '#FEF3C7' }]}>
                      <Text style={[styles.previewBadgeText, { color: '#D97706' }]}>중복</Text>
                    </View>
                    <View style={styles.previewItemContent}>
                      <Text style={styles.previewWord}>{pw.word}</Text>
                      <Text style={styles.previewMeaning} numberOfLines={1}>
                        {pw.meanings.join(', ')}
                      </Text>
                    </View>
                  </View>
                ))}
              {skipDuplicates && previewDupCount > 0 && (
                <View style={styles.previewSkippedInfo}>
                  <Text style={styles.previewSkippedText}>
                    중복 단어 {previewDupCount}개는 건너뜁니다
                  </Text>
                </View>
              )}
              {parseResult?.errors.map((err, idx) => (
                <View key={`err-${idx}`} style={styles.previewItem}>
                  <View style={[styles.previewBadge, { backgroundColor: '#FEE2E2' }]}>
                    <Text style={[styles.previewBadgeText, { color: '#DC2626' }]}>오류</Text>
                  </View>
                  <View style={styles.previewItemContent}>
                    <Text style={styles.previewErrorText} numberOfLines={1}>
                      {err.line}행: {err.reason}
                    </Text>
                  </View>
                </View>
              ))}
            </ScrollView>

            {/* 버튼 */}
            <View style={styles.previewButtons}>
              <TouchableOpacity
                style={styles.previewCancelButton}
                onPress={() => setShowPreview(false)}
                disabled={isSaving}
              >
                <Text style={styles.previewCancelButtonText}>취소</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.previewSaveButton,
                  (isSaving || totalToSave === 0) && styles.buttonDisabled,
                ]}
                onPress={handleSave}
                disabled={isSaving || totalToSave === 0}
              >
                {isSaving ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={styles.previewSaveButtonText}>
                    {totalToSave}개 저장
                  </Text>
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
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  section: {
    marginBottom: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: '#6B7280',
  },
  categorySelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    padding: 14,
  },
  categorySelectorText: {
    fontSize: 15,
    color: '#1A1A1A',
  },
  categorySelectorArrow: {
    fontSize: 12,
    color: '#6B7280',
  },
  pasteButton: {
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  pasteButtonText: {
    fontSize: 13,
    color: '#6366F1',
    fontWeight: '600',
  },
  csvInput: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    padding: 14,
    fontSize: 14,
    color: '#1A1A1A',
    minHeight: 160,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  formatHint: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 8,
    lineHeight: 18,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderWidth: 2,
    borderColor: '#D1D5DB',
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  checkboxChecked: {
    backgroundColor: '#6366F1',
    borderColor: '#6366F1',
  },
  checkboxMark: {
    fontSize: 14,
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  checkboxLabel: {
    fontSize: 15,
    color: '#1A1A1A',
  },
  checkboxHint: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 4,
    marginLeft: 32,
  },
  previewButton: {
    backgroundColor: '#6366F1',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  previewButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  // 모달 공통
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
    padding: 20,
    width: '100%',
    maxWidth: 400,
    maxHeight: '60%',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1A1A1A',
    marginBottom: 16,
  },
  modalList: {
    maxHeight: 300,
  },
  modalItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
    borderRadius: 6,
  },
  modalItemActive: {
    backgroundColor: '#EEF2FF',
  },
  modalItemText: {
    fontSize: 15,
    color: '#1A1A1A',
  },
  modalItemTextActive: {
    color: '#6366F1',
    fontWeight: '600',
  },
  modalItemCount: {
    fontSize: 13,
    color: '#9CA3AF',
  },
  modalCloseButton: {
    backgroundColor: '#E5E7EB',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 12,
  },
  modalCloseButtonText: {
    color: '#374151',
    fontSize: 15,
    fontWeight: '600',
  },
  // 미리보기 모달
  previewModalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 20,
    width: '100%',
    maxWidth: 500,
    maxHeight: '80%',
  },
  previewSummary: {
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    padding: 14,
    marginBottom: 16,
  },
  previewSummaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  previewSummaryLabel: {
    fontSize: 14,
    color: '#6B7280',
  },
  previewSummaryValue: {
    fontSize: 14,
    fontWeight: '600',
  },
  previewSummaryTotal: {
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    marginTop: 8,
    paddingTop: 8,
  },
  previewSummaryTotalLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  previewSummaryTotalValue: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#6366F1',
  },
  previewList: {
    maxHeight: 280,
    marginBottom: 16,
  },
  previewItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  previewBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    marginRight: 10,
  },
  previewBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  previewItemContent: {
    flex: 1,
  },
  previewWord: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  previewMeaning: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 2,
  },
  previewErrorText: {
    fontSize: 13,
    color: '#EF4444',
  },
  previewSkippedInfo: {
    padding: 12,
    backgroundColor: '#FEF3C7',
    borderRadius: 6,
    marginTop: 8,
  },
  previewSkippedText: {
    fontSize: 13,
    color: '#92400E',
    textAlign: 'center',
  },
  previewButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  previewCancelButton: {
    flex: 1,
    backgroundColor: '#E5E7EB',
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  previewCancelButtonText: {
    color: '#374151',
    fontSize: 15,
    fontWeight: '600',
  },
  previewSaveButton: {
    flex: 1,
    backgroundColor: '#6366F1',
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  previewSaveButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
});
