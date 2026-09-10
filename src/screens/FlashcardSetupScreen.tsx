import { useTranslation } from 'react-i18next';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Switch,
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
import { useTheme } from '../contexts/ThemeContext';
import { useToast } from '../hooks/useToast';
import { categoryService } from '../services/categoryService';
import { srsService } from '../services/srsService';
import {
  DEFAULT_PREFS,
  flashcardService,
  type CardOrder,
  type FlashcardPrefs,
} from '../services/flashcardService';
import type { Category } from '../types/word';

/**
 * 플래시카드 시작 화면.
 *
 * 퀴즈 설정과 나란히 보이지만 **묻는 것이 하나 적다. 문제 수를 안 묻는다.**
 * 퀴즈는 5~30개로 자르는데 훑어보기는 고른 카테고리를 전부 본다. 자르면 그게 퀴즈다.
 */

interface FlashcardSetupScreenProps {
  onBack: () => void;
  onStart: (categoryId: number, order: CardOrder, frontIsWord: boolean, autoSpeak: boolean) => void;
}

const ORDERS: Array<{ value: CardOrder; label: string; description: string }> = [
  { value: 'created', label: '등록순', description: '먼저 넣은 단어부터' },
  { value: 'shuffle', label: '무작위', description: '섞어서 보기' },
  // 퀴즈의 '취약한 단어'(많이 틀린 것)와 다르다. 이쪽은 **언제** 볼지를 본다
  { value: 'due', label: '복습순', description: '복습할 때가 된 단어부터' },
];

