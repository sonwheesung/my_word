import React, { useEffect, useMemo, useRef, useState } from 'react';
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

/** 줄 사이 간격 = styles.option 의 marginVertical × 2. 스타일과 **함께** 고쳐야 한다 */
const ROW_GAP = 4;
/** 목록 위쪽 안쪽 여백 = styles.list 의 paddingVertical */
const LIST_PADDING = SPACING.xs;

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

  // 🔴 목록은 맨 위에서 시작한다 — 21시로 설정돼 있어도 화면에는 00 부터 보여서, 사용자는
  //    **지금 몇 시로 돼 있는지 스크롤해야만 알 수 있다.** 열릴 때 선택된 줄로 스크롤해 준다.
  //
  //    ⚠ 처음엔 "선택된 줄이 onLayout 으로 보고한 y 를 onContentSizeChange 에서 쓴다"로 짰는데
  //      **에뮬레이터에서 안 먹었다.** 네이티브 레이아웃 콜백과 effect 의 도착 순서가 보장되지
  //      않아, 스크롤 요청 플래그가 세워지기 전에 콜백이 지나가 버린다.
  //      그래서 **순서에 기대지 않는다** — 줄 높이만 한 번 재고 인덱스로 곱해 위치를 직접 낸다.
  //      줄은 전부 같은 스타일이라 높이가 같고, 높이를 상수로 박지 않으므로 글꼴이 바뀌어도 따라간다.
  const hourListRef = useRef<ScrollView>(null);
  const minuteListRef = useRef<ScrollView>(null);
  /** 줄 하나의 높이(마진 제외). 첫 줄이 배치될 때 한 번만 받는다 */
  const itemHeight = useRef(0);

  // 시트를 다시 열 때마다 **현재 저장된 값**에서 시작해야 한다.
  // 안 맞춰 주면 지난번에 고르다 만 값이 남아 있어 "내가 고른 적 없는 시각"이 확인된다.
  useEffect(() => {
    if (!visible) return;
    setHour(value.hour);
    // 5분 단위 목록에 없는 값이 저장돼 있을 수 있다(예전 버전·손으로 고친 값).
    // 가장 가까운 눈금으로 내려 맞춘다 — 목록에 없는 값은 아무것도 선택되지 않은 것처럼 보인다.
    const snappedMinute = Math.min(55, Math.round(value.minute / MINUTE_STEP) * MINUTE_STEP);
    setMinute(snappedMinute);

    // 줄 높이는 배치가 끝나야 알 수 있다. 아직이면 다음 프레임에 다시 본다(최대 10프레임 ≈ 160ms).
    let timer: ReturnType<typeof setTimeout> | null = null;
    let tries = 0;
    const tick = () => {
      if (itemHeight.current > 0) {
        const pitch = itemHeight.current + ROW_GAP;
        // 선택된 줄이 맨 위에 딱 붙으면 "위에 더 있다"는 것이 안 보인다. 한 줄쯤 위를 남긴다.
        const offset = (index: number) => Math.max(0, LIST_PADDING + (index - 1) * pitch);
        hourListRef.current?.scrollTo({ y: offset(value.hour), animated: false });
        minuteListRef.current?.scrollTo({ y: offset(snappedMinute / MINUTE_STEP), animated: false });
        return;
      }
      if (tries < 10) {
        tries += 1;
        timer = setTimeout(tick, 16);
      }
    };
    timer = setTimeout(tick, 0);
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [visible, value.hour, value.minute]);

  const preview = useMemo(() => formatTime({ hour, minute }), [hour, minute]);

  const renderOption = (
    label: string,
    selected: boolean,
    onPress: () => void,
    key: string | number,
    isFirst: boolean,
  ) => (
    <TouchableOpacity
      key={key}
      onPress={onPress}
      onLayout={
        isFirst
          ? (e) => {
              // 줄은 전부 같은 스타일이므로 첫 줄 하나만 재면 된다.
              itemHeight.current = e.nativeEvent.layout.height;
            }
          : undefined
      }
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
              ref={hourListRef}
              style={[styles.list, { backgroundColor: colors.surface }]}
              showsVerticalScrollIndicator={false}
            >
              {HOURS.map((h, i) =>
                renderOption(String(h).padStart(2, '0'), h === hour, () => setHour(h), h, i === 0),
              )}
            </ScrollView>
          </View>

          <View style={styles.column}>
            <Text style={[styles.columnLabel, { color: colors.textTertiary }]}>{t('분')}</Text>
            <ScrollView
              ref={minuteListRef}
              style={[styles.list, { backgroundColor: colors.surface }]}
              showsVerticalScrollIndicator={false}
            >
              {MINUTES.map((m, i) =>
                renderOption(String(m).padStart(2, '0'), m === minute, () => setMinute(m), m, i === 0),
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
