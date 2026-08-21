import React from 'react';
import { useTranslation } from 'react-i18next';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';
import { FONT, HIT_SLOP, SPACING } from '../constants/design';

interface ScreenHeaderProps {
  title: string;
  onBack: () => void;
  rightButton?: {
    text: string;
    onPress: () => void;
  };
}

export default function ScreenHeader({ title, onBack, rightButton }: ScreenHeaderProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  // App 의 SafeAreaView 는 edges={['bottom']} 이라 상단 여백은 여기서 직접 준다.
  // 예전에는 paddingTop: 48 로 박아 뒀는데, 상태바 높이가 기기마다 달라서
  // 노치·펀치홀 기기에서 제목이 붙거나 떠 보였다.
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.header,
        {
          backgroundColor: colors.card,
          borderBottomColor: colors.border,
          paddingTop: insets.top + SPACING.md,
        },
      ]}
    >
      <TouchableOpacity
        onPress={onBack}
        style={styles.backButton}
        hitSlop={HIT_SLOP}
        accessibilityRole="button"
        accessibilityLabel={t('뒤로 가기')}
      >
        <MaterialIcons name="arrow-back-ios-new" size={20} color={colors.primary} />
      </TouchableOpacity>
      <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
        {title}
      </Text>
      {rightButton ? (
        <TouchableOpacity onPress={rightButton.onPress} style={styles.rightButton} hitSlop={HIT_SLOP}>
          <Text style={[styles.rightButtonText, { color: colors.primary }]}>{rightButton.text}</Text>
        </TouchableOpacity>
      ) : (
        <View style={styles.rightButton} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.md,
    borderBottomWidth: 1,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    flex: 1,
    textAlign: 'center',
    fontSize: FONT.title,
    fontWeight: 'bold',
  },
  rightButton: {
    width: 60,
    alignItems: 'flex-end',
  },
  rightButtonText: {
    fontSize: FONT.label,
    fontWeight: '600',
  },
});
