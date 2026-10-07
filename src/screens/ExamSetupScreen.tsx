import { useTranslation } from 'react-i18next';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { MaterialIcons } from '@expo/vector-icons';

import BottomSheet from '../components/BottomSheet';
import ScreenHeader from '../components/ScreenHeader';
import Toast from '../components/Toast';
import { FONT, RADIUS, SPACING } from '../constants/design';
import { EXAM_EXPECTED_WAIT_SEC, EXAM_SIZE } from '../constants/appConfig';
import { useTheme } from '../contexts/ThemeContext';
import { useToast } from '../hooks/useToast';
import { categoryService } from '../services/categoryService';
import { wordService } from '../services/wordService';
import {
  EXAM_LANGUAGES,
  countLanguages,
  detectCategoryLanguage,
  examService,
  type ExamLanguage,
} from '../services/examService';
import type { Category } from '../types/word';

/**
 * AI 시험 시작 화면.
 *
 * 플래시카드·퀴즈 설정과 나란히 보이지만 **묻는 것이 하나 더 있다. 언어를 묻는다.**
 *
 * 🔴 **언어를 왜 묻나** — 한자만 저장된 단어는 일본어인지 중국어인지 **원리적으로 구분할 수 없다**
 *    (`学校`). 추정을 기본값으로 내놓고 사용자가 고치게 둔다(사장님 결정 ②).
 *    틀린 언어로 보내면 문제가 통째로 엉뚱해지는데, 그 원가는 이미 나간 뒤다.
 *
 * 🔴 **오프라인을 미리 막지 않는다.** NetInfo 를 쓰지 않고, 호출이 `offline` 로 떨어질 때
 *    안내한다. 이 앱의 규율이 *"서버가 죽어도 앱은 멀쩡히 보여야 한다"* 이고,
 *    미리 회색으로 만들면 **네트워크가 멀쩡한데 못 쓰는** 경우가 생긴다.
 */

interface ExamSetupScreenProps {
  onBack: () => void;
  onStart: (categoryId: number, language: ExamLanguage) => void;
  /**
   * 성적표로. 🔴 **진입점을 여기 둔 이유** — 시험을 치러 온 사람이 지난 성적을 보고 싶어 한다.
   * 홈에 또 하나를 두면 홈이 길어지고, 설정에 두면 아무도 못 찾는다.
   */
  onHistory: () => void;
}

const LANGUAGE_LABEL: Record<ExamLanguage, string> = {
  ja: '일본어',
  en: '영어',
  ko: '한국어',
  zh: '중국어',
};

