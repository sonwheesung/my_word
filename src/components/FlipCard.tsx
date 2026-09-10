import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View, type ViewStyle } from 'react-native';

import { RADIUS } from '../constants/design';
import { useTheme } from '../contexts/ThemeContext';

/**
 * 앞뒤가 뒤집히는 카드.
 *
 * 🔴 **`react-native-reanimated` 를 쓰지 않는다.** 이 앱은 reanimated 를 어디서도 쓰고 있지
 *    않다(2026-09-10 실측. `babel.config.js` 에 플러그인만 등록돼 있고 사용처가 0건이다).
 *    라이브 앱에 **새 네이티브 표면을 들이는 값**이 카드 뒤집기 하나로는 맞지 않는다.
 *    R8 이 조용히 죽이는 것이 네이티브 모듈 등록이라, 안 늘리는 것이 곧 위험을 안 늘리는 것이다.
 *    RN 내장 `Animated` 는 이미 `Toast` 와 `SkeletonLoader` 가 쓰고 있고 릴리스 빌드 E2E 를
 *    세 번 통과한 코드다.
 *
 * ⚠ `backfaceVisibility` 에 기대지 않고 **두 면을 겹쳐 놓고 투명도로 가린다.**
 *   안드로이드에서 backface 가 기기마다 다르게 나오는 것을 피하려는 것이다. 대신 뒷면이
 *   보이지 않을 때도 마운트돼 있으므로, 뒷면 안의 스크롤 위치가 뒤집을 때마다 초기화되지 않는다.
 */

const FLIP_MS = 240;

interface FlipCardProps {
  /** true 면 뒷면을 보여준다 */
  flipped: boolean;
  front: React.ReactNode;
  back: React.ReactNode;
  style?: ViewStyle;
}

export default function FlipCard({ flipped, front, back, style }: FlipCardProps) {
  const { colors } = useTheme();
  const progress = useRef(new Animated.Value(flipped ? 1 : 0)).current;

  useEffect(() => {
    const animation = Animated.timing(progress, {
      toValue: flipped ? 1 : 0,
      duration: FLIP_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    animation.start();
    // 화면을 떠날 때 애니메이션이 남아 값을 건드리지 않게 끊는다
    return () => animation.stop();
  }, [flipped, progress]);

  const frontRotate = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '180deg'],
  });
  const backRotate = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ['180deg', '360deg'],
  });
  // 절반을 지나는 순간 앞뒤를 바꿔 단다. 겹친 두 면이 동시에 보이지 않게 한다
  const frontOpacity = progress.interpolate({
    inputRange: [0, 0.49, 0.5, 1],
    outputRange: [1, 1, 0, 0],
  });
  const backOpacity = progress.interpolate({
    inputRange: [0, 0.5, 0.51, 1],
    outputRange: [0, 0, 1, 1],
  });

  const face: ViewStyle = {
    backgroundColor: colors.card,
    borderColor: colors.border,
  };

  return (
    <View style={[styles.wrap, style]}>
      <Animated.View
        style={[
          styles.face,
          face,
          { opacity: frontOpacity, transform: [{ perspective: 1000 }, { rotateY: frontRotate }] },
        ]}
        // 뒤집혀 안 보이는 면은 스크린리더와 터치에서 빼 둔다
        pointerEvents={flipped ? 'none' : 'auto'}
        accessibilityElementsHidden={flipped}
        importantForAccessibility={flipped ? 'no-hide-descendants' : 'auto'}
      >
        {front}
      </Animated.View>

      <Animated.View
        style={[
          styles.face,
          face,
          { opacity: backOpacity, transform: [{ perspective: 1000 }, { rotateY: backRotate }] },
        ]}
        pointerEvents={flipped ? 'auto' : 'none'}
        accessibilityElementsHidden={!flipped}
        importantForAccessibility={flipped ? 'auto' : 'no-hide-descendants'}
      >
        {back}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
  },
  face: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 1,
    borderRadius: RADIUS.lg,
    overflow: 'hidden',
  },
});
