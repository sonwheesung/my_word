import { useTranslation } from 'react-i18next';
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
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { categoryService } from '../services/categoryService';
import { wordService } from '../services/wordService';
import { dictionaryService } from '../services/dictionaryService';
import type { Category } from '../types/word';
import Toast from '../components/Toast';
import { useToast } from '../hooks/useToast';
import ScreenHeader from '../components/ScreenHeader';
import { useTheme } from '../contexts/ThemeContext';
import { normalizeForCompare } from '../utils/text';
import {
  COUNTER_THRESHOLD,
  FONT,
  HIT_SLOP,
  INPUT_PADDING_H,
  INPUT_PADDING_V,
  LIMITS,
  RADIUS,
  SPACING,
} from '../constants/design';

/** 메모 입력 상한. 남은 글자수를 보여주려면 화면도 이 값을 알아야 한다 */
const MEMO_MAX = 500;

interface AddWordScreenProps {
  wordId?: number | null;
  onWordAdded: () => void;
  onBack: () => void;
}

export default function AddWordScreen({ wordId, onWordAdded, onBack }: AddWordScreenProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
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
  // 예문·태그·메모는 선택 항목이다. 대부분은 단어와 뜻만 넣으므로 기본은 접어 둔다.
  const [showOptional, setShowOptional] = useState(false);

  /**
   * 뜻·예문 입력칸 참조.
   *
   * `+ 추가` 를 누르면 빈 칸만 생기고 커서는 그대로였다. 그래서 추가 → 새 칸 탭 → 입력,
   * 늘 두 번을 눌러야 했다. 새로 생긴 칸으로 포커스를 옮기려면 목록 전체의 ref 가 필요하다.
   */
  const meaningRefs = useRef<Array<TextInput | null>>([]);
  const exampleRefs = useRef<Array<TextInput | null>>([]);

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
      showToast(t('카테고리를 불러오는데 실패했습니다'), 'error');
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
      showToast(t('단어를 불러오는데 실패했습니다'), 'error');
    } finally {
      setLoadingWord(false);
    }
  };

  const addMeaning = () => {
    if (meanings.length >= LIMITS.meanings) {
      // 상한에서는 버튼 자체를 감추므로 여기까지 오지 않는다. 방어용으로만 남긴다
      showToast(t('뜻은 최대 {{count}}개까지 추가할 수 있습니다', { count: LIMITS.meanings }), 'error');
      return;
    }
    const nextIndex = meanings.length;
    setMeanings([...meanings, '']);
    // 새 칸이 실제로 붙은 다음 프레임에 커서를 옮긴다. 키보드가 내려가지 않아 흐름이 안 끊긴다
    requestAnimationFrame(() => meaningRefs.current[nextIndex]?.focus());
  };

  const removeMeaning = (index: number) => {
    if (meanings.length > 1) {
      const newMeanings = meanings.filter((_, i) => i !== index);
      setMeanings(newMeanings);
      // 지운 칸의 ref 가 남아 있으면 다음 추가 때 엉뚱한 칸으로 포커스가 간다
      meaningRefs.current.splice(index, 1);
    }
  };

  const updateMeaning = (index: number, value: string) => {
    const newMeanings = [...meanings];
    newMeanings[index] = value;
    setMeanings(newMeanings);
  };

  const addExample = () => {
    if (examples.length >= LIMITS.examples) {
      showToast(t('예문은 최대 {{count}}개까지 추가할 수 있습니다', { count: LIMITS.examples }), 'error');
      return;
    }
    const nextIndex = examples.length;
    setExamples([...examples, { example: '', translation: '' }]);
    requestAnimationFrame(() => exampleRefs.current[nextIndex]?.focus());
  };

  const removeExample = (index: number) => {
    if (examples.length > 1) {
      const newExamples = examples.filter((_, i) => i !== index);
      setExamples(newExamples);
      exampleRefs.current.splice(index, 1);
    }
  };

  const updateExample = (index: number, field: 'example' | 'translation', value: string) => {
    // 얕은 복사만 하면 index 위치의 객체는 같은 참조라 상태를 직접 건드리게 된다.
    // 항목까지 새로 만들어 준다
    const newExamples = examples.map((item, i) => (i === index ? { ...item, [field]: value } : item));
    setExamples(newExamples);
  };

  const addTag = () => {
    const trimmed = tagInput.trim();
    if (!trimmed) return;
    if (tags.length >= LIMITS.tags) {
      showToast(t('태그는 최대 {{count}}개까지 추가할 수 있습니다', { count: LIMITS.tags }), 'error');
      setTagInput('');
      return;
    }
    if (tags.some(t => normalizeForCompare(t) === normalizeForCompare(trimmed))) {
      showToast(t('이미 추가된 태그입니다'), 'error');
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
      showToast(t('단어를 입력해주세요'), 'error');
      return;
    }

    Keyboard.dismiss();
    setSearching(true);

    try {
      const outcome = await dictionaryService.lookup(trimmed);

      if (!outcome.ok) {
        if (outcome.reason === 'same-language') {
          showToast(t('단어와 뜻이 같은 언어입니다. 뜻은 직접 입력해주세요'), 'info');
        } else {
          showToast(t('사전에서 단어를 찾을 수 없습니다'), 'error');
        }
        return;
      }

      const result = outcome.data;

      // 기존 데이터 초기화 후 검색 결과로 덮어쓰기
      setMeanings(result.meanings.length > 0 ? result.meanings : ['']);
      setExamples(result.examples.length > 0 ? result.examples : [{ example: '', translation: '' }]);
      setTags(result.partOfSpeech);
      setMemo('');

      // 예문은 영어 표제어만 존재한다. 조용히 비워두면 "가져오기가 실패했나" 싶으므로 밝힌다
      if (result.examplesUnsupported) {
        showToast(t('뜻 {{count}}개를 가져왔습니다 (예문은 영어 단어만 지원합니다)', { count: result.meanings.length }), 'info');
      } else {
        showToast(t('뜻 {{meanings}}개, 예문 {{examples}}개를 가져왔습니다', { meanings: result.meanings.length, examples: result.examples.length }), 'success');
      }
    } catch (error: any) {
      console.warn('사전 검색 실패:', error);
      showToast(error.message || t('사전 검색에 실패했습니다'), 'error');
    } finally {
      setSearching(false);
    }
  };

  const handleSave = async () => {
    // 유효성 검사
    if (!selectedCategoryId) {
      showToast(t('카테고리를 선택해주세요'), 'error');
      return;
    }

    if (!word.trim()) {
      showToast(t('단어를 입력해주세요'), 'error');
      return;
    }

    const filteredMeanings = meanings.filter((m) => m.trim());
    if (filteredMeanings.length === 0) {
      showToast(t('최소 하나의 뜻을 입력해주세요'), 'error');
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
        t('중복 단어'),
        t('"{{word}}" 단어가 이미 등록되어 있습니다.\n그래도 저장하시겠습니까?', { word: word.trim() }),
        [
          { text: t('취소'), style: 'cancel' },
          { text: t('저장'), onPress: () => performSave() },
        ],
      );
      return;
    }

    // 수정 시 confirm
    if (isEditMode && wordId) {
      Alert.alert(t('확인'), t('단어를 수정하시겠습니까?'), [
        { text: t('취소'), style: 'cancel' },
        {
          text: t('수정'),
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
      showToast(t('카테고리를 선택해주세요'), 'error');
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
        showToast(t('단어가 수정되었습니다'), 'success');
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
        showToast(t('단어가 추가되었습니다'), 'success');
        onWordAdded();
      }
    } catch (error: any) {
      console.warn('단어 저장 실패:', error);
      showToast(error.message || t('단어 저장에 실패했습니다'), 'error');
    } finally {
      setLoading(false);
    }
  };

  const selectedCategory = categories.find((c) => c.categoryId === selectedCategoryId);

  if (loadingCategories || loadingWord) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
          {loadingWord ? t('단어 로딩 중...') : t('카테고리 로딩 중...')}
        </Text>
      </View>
    );
  }

  if (categories.length === 0) {
    return (
      <View style={[styles.emptyContainer, { backgroundColor: colors.background }]}>
        <StatusBar style={colors.isDark ? 'light' : 'dark'} />
        <MaterialIcons name="folder-open" size={64} color={colors.textTertiary} style={styles.emptyIcon} />
        <Text style={[styles.emptyTitle, { color: colors.text }]}>{t('카테고리가 없습니다')}</Text>
        <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>{t('먼저 카테고리를 생성해주세요')}</Text>
        <TouchableOpacity
          style={[styles.saveButton, styles.emptyAction, { backgroundColor: colors.primaryStrong }]}
          onPress={onBack}
          accessibilityRole="button"
        >
          <Text style={styles.saveButtonText}>{t('돌아가기')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style={colors.isDark ? 'light' : 'dark'} />
      <ScreenHeader title={isEditMode ? t('단어 수정') : t('단어 추가')} onBack={onBack} />

      {/*
        저장 바를 키보드 위로 밀어 올린다. 없으면 메모나 뒤쪽 예문을 채울 때
        키보드가 입력칸과 저장 버튼을 함께 덮는다.
      */}
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* ── 카테고리 ── */}
          <View style={styles.section}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>{t('카테고리')}</Text>
            <TouchableOpacity
              style={[styles.field, styles.selectField, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={() => setShowCategoryPicker(true)}
              disabled={loading}
              accessibilityRole="button"
              accessibilityLabel={t('카테고리 선택')}
            >
              <Text style={[styles.selectText, { color: colors.text }]} numberOfLines={1}>
                {selectedCategory?.categoryName || t('카테고리 선택')}
              </Text>
              <MaterialIcons name="keyboard-arrow-down" size={20} color={colors.textTertiary} />
            </TouchableOpacity>
          </View>

          {/* ── 단어 ── */}
          <View style={styles.section}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>{t('단어')}</Text>
            <View style={styles.inlineRow}>
              <TextInput
                style={[styles.field, styles.flex, { backgroundColor: colors.card, borderColor: colors.border, color: colors.text }]}
                placeholder={t('단어를 입력하세요')}
                placeholderTextColor={colors.textTertiary}
                value={word}
                // 입력값을 가공하지 않는다. 첫 글자를 강제로 소문자로 바꾸면
                // 독일어 명사(Apfel)나 고유명사가 틀린 철자로 저장되고,
                // 터키어 İ 는 i + 결합 점으로 글자 수까지 늘어난다
                onChangeText={setWord}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="search"
                blurOnSubmit={false}
                onSubmitEditing={handleDictionarySearch}
                maxLength={100}
                editable={!loading && !searching}
              />
              {/*
                보조 액션이다. 채운 버튼은 화면에 저장 하나만 둔다 —
                둘 다 채워 두면 어느 쪽이 최종 동작인지 알 수 없다.
              */}
              <TouchableOpacity
                style={[
                  styles.secondaryButton,
                  { backgroundColor: colors.primaryLight, borderColor: colors.border },
                  (searching || !word.trim()) && styles.disabled,
                ]}
                onPress={handleDictionarySearch}
                disabled={searching || !word.trim() || loading}
              >
                {searching ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <Text style={[styles.secondaryButtonText, { color: colors.primary }]}>{t('뜻 찾기')}</Text>
                )}
              </TouchableOpacity>
            </View>
            <Text style={[styles.hint, { color: colors.textTertiary }]}>
              {t('찾기를 누르면 뜻과 예문을 자동으로 채웁니다')}
            </Text>
          </View>

          {/* ── 뜻 ── */}
          <View style={styles.section}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>{t('뜻')}</Text>

            {meanings.map((meaning, index) => (
              <View key={index} style={styles.listRow}>
                <TextInput
                  ref={(el) => {
                    meaningRefs.current[index] = el;
                  }}
                  style={[styles.field, styles.flex, { backgroundColor: colors.card, borderColor: colors.border, color: colors.text }]}
                  placeholder={t('뜻 {{n}}', { n: index + 1 })}
                  placeholderTextColor={colors.textTertiary}
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
                    hitSlop={HIT_SLOP}
                    accessibilityRole="button"
                    accessibilityLabel={t('뜻 {{n}} 삭제', { n: index + 1 })}
                  >
                    <MaterialIcons name="close" size={18} color={colors.textTertiary} />
                  </TouchableOpacity>
                )}
              </View>
            ))}

            {/*
              목록 끝에 둔다. 다 채운 손가락이 그대로 닿는 자리다.
              상한에 닿으면 아예 감춘다 — 눌러 보고 나서 막힌 걸 알면 답답하다.
            */}
            {meanings.length < LIMITS.meanings && (
              <TouchableOpacity
                onPress={addMeaning}
                disabled={loading}
                style={styles.ghostButton}
                hitSlop={HIT_SLOP}
                accessibilityRole="button"
              >
                <MaterialIcons name="add" size={16} color={colors.primary} />
                <Text style={[styles.ghostButtonText, { color: colors.primary }]}>{t('뜻 추가')}</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* ── 선택 항목 접기 ── */}
          <TouchableOpacity
            style={[
              styles.foldToggle,
              { borderTopColor: colors.border, borderBottomColor: showOptional ? 'transparent' : colors.border },
            ]}
            onPress={() => setShowOptional((prev) => !prev)}
            accessibilityRole="button"
            accessibilityState={{ expanded: showOptional }}
          >
            <Text style={[styles.foldTitle, { color: colors.text }]}>{t('예문 · 태그 · 메모')}</Text>
            <View style={styles.foldRight}>
              <Text style={[styles.foldHint, { color: colors.textTertiary }]}>
                {/* `선택` 은 '고르다'로도 읽혀 영어 번역이 Select 로 굳어 있다. 뜻이 갈리지 않는 키를 쓴다 */}
                {showOptional ? t('접기') : t('선택 항목')}
              </Text>
              <MaterialIcons
                name={showOptional ? 'keyboard-arrow-up' : 'keyboard-arrow-down'}
                size={20}
                color={colors.textTertiary}
              />
            </View>
          </TouchableOpacity>

          {showOptional && (
            <View style={styles.foldBody}>
              {/* 예문 */}
              <View style={styles.section}>
                <Text style={[styles.label, { color: colors.textSecondary }]}>{t('예문')}</Text>

                {examples.map((example, index) => (
                  // 원문과 번역은 한 쌍이다. 왼쪽 가는 선으로 묶어 두면 회색 카드로 감싸지 않고도
                  // 짝이 보인다 — 카드로 감싸면 예문 두 개만 넣어도 화면이 꽉 찬다
                  <View key={index} style={styles.exampleGroup}>
                    <View style={[styles.exampleRule, { backgroundColor: colors.border }]} />
                    <View style={styles.flex}>
                      <TextInput
                        ref={(el) => {
                          exampleRefs.current[index] = el;
                        }}
                        style={[styles.field, styles.exampleInput, { backgroundColor: colors.card, borderColor: colors.border, color: colors.text }]}
                        placeholder={t('예문')}
                        placeholderTextColor={colors.textTertiary}
                        value={example.example}
                        // 첫 글자 강제 대문자화 제거 — 대소문자가 없는 언어에는 무의미하고
                        // 있는 언어에서는 사용자가 의도한 표기를 덮어쓴다.
                        // 대문자 힌트는 아래 autoCapitalize(키보드 설정)로 충분하다
                        onChangeText={(value) => updateExample(index, 'example', value)}
                        autoCapitalize="sentences"
                        autoCorrect={false}
                        multiline
                        maxLength={300}
                        editable={!loading}
                      />
                      <TextInput
                        style={[styles.field, { backgroundColor: colors.card, borderColor: colors.border, color: colors.text }]}
                        placeholder={t('번역 (선택)')}
                        placeholderTextColor={colors.textTertiary}
                        value={example.translation}
                        onChangeText={(value) => updateExample(index, 'translation', value)}
                        autoCorrect={false}
                        multiline
                        maxLength={300}
                        editable={!loading}
                      />
                    </View>
                    {examples.length > 1 && (
                      <TouchableOpacity
                        onPress={() => removeExample(index)}
                        disabled={loading}
                        style={styles.removeButton}
                        hitSlop={HIT_SLOP}
                        accessibilityRole="button"
                        accessibilityLabel={t('예문 {{n}} 삭제', { n: index + 1 })}
                      >
                        <MaterialIcons name="close" size={18} color={colors.textTertiary} />
                      </TouchableOpacity>
                    )}
                  </View>
                ))}

                {examples.length < LIMITS.examples && (
                  <TouchableOpacity
                    onPress={addExample}
                    disabled={loading}
                    style={styles.ghostButton}
                    hitSlop={HIT_SLOP}
                    accessibilityRole="button"
                  >
                    <MaterialIcons name="add" size={16} color={colors.primary} />
                    <Text style={[styles.ghostButtonText, { color: colors.primary }]}>{t('예문 추가')}</Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* 태그 */}
              <View style={styles.section}>
                <Text style={[styles.label, { color: colors.textSecondary }]}>{t('태그')}</Text>
                {tags.length > 0 && (
                  <View style={styles.tagChipsContainer}>
                    {tags.map((tag, index) => (
                      <View
                        key={index}
                        style={[styles.tagChip, { backgroundColor: colors.primaryLight, borderColor: colors.border }]}
                      >
                        <Text style={[styles.tagChipText, { color: colors.primary }]}>{tag}</Text>
                        <TouchableOpacity
                          onPress={() => removeTag(index)}
                          disabled={loading}
                          hitSlop={HIT_SLOP}
                          accessibilityRole="button"
                          accessibilityLabel={t('태그 {{tag}} 삭제', { tag })}
                        >
                          <MaterialIcons name="close" size={13} color={colors.primary} />
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                )}
                {/*
                  `추가` 버튼을 없앴다. 엔터로 넣을 수 있는데 버튼까지 있으면 손이 두 번 간다.
                  대신 그 방법을 플레이스홀더가 알려준다.
                */}
                <TextInput
                  style={[styles.field, { backgroundColor: colors.card, borderColor: colors.border, color: colors.text }]}
                  placeholder={t('입력하고 엔터를 누르면 추가됩니다')}
                  placeholderTextColor={colors.textTertiary}
                  value={tagInput}
                  onChangeText={setTagInput}
                  onSubmitEditing={addTag}
                  returnKeyType="done"
                  blurOnSubmit={false}
                  autoCapitalize="none"
                  autoCorrect={false}
                  maxLength={30}
                  editable={!loading}
                />
              </View>

              {/* 메모 */}
              <View style={styles.section}>
                <Text style={[styles.label, { color: colors.textSecondary }]}>{t('메모')}</Text>
                <TextInput
                  style={[styles.field, styles.memoInput, { backgroundColor: colors.card, borderColor: colors.border, color: colors.text }]}
                  placeholder={t('헷갈리는 점, 외우는 팁 등을 메모하세요')}
                  placeholderTextColor={colors.textTertiary}
                  value={memo}
                  onChangeText={setMemo}
                  multiline
                  textAlignVertical="top"
                  maxLength={MEMO_MAX}
                  editable={!loading}
                />
                {/* 상한이 걸려 있는데 표시가 없으면 500자에서 입력이 그냥 멈춘 것처럼 보인다 */}
                {memo.length > COUNTER_THRESHOLD && (
                  <Text style={[styles.counter, { color: colors.textTertiary }]}>
                    {memo.length} / {MEMO_MAX}
                  </Text>
                )}
              </View>
            </View>
          )}
        </ScrollView>

        {/*
          저장을 스크롤 밖으로 뺀다. 폼 안에 있으면 어디서 입력을 끝내든
          매번 맨 아래까지 내려야 저장할 수 있다.
        */}
        <View style={[styles.saveBar, { backgroundColor: colors.card, borderTopColor: colors.border }]}>
          <TouchableOpacity
            style={[styles.saveButton, { backgroundColor: colors.primaryStrong }, loading && styles.disabled]}
            onPress={handleSave}
            disabled={loading}
            accessibilityRole="button"
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.saveButtonText}>{t('저장하기')}</Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {/* ── 카테고리 선택 시트 ── */}
      <Modal
        visible={showCategoryPicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowCategoryPicker(false)}
      >
        <TouchableOpacity
          style={styles.sheetOverlay}
          activeOpacity={1}
          onPress={() => setShowCategoryPicker(false)}
        >
          {/*
            화면 한가운데 팝업이 아니라 아래에서 올라오게 한다. 카테고리가 늘어나면
            가운데 팝업은 세로로 길어지고 위쪽 항목에 엄지가 닿지 않는다.
            시트 안쪽 터치는 여기서 끊어야 눌렀을 때 같이 닫히지 않는다.
          */}
          <TouchableOpacity activeOpacity={1} style={[styles.sheet, { backgroundColor: colors.card }]}>
            <View style={[styles.sheetGrabber, { backgroundColor: colors.border }]} />
            <Text style={[styles.sheetTitle, { color: colors.text }]}>{t('카테고리 선택')}</Text>
            <ScrollView style={styles.sheetList}>
              {categories.map((category) => {
                const selected = selectedCategoryId === category.categoryId;
                return (
                  <TouchableOpacity
                    key={category.categoryId}
                    style={[styles.sheetOption, selected && { backgroundColor: colors.primaryLight }]}
                    onPress={() => {
                      setSelectedCategoryId(category.categoryId);
                      setShowCategoryPicker(false);
                    }}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                  >
                    <Text
                      style={[
                        styles.sheetOptionText,
                        { color: colors.textSecondary },
                        selected && { color: colors.primary, fontWeight: '600' },
                      ]}
                      numberOfLines={1}
                    >
                      {category.categoryName}
                    </Text>
                    {selected && <MaterialIcons name="check" size={18} color={colors.primary} />}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
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
  },
  flex: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: SPACING.md,
    fontSize: FONT.label,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.xxl,
  },
  emptyIcon: {
    marginBottom: SPACING.lg,
  },
  emptyTitle: {
    fontSize: FONT.display,
    fontWeight: 'bold',
    marginBottom: SPACING.sm,
  },
  emptySubtitle: {
    fontSize: FONT.label,
    marginBottom: SPACING.xxl,
  },
  /** 빈 상태의 버튼은 화면 폭 전체를 채울 이유가 없다 */
  emptyAction: {
    paddingHorizontal: SPACING.xxl + SPACING.md,
  },

  scrollContent: {
    padding: SPACING.xl,
    paddingBottom: SPACING.xxl,
  },
  section: {
    marginBottom: SPACING.xl,
  },
  label: {
    fontSize: FONT.label,
    fontWeight: '600',
    marginBottom: SPACING.sm,
  },

  // ── 입력 ──
  /**
   * 입력 계열 공통 치수. 높이 40dp 로 맞춘다.
   * ⚠ radius 를 16 으로 두면 알약처럼 보여서 입력칸으로 안 읽힌다.
   */
  field: {
    borderWidth: 1,
    borderRadius: RADIUS.md,
    paddingVertical: INPUT_PADDING_V,
    paddingHorizontal: INPUT_PADDING_H,
    fontSize: FONT.body,
  },
  selectField: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  selectText: {
    flex: 1,
    fontSize: FONT.body,
  },
  inlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    marginBottom: SPACING.sm,
  },
  hint: {
    fontSize: FONT.caption,
    marginTop: SPACING.xs + 2,
  },
  counter: {
    fontSize: FONT.micro,
    textAlign: 'right',
    marginTop: SPACING.xs,
  },
  memoInput: {
    minHeight: 88,
  },

  // ── 버튼 3단 위계 ──
  /** 주 액션: 화면당 하나. 채운 배경 + 흰 글씨 */
  saveBar: {
    borderTopWidth: 1,
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.md,
  },
  saveButton: {
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.lg,
    alignItems: 'center',
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: FONT.body + 1,
    fontWeight: 'bold',
  },
  /** 보조 액션: 연한 배경 + 테두리. 되돌릴 수 있는 동작 */
  secondaryButton: {
    borderWidth: 1,
    borderRadius: RADIUS.md,
    paddingVertical: INPUT_PADDING_V,
    paddingHorizontal: SPACING.lg,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 72,
  },
  secondaryButtonText: {
    fontSize: FONT.label,
    fontWeight: '600',
  },
  /** 3차 액션: 글자만. 반복 가능한 소소한 조작 */
  ghostButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    alignSelf: 'flex-start',
    paddingVertical: SPACING.xs + 2,
  },
  ghostButtonText: {
    fontSize: FONT.label,
    fontWeight: '600',
  },
  removeButton: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: {
    opacity: 0.5,
  },

  // ── 선택 항목 접기 ──
  foldToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    paddingVertical: SPACING.lg,
  },
  foldTitle: {
    fontSize: FONT.label + 1,
    fontWeight: '600',
  },
  foldRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  foldHint: {
    fontSize: FONT.caption,
  },
  foldBody: {
    paddingTop: SPACING.lg,
  },

  // ── 예문 ──
  exampleGroup: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  exampleRule: {
    width: 2,
    alignSelf: 'stretch',
    borderRadius: 1,
  },
  exampleInput: {
    marginBottom: SPACING.xs + 2,
  },

  // ── 태그 ──
  tagChipsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  tagChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs + 2,
    borderWidth: 1,
    borderRadius: RADIUS.pill,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs + 2,
  },
  tagChipText: {
    fontSize: FONT.caption + 1,
    fontWeight: '500',
  },

  // ── 카테고리 시트 ──
  sheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: RADIUS.sheet,
    borderTopRightRadius: RADIUS.sheet,
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.xxl,
    maxHeight: '70%',
  },
  sheetGrabber: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: SPACING.md,
  },
  sheetTitle: {
    fontSize: FONT.title - 2,
    fontWeight: 'bold',
    paddingHorizontal: SPACING.xl,
    marginBottom: SPACING.sm,
  },
  sheetList: {
    paddingHorizontal: SPACING.sm,
  },
  sheetOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md + 2,
  },
  sheetOptionText: {
    flex: 1,
    fontSize: FONT.body,
  },
});
