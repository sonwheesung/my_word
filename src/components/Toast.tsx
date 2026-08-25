import React, { useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Platform,
} from 'react-native';
import { useTheme } from '../contexts/ThemeContext';
import { FONT, RADIUS, SPACING } from '../constants/design';

export type ToastType = 'success' | 'error' | 'info';

interface ToastProps {
  message: string;
  type: ToastType;
  visible: boolean;
  onHide: () => void;
  duration?: number;
  /** 화면 하단에 이미 뭔가 깔려 있을 때 그만큼 띄운다(예: 배너 광고 높이) */
  offsetBottom?: number;
}

export default function Toast({
  message,
  type,
  visible,
  onHide,
  duration = 3000,
  offsetBottom = 0,
}: ToastProps) {
  const { colors } = useTheme();
  const opacity = React.useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.delay(duration),
        Animated.timing(opacity, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start(() => {
        onHide();
      });
    }
  }, [visible]);

  if (!visible) return null;

  const getBackgroundColor = () => {
    switch (type) {
      case 'success':
        return '#10B981';
      case 'error':
        return '#EF4444';
      case 'info':
        return '#6366F1';
      default:
        return '#6366F1';
    }
  };

  return (
    <Animated.View
      style={[
        styles.container,
        { backgroundColor: getBackgroundColor(), opacity, bottom: SPACING.xl + offsetBottom },
      ]}
    >
      <Text style={styles.message}>{message}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  /*
   * ⚠ bottom 은 인라인으로 준다. 예전에는 `bottom: 100` 이 박혀 있었는데, 화면 높이와
   *   무관한 값이라 목록 한가운데 떠서 항목을 덮었다. 화면은 이미 루트
   *   <SafeAreaView edges={['bottom']}> 안이므로 여기서 insets 를 또 더하면 안 된다.
   *   배너 광고가 있는 화면만 offsetBottom 으로 그 높이를 비켜 준다.
   */
  container: {
    position: 'absolute',
    left: SPACING.xl,
    right: SPACING.xl,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    borderRadius: RADIUS.md,
    zIndex: 9999,
    ...Platform.select({
      web: { boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)' },
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 12,
        elevation: 8,
      },
    }),
  },
  message: {
    color: '#FFFFFF',
    fontSize: FONT.body - 1,
    fontWeight: '600',
    textAlign: 'center',
  },
});
