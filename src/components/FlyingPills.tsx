import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';

import { FONT, RADIUS, SPACING } from '../constants/design';
import { useTheme } from '../contexts/ThemeContext';

/**
 * 담은 단어가 **알약이 되어 과녁으로 날아가는** 연출 (2026-10-08 시안 #13).
 *
 * 🔴 **`useNativeDriver: true` 다. 그리고 그래도 되는 이유가 있다.**
 *    이 컴포넌트가 움직이는 값은 `transform` 과 `opacity` 뿐이고, **`setValue` 로 되돌리지
 *    않는다**(한 번 날아가고 사라진다). 1.7.0 에서 카드가 화면 밖에 그대로 서 있던 사고는
 *    *네이티브로 넘긴 변환을 `setValue` 로 되돌린 것*이 원인이었다 — 그 조건이 여기엔 없다.
 *    `CLAUDE.md` 가 *"뒤집기는 `setValue` 를 안 쓰는 순수 애니메이션이라 네이티브가 맞다"* 고
 *    적은 것과 같은 경우다.
 *
 * 🔴 **좌표는 `measureInWindow` 로 잰 화면 좌표 하나만 쓴다.** 출발점은 스크롤 안에 있고
 *    과녁은 헤더에 있어 **부모가 다르다** — 부모별 좌표를 섞으면 스크롤을 내린 만큼 어긋난다.
 *
 * ⚠ 곡선은 y 를 세 점으로 보간해 만든다(위로 솟았다 내려앉는다). x 는 직선이다 —
 *   둘 다 휘면 어디로 가는지 눈이 못 따라간다.
 */

export interface Flight {
  /** 화면에 그릴 글자 */
  word: string;
  /** 출발 좌표(화면 기준). 칩이 있던 자리 */
  from: { x: number; y: number };
}

interface FlyingPillsProps {
  flights: Flight[];
  /** 과녁 좌표(화면 기준). 헤더의 단어장 아이콘 가운데 */
  to: { x: number; y: number };
  /** 다 날아간 뒤 */
  onDone: () => void;
}

/** 한 알이 나는 시간 */
const FLY_MS = 520;
/** 알마다 출발을 늦추는 간격. 한꺼번에 날면 덩어리로 보인다 */
const STAGGER_MS = 70;
/** 솟는 높이. 음수가 위쪽이다 */
const ARC_LIFT = -70;

export default function FlyingPills({ flights, to, onDone }: FlyingPillsProps) {
  const { colors } = useTheme();
  // 알이 바뀌어도 같은 값 객체를 쓰도록 길이에 맞춰 한 번만 만든다
  const progress = useRef(flights.map(() => new Animated.Value(0))).current;

  useEffect(() => {
    if (flights.length === 0) {
      onDone();
      return;
    }
    const anim = Animated.stagger(
      STAGGER_MS,
      progress.map((p) =>
        Animated.timing(p, {
          toValue: 1,
          duration: FLY_MS,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ),
    );
    anim.start(({ finished }) => {
      if (finished) onDone();
    });
    // 🔴 cleanup — 화면을 떠난 뒤 콜백이 돌면 사라진 화면에 setState 한다
    return () => anim.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    /*
     * ⚠ `pointerEvents="none"` 이 없으면 **날아가는 알이 탭을 가로챈다.**
     *   연출이 끝나기 전에 다음을 누르려는 사람을 반 초 동안 막는다.
     */
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {flights.map((flight, i) => {
        const p = progress[i];
        if (p === undefined) return null;
        const dx = to.x - flight.from.x;
        const dy = to.y - flight.from.y;
        return (
          <Animated.View
            key={flight.word}
            style={[
              styles.pill,
              {
                backgroundColor: colors.primary,
                left: flight.from.x,
                top: flight.from.y,
                opacity: p.interpolate({ inputRange: [0, 0.75, 1], outputRange: [1, 1, 0] }),
                transform: [
                  { translateX: p.interpolate({ inputRange: [0, 1], outputRange: [0, dx] }) },
                  {
                    // 세 점 보간 — 위로 솟았다가 과녁으로 내려앉는다
                    translateY: p.interpolate({
                      inputRange: [0, 0.5, 1],
                      outputRange: [0, dy / 2 + ARC_LIFT, dy],
                    }),
                  },
                  { scale: p.interpolate({ inputRange: [0, 0.8, 1], outputRange: [1, 0.9, 0.4] }) },
                ],
              },
            ]}
          >
            <Text style={styles.pillText} numberOfLines={1}>
              {flight.word}
            </Text>
          </Animated.View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    position: 'absolute',
    paddingHorizontal: SPACING.md,
    paddingVertical: 6,
    borderRadius: RADIUS.pill,
    maxWidth: 160,
  },
  pillText: { color: '#FFFFFF', fontSize: FONT.caption, fontWeight: '700' },
});