export default function ExamSetupScreen({ onBack, onStart, onHistory }: ExamSetupScreenProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { toast, showToast, hideToast } = useToast();

  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [language, setLanguage] = useState<ExamLanguage | null>(null);
  /** 사용자가 직접 고쳤나. 고쳤으면 카테고리를 바꿀 때까지 추정이 덮지 않는다 */
  const [languageTouched, setLanguageTouched] = useState(false);
  const [mixedCount, setMixedCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [detecting, setDetecting] = useState(false);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [isStarting, setIsStarting] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [data, prefs] = await Promise.all([
          categoryService.getCategories(),
          examService.loadPrefs(),
        ]);
        if (!alive) return;
        setCategories(data);
        const remembered = data.find((c) => c.categoryId === prefs.lastCategoryId);
        setSelectedCategoryId(remembered?.categoryId ?? data[0]?.categoryId ?? null);
      } catch (error: any) {
        console.warn('카테고리 조회 실패:', error);
        if (alive) showToast(t('카테고리를 불러오는데 실패했습니다'), 'error');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [showToast, t]);

  /**
   * 카테고리가 바뀌면 언어를 다시 정한다.
   *
   * 순서가 중요하다: **저장된 선택 > 글자 추정**. 사용자가 전에 고른 것을 추정이 덮으면
   * 같은 카테고리에서 매번 다시 고르게 된다.
   */
  useEffect(() => {
    if (selectedCategoryId === null) return;
    let alive = true;
    setDetecting(true);
    setLanguageTouched(false);
    (async () => {
      try {
        const [words, prefs] = await Promise.all([
          wordService.getWords(selectedCategoryId),
          examService.loadPrefs(),
        ]);
        if (!alive) return;
        setMixedCount(countLanguages(words));
        const saved = prefs.languageByCategory[String(selectedCategoryId)];
        setLanguage(saved ?? detectCategoryLanguage(words));
      } catch (error: any) {
        console.warn('언어 추정 실패:', error);
        // 추정에 실패해도 화면은 쓸 수 있어야 한다 — 사용자가 직접 고르면 된다
        if (alive) setLanguage(null);
      } finally {
        if (alive) setDetecting(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [selectedCategoryId]);

  const selectedCategory = useMemo(
    () => categories.find((c) => c.categoryId === selectedCategoryId),
    [categories, selectedCategoryId],
  );
  const wordCount = selectedCategory?.wordCount ?? 0;

  const handlePickLanguage = useCallback(
    (next: ExamLanguage) => {
      setLanguage(next);
      setLanguageTouched(true);
      if (selectedCategoryId === null) return;
      // 고른 즉시 저장한다. 다음에 이 카테고리를 열면 그대로 뜬다
      void examService.loadPrefs().then((prefs) =>
        examService.savePrefs({
          ...prefs,
          languageByCategory: {
            ...prefs.languageByCategory,
            [String(selectedCategoryId)]: next,
          },
        }),
      );
    },
    [selectedCategoryId],
  );

  const handleStart = useCallback(() => {
    if (isStarting) return;
    if (selectedCategoryId === null) {
      showToast(t('카테고리를 선택해주세요'), 'error');
      return;
    }
    if (wordCount === 0) {
      showToast(t('선택한 카테고리에 단어가 없습니다'), 'error');
      return;
    }
    // 🔴 언어를 못 정했으면 보내지 않는다. 추측으로 보내면 문제가 통째로 엉뚱해지고 원가는 나간다
    if (language === null) {
      showToast(t('어떤 언어의 단어인지 선택해주세요'), 'error');
      return;
    }
    setIsStarting(true);
    void examService
      .loadPrefs()
      .then((prefs) => examService.savePrefs({ ...prefs, lastCategoryId: selectedCategoryId }));
    onStart(selectedCategoryId, language);
  }, [isStarting, language, onStart, selectedCategoryId, showToast, t, wordCount]);

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
        <StatusBar style={colors.isDark ? 'light' : 'dark'} />
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loadingText, { color: colors.textSecondary }]}>{t('로딩 중...')}</Text>
      </View>
    );
  }

  if (categories.length === 0) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <StatusBar style={colors.isDark ? 'light' : 'dark'} />
        <ScreenHeader title={t('AI 시험')} onBack={onBack} />
        <View style={styles.emptyBox}>
          <MaterialIcons name="quiz" size={64} color={colors.textTertiary} />
          <Text style={[styles.emptyTitle, { color: colors.text }]}>{t('카테고리가 없습니다')}</Text>
          <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
            {t('먼저 카테고리를 생성해주세요')}
          </Text>
          <TouchableOpacity
            style={[styles.startButton, styles.emptyButton, { backgroundColor: colors.primaryStrong }]}
            onPress={onBack}
          >
            <Text style={styles.startButtonText}>{t('돌아가기')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style={colors.isDark ? 'light' : 'dark'} />
      <ScreenHeader
        title={t('AI 시험')}
        onBack={onBack}
        rightButton={{ text: t('성적표'), onPress: onHistory }}
      />

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        <View style={styles.section}>
          <Text style={[styles.label, { color: colors.text }]}>{t('카테고리')}</Text>
          <TouchableOpacity
            style={[styles.selector, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => setShowCategoryPicker(true)}
            accessibilityRole="button"
            accessibilityLabel={t('카테고리 선택')}
          >
            <View style={styles.selectorLeft}>
              <Text style={[styles.selectorText, { color: colors.text }]}>
                {selectedCategory?.categoryName || t('카테고리 선택')}
              </Text>
              {selectedCategory && (
                <Text style={[styles.selectorWordCount, { color: colors.textSecondary }]}>
                  {t('{{count}}개 단어', { count: wordCount })}
                </Text>
              )}
            </View>
            <MaterialIcons name="keyboard-arrow-down" size={20} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={[styles.label, { color: colors.text }]}>{t('단어의 언어')}</Text>
          <Text style={[styles.hint, { color: colors.textSecondary }]}>
            {detecting
              ? t('단어를 보고 언어를 찾고 있어요')
              : language === null
                ? t('어떤 언어인지 알 수 없어요. 직접 골라 주세요')
                : languageTouched
                  ? t('직접 고른 언어예요')
                  : t('단어를 보고 추측한 언어예요. 다르면 바꿔 주세요')}
          </Text>

          <View style={styles.languageRow}>
            {EXAM_LANGUAGES.map((code) => {
              const on = language === code;
              return (
                <TouchableOpacity
                  key={code}
                  style={[
                    styles.languageChip,
                    { backgroundColor: colors.card, borderColor: colors.border },
                    on && { backgroundColor: colors.primaryLight, borderColor: colors.primary },
                  ]}
                  onPress={() => handlePickLanguage(code)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                >
                  <Text
                    style={[
                      styles.languageChipText,
                      { color: colors.text },
                      on && { color: colors.primaryStrong, fontWeight: '700' },
                    ]}
                  >
                    {t(LANGUAGE_LABEL[code])}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* 🔴 섞여 있다는 것을 숨기지 않는다. 사장님이 엣지 케이스로 짚은 바로 그 경우다 */}
          {mixedCount > 1 && (
            <View
              style={[
                styles.notice,
                { backgroundColor: colors.warningBg, borderColor: colors.warningBorder },
              ]}
            >
              <MaterialIcons name="info-outline" size={16} color={colors.warningText} />
              <Text style={[styles.noticeText, { color: colors.warningText }]}>
                {t('이 카테고리에 {{count}}가지 언어가 섞여 있어요. 고른 언어의 단어로만 시험을 만들어요', {
                  count: mixedCount,
                })}
              </Text>
            </View>
          )}
        </View>

        <View style={[styles.infoBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.infoTitle, { color: colors.text }]}>{t('시험은 이렇게 나와요')}</Text>
          <Text style={[styles.infoLine, { color: colors.textSecondary }]}>
            {t('• 4개 보기 중에 고르는 문제 {{count}}개', { count: EXAM_SIZE })}
          </Text>
          <Text style={[styles.infoLine, { color: colors.textSecondary }]}>
            {t('• 복습할 때가 된 단어와 많이 틀린 단어를 먼저 내요')}
          </Text>
          {/* 🔴 90초다. 실측(단어 3개 34.5초)에서 나온 값이고 40초로 적으면 거짓이 된다 */}
          <Text style={[styles.infoLine, { color: colors.textSecondary }]}>
            {t('• 문제를 만드는 데 {{sec}}초쯤 걸려요', { sec: EXAM_EXPECTED_WAIT_SEC })}
          </Text>
          <Text style={[styles.infoLine, { color: colors.textSecondary }]}>
            {t('• 인터넷에 연결되어 있어야 해요')}
          </Text>
        </View>
      </ScrollView>

      <View style={[styles.footer, { backgroundColor: colors.background, borderTopColor: colors.border }]}>
        <TouchableOpacity
          style={[
            styles.startButton,
            { backgroundColor: colors.primaryStrong },
            (isStarting || wordCount === 0) && styles.startButtonDisabled,
          ]}
          onPress={handleStart}
          disabled={isStarting || wordCount === 0}
          accessibilityRole="button"
        >
          {isStarting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.startButtonText}>{t('시험 시작')}</Text>
          )}
        </TouchableOpacity>
      </View>

      <BottomSheet
        visible={showCategoryPicker}
        onClose={() => setShowCategoryPicker(false)}
        title={t('카테고리 선택')}
      >
        {categories.map((category) => {
          const on = category.categoryId === selectedCategoryId;
          return (
            <TouchableOpacity
              key={category.categoryId}
              style={[styles.sheetRow, { borderBottomColor: colors.border }]}
              onPress={() => {
                setSelectedCategoryId(category.categoryId);
                setShowCategoryPicker(false);
              }}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
            >
              <View style={styles.sheetRowLeft}>
                <Text style={[styles.sheetRowText, { color: colors.text }, on && { color: colors.primaryStrong }]}>
                  {category.categoryName}
                </Text>
                <Text style={[styles.sheetRowCount, { color: colors.textSecondary }]}>
                  {t('{{count}}개 단어', { count: category.wordCount ?? 0 })}
                </Text>
              </View>
              {on && <MaterialIcons name="check" size={20} color={colors.primary} />}
            </TouchableOpacity>
          );
        })}
      </BottomSheet>

      <Toast message={toast.message} type={toast.type} visible={toast.visible} onHide={hideToast} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: SPACING.md, fontSize: FONT.body },
  scrollView: { flex: 1 },
  scrollContent: { padding: SPACING.lg, paddingBottom: SPACING.xl },
  section: { marginBottom: SPACING.xl },
  label: { fontSize: FONT.label, fontWeight: '700', marginBottom: SPACING.sm },
  hint: { fontSize: FONT.caption, marginBottom: SPACING.sm, lineHeight: 18 },
  selector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
  },
  selectorLeft: { flex: 1 },
  selectorText: { fontSize: FONT.body, fontWeight: '600' },
  selectorWordCount: { fontSize: FONT.caption, marginTop: 2 },
  languageRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  languageChip: {
    borderWidth: 1,
    borderRadius: RADIUS.pill,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
  },
  languageChipText: { fontSize: FONT.body },
  notice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.sm,
    marginTop: SPACING.md,
    padding: SPACING.md,
    borderRadius: RADIUS.md,
    // 배경에 짝이 되는 글자색을 쓴다(`themes.ts` 의 대비 규약). card + textSecondary 로 두면
    // 안내가 눈에 안 띄고, warning 배경에 textSecondary 를 올리면 대비가 깨진다
    borderWidth: StyleSheet.hairlineWidth,
  },
  noticeText: { flex: 1, fontSize: FONT.caption, lineHeight: 18 },
  infoBox: { borderWidth: 1, borderRadius: RADIUS.md, padding: SPACING.md },
  infoTitle: { fontSize: FONT.label, fontWeight: '700', marginBottom: SPACING.sm },
  infoLine: { fontSize: FONT.caption, lineHeight: 20 },
  footer: { padding: SPACING.lg, borderTopWidth: StyleSheet.hairlineWidth },
  startButton: {
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.md,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  startButtonDisabled: { opacity: 0.5 },
  startButtonText: { color: '#fff', fontSize: FONT.body, fontWeight: '700' },
  emptyBox: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: SPACING.xl },
  emptyTitle: { fontSize: FONT.title, fontWeight: '700', marginTop: SPACING.lg },
  emptySubtitle: { fontSize: FONT.body, marginTop: SPACING.sm, textAlign: 'center' },
  emptyButton: { marginTop: SPACING.xl, paddingHorizontal: SPACING.xl },
  sheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACING.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sheetRowLeft: { flex: 1 },
  sheetRowText: { fontSize: FONT.body, fontWeight: '600' },
  sheetRowCount: { fontSize: FONT.caption, marginTop: 2 },
});
