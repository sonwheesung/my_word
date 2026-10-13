import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { useTranslation } from 'react-i18next';
import { MaterialIcons } from '@expo/vector-icons';

import BottomSheet from './BottomSheet';
import { useTheme } from '../contexts/ThemeContext';
import { FONT, RADIUS, SPACING } from '../constants/design';
import { toLocalDateKey } from '../utils/date';
import type { BackupSummary } from '../services/backupService';

/**
 * 복원·복구 확인. **두 곳이 같은 시트를 쓴다**(2026-10-13 에 서버 복구가 합류했다).
 *
 * ```
 * 백업 파일에서 복원   지금 기기 vs 백업 파일   파일 이름 · 만든 날짜를 함께 보여 준다
 * 서버에서 복구        지금 기기 vs 서버        날짜가 없다(받은 시각은 사용자에게 의미가 없다)
 * ```
 *
 * 🔴 이 화면의 존재 이유는 **숫자를 보여 주는 것**이다. "덮어쓸까요?" 만 띄우면 사용자는
 *    무엇을 잃는지 모른 채 누른다. 지금 기기와 들어올 것을 나란히 놓아야 판단할 수 있다.
 *
 * 데이터가 아예 없는 기기(새 기기·초기화 직후)에서는 화면이 이 시트를 띄우지 않고 바로
 * 복원한다 — 잃을 것이 없는데 묻는 것은 방해일 뿐이다.
 *
 * ⚠ **베껴서 두 벌로 만들지 않았다.** 경고 문구·안전 사본 안내가 두 벌이 되면 한쪽만
 *   고쳐지고, 그 어긋남은 **되돌릴 수 없는 버튼 바로 위**에 앉는다.
 */

interface RestoreConfirmSheetProps {
  visible: boolean;
  /** 지금 기기의 상태. null 이면 아직 세는 중 */
  current: BackupSummary | null;
  /** 들어올 것의 상태 — 고른 백업 파일이거나 서버 */
  incoming: BackupSummary | null;
  /** 빈 문자열이면 그 줄을 그리지 않는다(서버 복구에는 파일이 없다) */
  fileName: string;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  /** 시트 제목. 기본은 백업 파일 쪽 */
  title?: string;
  /** 아랫줄의 이름. 기본은 백업 파일 쪽 */
  incomingLabel?: string;
  /** 확인 버튼 글자. 기본은 백업 파일 쪽 */
  confirmLabel?: string;
  /** 날짜 줄의 이름. `null` 이면 날짜를 아예 안 그린다 */
  dateLabel?: string | null;
  /** 경고 상자 아래 한 줄 더. 서버 복구가 못 되돌리는 것을 여기에 적는다 */
  note?: string;
}

export default function RestoreConfirmSheet({
  visible,
  current,
  incoming,
  fileName,
  busy,
  onCancel,
  onConfirm,
  title,
  incomingLabel,
  confirmLabel,
  dateLabel,
  note,
}: RestoreConfirmSheetProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();

  const renderRow = (label: string, s: BackupSummary | null, emphasis: boolean) => (
    <View style={[styles.row, { borderBottomColor: colors.borderLight }]}>
      <Text style={[styles.rowLabel, { color: colors.textTertiary }]}>{label}</Text>
      <Text
        style={[
          styles.rowValue,
          { color: emphasis ? colors.primaryStrong : colors.text },
          emphasis && styles.rowValueEmphasis,
        ]}
      >
        {s
          ? t('단어 {{words}} · 카테고리 {{categories}} · 퀴즈 {{quizzes}}', {
              words: s.words.toLocaleString(),
              categories: s.categories.toLocaleString(),
              quizzes: s.quizResults.toLocaleString(),
            })
          : '—'}
      </Text>
    </View>
  );

  return (
    <BottomSheet
      visible={visible}
      onClose={busy ? () => {} : onCancel}
      title={title ?? t('백업에서 복원')}
    >
      <View style={styles.body}>
        {fileName === '' ? null : (
          <Text style={[styles.fileName, { color: colors.textSecondary }]} numberOfLines={1}>
            {fileName}
          </Text>
        )}

        <View style={[styles.table, { backgroundColor: colors.surface }]}>
          {renderRow(t('지금 기기'), current, false)}
          {renderRow(incomingLabel ?? t('백업 파일'), incoming, true)}
          {dateLabel !== null && incoming?.exportedAt ? (
            <View style={styles.rowLast}>
              <Text style={[styles.rowLabel, { color: colors.textTertiary }]}>
                {dateLabel ?? t('만든 날짜')}
              </Text>
              <Text style={[styles.rowValue, { color: colors.text }]}>
                {toLocalDateKey(incoming.exportedAt)}
              </Text>
            </View>
          ) : null}
        </View>

        <View style={[styles.warning, { backgroundColor: colors.dangerBg, borderColor: colors.dangerBorder }]}>
          <MaterialIcons name="warning-amber" size={18} color={colors.dangerText} />
          <View style={styles.warningText}>
            <Text style={[styles.warningTitle, { color: colors.dangerText }]}>
              {t('복원하면 지금 기기의 데이터는 사라집니다')}
            </Text>
            <Text style={[styles.warningBody, { color: colors.dangerText }]}>
              {t('되돌릴 수 없어서, 복원 직전에 현재 상태를 파일로 한 벌 남겨 둡니다')}
            </Text>
          </View>
        </View>

        {note === undefined ? null : (
          <Text style={[styles.note, { color: colors.textTertiary }]}>{note}</Text>
        )}

        <TouchableOpacity
          onPress={onConfirm}
          disabled={busy}
          activeOpacity={0.8}
          accessibilityRole="button"
          style={[styles.confirm, { backgroundColor: busy ? colors.border : colors.primary }]}
        >
          {busy ? (
            <ActivityIndicator color={colors.textOnPrimary} />
          ) : (
            <Text style={[styles.confirmText, { color: colors.textOnPrimary }]}>
              {confirmLabel ?? t('복원')}
            </Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          onPress={onCancel}
          disabled={busy}
          activeOpacity={0.7}
          accessibilityRole="button"
          style={styles.cancel}
        >
          <Text style={[styles.cancelText, { color: colors.textTertiary }]}>{t('취소')}</Text>
        </TouchableOpacity>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  // 가로 여백은 BottomSheet 가 준다(SHEET_GUTTER)
  body: {},
  fileName: {
    fontSize: FONT.label,
    textAlign: 'center',
    marginBottom: SPACING.md,
  },
  table: {
    borderRadius: RADIUS.lg,
    paddingHorizontal: SPACING.lg,
  },
  row: {
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
  },
  rowLast: {
    paddingVertical: SPACING.md,
  },
  rowLabel: {
    fontSize: FONT.caption,
    marginBottom: 2,
  },
  rowValue: {
    fontSize: 14,
  },
  rowValueEmphasis: {
    fontWeight: 'bold',
  },
  warning: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginTop: SPACING.lg,
    padding: SPACING.md,
    borderRadius: RADIUS.md,
    // themes.ts 규칙: dangerBg 위에는 짝이 되는 dangerText 를 올린다(대비가 보장된 조합)
    borderWidth: 1,
  },
  warningText: {
    flex: 1,
  },
  warningTitle: {
    fontSize: FONT.label,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  warningBody: {
    fontSize: FONT.caption,
    lineHeight: 17,
    opacity: 0.85,
  },
  note: {
    fontSize: FONT.caption,
    lineHeight: 17,
    marginTop: SPACING.md,
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
  cancel: {
    paddingVertical: SPACING.md,
    alignItems: 'center',
  },
  cancelText: {
    fontSize: 14,
  },
});
