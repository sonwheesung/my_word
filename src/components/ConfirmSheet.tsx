import React from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { FONT, RADIUS, SPACING } from '../constants/design';
import { useTheme } from '../contexts/ThemeContext';
import BottomSheet from './BottomSheet';

/**
 * "정말 할까요?" 를 **앱 화풍으로** 묻는다 (2026-10-12 시안 #16).
 *
 * 🔴 **`Alert.alert` 로 묻지 않는다.** 기기 기본 대화상자는 앱 색 · 다크 테마를 안 따르고,
 *    무엇을 지우는지 **글자 한 줄로만** 말한다. 그리고 안드로이드는 버튼이 3개를 넘으면
 *    조용히 버린다(2026-10-12 에 ⋯ 메뉴가 그래서 막다른 상태가 됐다).
 *
 * ⚠ **새 `Modal` 을 만들지 않는다.** 공용 `BottomSheet` 위의 **얇은 껍데기**다 —
 *   어둠막 · 끌어 내려 닫기 · 하단 여백 규칙이 한 곳에 있어야 한다(시안 #15).
 *
 * ⚠ **위험한 쪽이 오른쪽**이다. 손이 가장 멀리 가는 자리이고, 색으로 한 번 더 알린다.
 * ⚠ `busy` 중에는 바깥 눌림 · 끌어 내리기로 닫히지 않는다.
 */

interface ConfirmSheetProps {
  visible: boolean;
  /** 「abandon 을 지울까요?」처럼 **무엇을** 하는지 제목에 넣는다 */
  title: string;
  /** 「퀴즈 기록과 복습 일정도 함께 지워져요.」처럼 **대가**를 적는다 */
  message?: string;
  /** 지울 단어 미니 카드 · 이전 → 새 비교처럼 눈으로 확인할 것 */
  preview?: React.ReactNode;
  confirmLabel: string;
  /** `danger` 는 되돌릴 수 없는 것에만 쓴다 */
  tone?: 'danger' | 'primary';
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

const BUTTON_HEIGHT = 52;

export default function ConfirmSheet({
  visible,
  title,
  message,
  preview,
  confirmLabel,
  tone = 'primary',
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmSheetProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const confirmBg = tone === 'danger' ? colors.error : colors.primaryStrong;

  return (
    <BottomSheet
      visible={visible}
      // 🔴 지우는 중에는 못 닫는다 — 닫히면 무엇이 끝났는지 알 수 없다
      onClose={busy ? () => {} : onCancel}
      title={title}
      scrollable={false}
    >
      {preview}
      {message ? (
        <Text style={[styles.message, { color: colors.textSecondary }]}>{message}</Text>
      ) : null}
      <View style={styles.row}>
        <TouchableOpacity
          style={[styles.button, { backgroundColor: colors.surface }]}
          onPress={onCancel}
          disabled={busy}
          accessibilityRole="button"
        >
          <Text style={[styles.cancelText, { color: colors.textSecondary }]}>{t('취소')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.button, { backgroundColor: confirmBg, opacity: busy ? 0.7 : 1 }]}
          onPress={onConfirm}
          disabled={busy}
          accessibilityRole="button"
        >
          {busy ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.confirmText}>{confirmLabel}</Text>
          )}
        </TouchableOpacity>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  message: {
    fontSize: FONT.label + 1,
    lineHeight: 22,
    marginTop: SPACING.sm,
  },
  row: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginTop: SPACING.lg,
  },
  button: {
    flex: 1,
    height: BUTTON_HEIGHT,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelText: { fontSize: FONT.body, fontWeight: '600' },
  confirmText: { fontSize: FONT.body, fontWeight: '700', color: '#FFFFFF' },
});
