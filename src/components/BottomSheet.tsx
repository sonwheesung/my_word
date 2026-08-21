import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useTheme } from '../contexts/ThemeContext';
import { FONT, RADIUS, SPACING } from '../constants/design';

interface BottomSheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  /** 시트가 차지할 수 있는 최대 높이. 화면 대비 비율 */
  maxHeightRatio?: number;
  /** 내용이 이미 스크롤을 가진 경우(FlatList 등) 바깥 ScrollView 를 끈다 */
  scrollable?: boolean;
  /** 입력 필드가 있는 시트. 키보드가 올라와도 가려지지 않게 밀어 올린다 */
  avoidKeyboard?: boolean;
}

/**
 * 아래에서 올라오는 시트.
 *
 * 화면 한가운데 팝업을 대신한다. 항목이 늘어나면 가운데 팝업은 세로로 길어지고
 * 위쪽에 엄지가 닿지 않는다. 시트는 손이 있는 쪽에서 열린다.
 *
 * ⚠ 바깥을 눌러 닫는 구조라 시트 안쪽의 터치를 반드시 끊어야 한다.
 *   activeOpacity=1 인 TouchableOpacity 를 겹쳐 두는 것이 RN 에서 가장 단순한 방법이다.
 */
export default function BottomSheet({
  visible,
  onClose,
  title,
  children,
  maxHeightRatio = 0.7,
  scrollable = true,
  avoidKeyboard = false,
}: BottomSheetProps) {
  const { colors } = useTheme();

  const body = scrollable ? (
    <ScrollView keyboardShouldPersistTaps="handled">{children}</ScrollView>
  ) : (
    children
  );

  const sheet = (
    <TouchableOpacity
      style={styles.overlay}
      activeOpacity={1}
      onPress={onClose}
      accessibilityRole="button"
      accessibilityLabel="닫기"
    >
      <TouchableOpacity
        activeOpacity={1}
        style={[
          styles.sheet,
          { backgroundColor: colors.card, maxHeight: `${Math.round(maxHeightRatio * 100)}%` },
        ]}
      >
        <View style={[styles.grabber, { backgroundColor: colors.border }]} />
        {title ? <Text style={[styles.title, { color: colors.text }]}>{title}</Text> : null}
        {body}
      </TouchableOpacity>
    </TouchableOpacity>
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      {avoidKeyboard ? (
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          {sheet}
        </KeyboardAvoidingView>
      ) : (
        sheet
      )}
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: RADIUS.sheet,
    borderTopRightRadius: RADIUS.sheet,
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.xxl,
  },
  grabber: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: SPACING.md,
  },
  title: {
    fontSize: FONT.title - 2,
    fontWeight: 'bold',
    paddingHorizontal: SPACING.xl,
    marginBottom: SPACING.sm,
  },
});
