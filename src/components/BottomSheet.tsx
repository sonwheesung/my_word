import React from 'react';
import { useTranslation } from 'react-i18next';
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
  const { t } = useTranslation();
  const { colors } = useTheme();
  // Modal 은 루트 <SafeAreaView edges={['bottom']}> 바깥의 별도 네이티브 뷰에 그려진다.
  // 즉 루트가 주는 하단 여백이 시트에는 닿지 않는다. edgeToEdgeEnabled=true 라
  // 시트가 내비게이션 바 아래까지 내려가므로 여기서 직접 비켜 준다.
  // (이 값을 빼먹으면 3버튼 내비바 기기에서 시트 맨 아래 버튼이 절반 잘린다)
  const insets = useSafeAreaInsets();

  const body = scrollable ? (
    <ScrollView keyboardShouldPersistTaps="handled">{children}</ScrollView>
  ) : (
    children
  );

  const sheet = (
    <View style={styles.overlay}>
      {/*
        바깥을 눌러 닫는 영역. 시트를 감싸지 않고 **형제**로 둔다.
        감싸면 시트 안의 버튼이 이 버튼 안에 중첩돼 두 가지가 깨진다 —
        웹에서 `<button> cannot contain a nested <button>` DOM 오류가 나고,
        스크린 리더는 시트 전체를 "닫기" 버튼 하나로 읽어 내용을 못 읽는다.
        먼저 그려지므로 시트가 위에 얹힌다.
      */}
      <TouchableOpacity
        style={StyleSheet.absoluteFill}
        activeOpacity={1}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel={t('닫기')}
      />
      <View
        style={[
          styles.sheet,
          {
            backgroundColor: colors.card,
            maxHeight: `${Math.round(maxHeightRatio * 100)}%`,
            paddingBottom: SPACING.xxl + insets.bottom,
          },
        ]}
      >
        <View style={[styles.grabber, { backgroundColor: colors.border }]} />
        {title ? <Text style={[styles.title, { color: colors.text }]}>{title}</Text> : null}
        {body}
      </View>
    </View>
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
    // paddingBottom 은 insets.bottom 을 더해 인라인으로 준다
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