export default function FlashcardSetupScreen({ onBack, onStart }: FlashcardSetupScreenProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { toast, showToast, hideToast } = useToast();

  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [prefs, setPrefs] = useState<FlashcardPrefs>(DEFAULT_PREFS);
  const [dueByCategory, setDueByCategory] = useState<Record<number, number>>({});
  const [loading, setLoading] = useState(true);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [isStarting, setIsStarting] = useState(false);

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const [data, saved] = await Promise.all([
          categoryService.getCategories(),
          flashcardService.loadPrefs(),
        ]);
        if (!alive) return;
        setCategories(data);
        setPrefs(saved);
        // 마지막에 본 카테고리가 아직 있으면 거기서 시작한다. 없으면 첫 번째
        const remembered = data.find((c) => c.categoryId === saved.lastCategoryId);
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

  useEffect(() => {
    let alive = true;
    srsService
      .getDueSummary()
      .then((summary) => {
        if (alive) setDueByCategory(summary.byCategory);
      })
      .catch(() => {
        // 만기를 못 읽어도 이 화면은 그대로 쓸 수 있어야 한다
      });
    return () => {
      alive = false;
    };
  }, []);

  const selectedCategory = categories.find((c) => c.categoryId === selectedCategoryId);
  const availableWordCount = selectedCategory?.wordCount ?? 0;
  const selectedDueCount = selectedCategoryId === null ? 0 : dueByCategory[selectedCategoryId] ?? 0;

  const patch = useCallback((next: Partial<FlashcardPrefs>) => {
    setPrefs((prev) => ({ ...prev, ...next }));
  }, []);

  const handleStart = useCallback(() => {
    if (isStarting) return;
    if (selectedCategoryId === null) {
      showToast(t('카테고리를 선택해주세요'), 'error');
      return;
    }
    if (availableWordCount === 0) {
      showToast(t('선택한 카테고리에 단어가 없습니다'), 'error');
      return;
    }
    setIsStarting(true);
    // 저장을 기다리지 않는다. 취향 저장이 늦어서 카드가 늦게 뜨면 손해다
    void flashcardService.savePrefs({ ...prefs, lastCategoryId: selectedCategoryId });
    onStart(selectedCategoryId, prefs.order, prefs.frontIsWord, prefs.autoSpeak);
  }, [availableWordCount, isStarting, onStart, prefs, selectedCategoryId, showToast, t]);

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
        <ScreenHeader title={t('플래시카드')} onBack={onBack} />
        <View style={styles.emptyBox}>
          <MaterialIcons name="style" size={64} color={colors.textTertiary} />
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
      <ScreenHeader title={t('플래시카드')} onBack={onBack} />

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
                  {t('{{count}}개 단어', { count: availableWordCount })}
                  {selectedDueCount > 0 && (
                    <Text style={{ color: colors.primary }}>
                      {t(' · 복습 {{count}}', { count: selectedDueCount })}
                    </Text>
                  )}
                </Text>
              )}
            </View>
            <MaterialIcons name="keyboard-arrow-down" size={20} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={[styles.label, { color: colors.text }]}>{t('순서')}</Text>
          {ORDERS.map((order) => {
            const on = prefs.order === order.value;
            return (
              <TouchableOpacity
                key={order.value}
                style={[
                  styles.option,
                  { backgroundColor: colors.card, borderColor: colors.border },
                  on && { borderColor: colors.primary, backgroundColor: colors.primaryLight },
                ]}
                onPress={() => patch({ order: order.value })}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
              >
                <View style={styles.optionText}>
                  <Text
                    style={[
                      styles.optionLabel,
                      { color: colors.text },
                      on && { color: colors.primaryStrong },
                    ]}
                  >
                    {t(order.label)}
                  </Text>
                  <Text style={[styles.optionDescription, { color: colors.textSecondary }]}>
                    {t(order.description)}
                  </Text>
                </View>
                <View style={[styles.radio, { borderColor: colors.border }, on && { borderColor: colors.primary }]}>
                  {on && <View style={[styles.radioDot, { backgroundColor: colors.primary }]} />}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={styles.section}>
          <Text style={[styles.label, { color: colors.text }]}>{t('카드 앞면')}</Text>
          <View style={styles.segments}>
            {[
              { value: true, label: '단어' },
              { value: false, label: '뜻' },
            ].map((seg) => {
              const on = prefs.frontIsWord === seg.value;
              return (
                <TouchableOpacity
                  key={String(seg.value)}
                  style={[
                    styles.segment,
                    { backgroundColor: colors.card, borderColor: colors.border },
                    on && { backgroundColor: colors.primaryLight, borderColor: colors.primary },
                  ]}
                  onPress={() => patch({ frontIsWord: seg.value })}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                >
                  <Text
                    style={[
                      styles.segmentText,
                      { color: colors.textSecondary },
                      on && { color: colors.primaryStrong, fontWeight: '600' },
                    ]}
                  >
                    {t(seg.label)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View style={[styles.switchRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.optionText}>
            <Text style={[styles.optionLabel, { color: colors.text }]}>{t('발음 자동 재생')}</Text>
            <Text style={[styles.optionDescription, { color: colors.textSecondary }]}>
              {t('카드가 뜰 때 소리로 읽어 줘요')}
            </Text>
          </View>
          <Switch
            value={prefs.autoSpeak}
            onValueChange={(value) => patch({ autoSpeak: value })}
            trackColor={{ false: colors.border, true: colors.primaryLight }}
            thumbColor={prefs.autoSpeak ? colors.primary : colors.textTertiary}
            accessibilityLabel={t('발음 자동 재생')}
          />
        </View>

        <TouchableOpacity
          style={[
            styles.startButton,
            { backgroundColor: colors.primaryStrong },
            isStarting && styles.startButtonBusy,
          ]}
          onPress={handleStart}
          disabled={isStarting}
          accessibilityRole="button"
        >
          <Text style={styles.startButtonText}>
            {availableWordCount > 0
              ? t('{{count}}장 시작하기', { count: availableWordCount })
              : t('시작하기')}
          </Text>
        </TouchableOpacity>
      </ScrollView>

      <BottomSheet
        visible={showCategoryPicker}
        onClose={() => setShowCategoryPicker(false)}
        title={t('카테고리 선택')}
        scrollable
      >
        {categories.map((category) => {
          const on = category.categoryId === selectedCategoryId;
          const due = dueByCategory[category.categoryId] ?? 0;
          return (
            <TouchableOpacity
              key={category.categoryId}
              style={[styles.sheetRow, { borderBottomColor: colors.borderLight }]}
              onPress={() => {
                setSelectedCategoryId(category.categoryId);
                setShowCategoryPicker(false);
              }}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
            >
              <View style={styles.selectorLeft}>
                <Text style={[styles.sheetRowText, { color: on ? colors.primary : colors.text }]}>
                  {category.categoryName}
                </Text>
                <Text style={[styles.selectorWordCount, { color: colors.textSecondary }]}>
                  {t('{{count}}개 단어', { count: category.wordCount ?? 0 })}
                  {due > 0 && (
                    <Text style={{ color: colors.primary }}>
                      {t(' · 복습 {{count}}', { count: due })}
                    </Text>
                  )}
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
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: SPACING.md,
    fontSize: 14,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: SPACING.xl,
  },
  section: {
    marginBottom: SPACING.xxl,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: SPACING.md,
  },
  selector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: RADIUS.md,
    padding: 14,
  },
  selectorLeft: {
    flex: 1,
  },
  selectorText: {
    fontSize: FONT.body,
  },
  selectorWordCount: {
    fontSize: FONT.caption,
    marginTop: 2,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: RADIUS.md,
    padding: 14,
    marginBottom: SPACING.sm,
  },
  optionText: {
    flex: 1,
  },
  optionLabel: {
    fontSize: FONT.body,
    fontWeight: '500',
  },
  optionDescription: {
    fontSize: FONT.caption,
    marginTop: 2,
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: SPACING.md,
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  segments: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  segment: {
    flex: 1,
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: RADIUS.md,
    paddingVertical: 12,
  },
  segmentText: {
    fontSize: FONT.body,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: RADIUS.md,
    padding: 14,
    marginBottom: SPACING.xxl,
  },
  startButton: {
    borderRadius: RADIUS.xl,
    padding: SPACING.lg,
    alignItems: 'center',
    marginTop: SPACING.sm,
  },
  startButtonBusy: {
    opacity: 0.6,
  },
  startButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  sheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  sheetRowText: {
    fontSize: FONT.body,
    fontWeight: '500',
  },
  emptyBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.xl,
  },
  emptyTitle: {
    fontSize: FONT.title,
    fontWeight: '600',
    marginTop: SPACING.lg,
  },
  emptySubtitle: {
    fontSize: 14,
    marginTop: SPACING.sm,
    textAlign: 'center',
  },
  emptyButton: {
    alignSelf: 'stretch',
    marginTop: SPACING.xxl,
  },
});
