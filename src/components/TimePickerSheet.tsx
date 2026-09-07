import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { useTranslation } from 'react-i18next';

import BottomSheet from './BottomSheet';
import { useTheme } from '../contexts/ThemeContext';
import { FONT, RADIUS, SPACING } from '../constants/design';
import { formatTime, type TimeOfDay } from '../utils/notificationSchedule';

/**
 * 알림 시각 고르기 — 시 / 분 두 열.
 *
 * 🔴 `@react-native-community/datetimepicker` 를 쓰지 않는다. 시각 하나를 고르자고
 *    **네이티브 의존성을 하나 더 늘리는** 값이 아니다 — 늘리면 R8 검증 대상과 jest 목이
 *    같이 늘고, OTA 로 못 보내는 범위도 넓어진다. 기존 BottomSheet 위에 목록 두 개면 된다.
 *
 * 분은 5분 단위다. 복습 알림에 1분 단위 정밀도는 의미가 없고(안드로이드는 부정확 알람으로
 * 걸리므로 어차피 몇 분 흔들린다), 60줄짜리 목록은 고르기만 어렵다.
 */

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTE_STEP = 5;
const MINUTES = Array.from({ length: 60 / MINUTE_STEP }, (_, i) => i * MINUTE_STEP);

interface TimePickerSheetProps {
  visible: boolean;
  value: TimeOfDay;
  onClose: () => void;
  onConfirm: (next: TimeOfDay) => void;
}

export default function TimePickerSheet({ visible, value, onClose, onConfirm }: TimePickerSheetProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();

  const [hour, setHour] = useState(value.hour);
  const [minute, setMinute] = useState(value.minute);

  // 시트를 다시 열 때마다 **현재 저장된 값**에서 시작해야 한다.
  // 안 맞춰 주면 지난번에 고르다 만 값이 남아 있어 "내가 고른 적 없는 시각"이 확인된다.
  useEffect(() => {
    if (!visible) return;
    setHour(value.hour);
    // 5분 단위 목록에 없는 값이 저장돼 있을 수 있다(예전 버전·손으로 고친 값).
    // 가장 가까운 눈금으로 내려 맞춘다 — 목록에 없는 값은 아무것도 선택되지 않은 것처럼 보인다.
    setMinute(Math.min(55, Math.round(value.minute / MINUTE_STEP) * MINUTE_STEP));
  }, [visible, value.hour, value.minute]);

  const preview = useMemo(() => formatTime({ hour, minute }), [hour, minute]);

  const renderOption = (
    label: string,
    selected: boolean,
    onPress: () => void,
    key: string | number,
  ) => (
    <TouchableOpacity
      key={key}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={[
        styles.option,
        {
          backgroundColor: selected ? colors.primaryLight : 'transparent',
          borderColor: selected ? colors.primary : 'transparent',
        },
      ]}
    >
      <Text
        style={[
          styles.optionText,
          { color: selected ? colors.primaryStrong : colors.textSecondary },
          selected && styles.optionTextSelected,
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );

  return (
    <BottomSheet visible={visible} onClose={onClose} title={t('알림 시각')} scrollable={false}>
      <View style={styles.body}>
        <Text style={[styles.preview, { color: colors.primaryStrong }]}>{preview}</Text>

        <View style={styles.columns}>
          <View style={styles.column}>
            <Text style={[styles.columnLabel, { color: colors.textTertiary }]}>{t('시')}</Text>
            <ScrollView
              style={[styles.list, { backgroundColor: colors.surface }]}
              showsVerticalScrollIndicator={false}
            >
              {HOURS.map((h) =>
                renderOption(String(h).padStart(2, '0'), h === hour, () => setHour(h), h),
              )}
            </ScrollView>
          </View>

          <View style={styles.column}>
            <Text style={[styles.columnLabel, { color: colors.textTertiary }]}>{t('분')}</Text>
            <ScrollView
              style={[styles.list, { backgroundColor: colors.surface }]}
              showsVerticalScrollIndicator={false}
            >
              {MINUTES.map((m) =>
                renderOption(String(m).padStart(2, '0'), m === minute, () => setMinute(m), m),
              )}
            </ScrollView>
          </View>
        </View>

        <TouchableOpacity
          onPress={() => onConfirm({ hour, minute })}
          activeOpacity={0.8}
          accessibilityRole="button"
          style={[styles.confirm, { backgroundColor: colors.primary }]}
        >
          <Text style={[styles.confirmText, { color: colors.textOnPrimary }]}>{t('확인')}</Text>
        </TouchableOpacity>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  body: {
    paddingHorizontal: SPACING.xl,
  },
  preview: {
    fontSize: 32,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: SPACING.lg,
  },
  columns: {
    flexDirection: 'row',
    gap: SPACING.md,
  },
  column: {
    flex: 1,
  },
  columnLabel: {
    fontSize: FONT.caption,
    marginBottom: SPACING.xs,
    textAlign: 'center',
  },
  list: {
    // 목록 자체를 고정 높이로 둔다. 시트가 화면을 다 먹지 않게 하면서
    // "위아래로 더 있다"는 것이 잘린 항목으로 보이게 하는 높이다.
    height: 200,
    borderRadius: RADIUS.lg,
    paddingVertical: SPACING.xs,
  },
  option: {
    paddingVertical: SPACING.md,
    marginHorizontal: SPACING.sm,
    marginVertical: 2,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    alignItems: 'center',
  },
  optionText: {
    fontSize: 16,
  },
  optionTextSelected: {
    fontWeight: 'bold',
  },
  confirm: {
    marginTop: SPACING.xl,
    paddingVertical: SPACING.lg,
    borderRadius: RADIUS.md,
    alignItems: 'center',
  },
  confirmText: {
    fontSize: 16,
    fontWeight: 'bold',
  },
});
