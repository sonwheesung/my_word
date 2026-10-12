import React, { useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Platform,
  TouchableOpacity,
  Easing,
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
  /**
   * 되돌릴 수 있는 동작에 붙이는 버튼 (2026-10-12 시안 #16).
   *
   * 🔴 **버튼이 붙으면 남은 시간 막대도 같이 뜬다.** 되돌릴 수 있다는 걸 알려 놓고
   *    언제까지인지 안 보여 주면, 누르려는 순간 사라져 더 나쁘다.
   */
  action?: { label: string; onPress: () => void };
}

export default function Toast({
  message,
  type,
  visible,
  onHide,
  duration = 3000,
  offsetBottom = 0,
  action,
}: ToastProps) {
  const { colors } = useTheme();
  const opacity = React.useRef(new Animated.Value(0)).current;
  /** 남은 시간 막대. ⚠ `scaleX` 라 네이티브 드라이버로 돈다(레이아웃 값이 아니다) */
  const bar = React.useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (visible) {
      // 🔴 되돌리기를 누를 수 있는 동안만 막대가 줄어든다. 길이 0 timing 으로 되돌린다
      //    (`setValue` 를 네이티브 값에 섞지 않는다 — 1.7.0 사고 조건)
      Animated.timing(bar, { toValue: 1, duration: 0, useNativeDriver: true }).start(() => {
        if (action) {
          Animated.timing(bar, {
            toValue: 0,
            duration,
            easing: Easing.linear,
            useNativeDriver: true,
          }).start();
        }
      });
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
      ]).start(({ finished }) => {
        if (finished) onHide();
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
      <View style={styles.row}>
        <Text style={[styles.message, action ? styles.messageWithAction : null]}>{message}</Text>
        {action ? (
          <TouchableOpacity
            onPress={action.onPress}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
          >
            <Text style={styles.actionLabel}>{action.label}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      {action ? (
        <Animated.View
          style={[styles.bar, { transform: [{ scaleX: bar }] }]}
          pointerEvents="none"
        />
      ) : null}
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
  /** 버튼이 붙으면 가운데 정렬이 아니라 왼쪽이다 — 버튼이 오른쪽 끝에 선다 */
  messageWithAction: { flex: 1, textAlign: 'left' },
  row: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  actionLabel: {
    color: '#FFFFFF',
    fontSize: FONT.body - 1,
    fontWeight: '800',
    textDecorationLine: 'underline',
  },
  /** 남은 시간. 🔴 왼쪽 기준으로 줄어든다(`scaleX` 는 가운데가 기준이라 원점을 옮긴다) */
  bar: {
    height: 2,
    marginTop: SPACING.sm,
    marginHorizontal: -SPACING.lg,
    marginBottom: -SPACING.md + 2,
    backgroundColor: 'rgba(255,255,255,0.6)',
    transformOrigin: 'left center',
  },
});
