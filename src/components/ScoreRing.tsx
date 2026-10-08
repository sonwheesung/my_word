import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

import { useTheme } from '../contexts/ThemeContext';

/**
 * 점수 링 (2026-10-08 시안 #6·#7). 0 에서 점수까지 **차오르며 숫자를 같이 센다.**
 *
 * 🔴 **`react-native-svg` 를 쓰지 않는다.** 네이티브 모듈이라 넣으면 **R8 재검증이 다시 필요**하고
 *    (`CLAUDE.md` R8 절: 깨지는 방식이 크래시가 아니라 조용한 기능 실종이다), 지금은 릴리스 빌드를
 *    돌릴 수 없다. 장식 하나 때문에 그 위험을 지지 않는다.
 *
 * 그래서 **반원 두 개를 돌려** 그린다:
 * ```
 * 오른쪽 절반만 보이는 칸  ← 왼쪽 반원이 0°→180° 로 쓸고 들어온다   (0~50%)
 * 왼쪽  절반만 보이는 칸  ← 오른쪽 반원이 0°→180° 로 쓸고 들어온다  (50~100%)
 * ```
 * ⚠ 반원은 `borderRadius` 를 한쪽에만 주고 반대쪽 `borderWidth` 를 0 으로 둔 네모다 —
 *   테두리가 둥근 모양을 따라가므로 **호(arc)** 가 된다.
 * ⚠ 회전축은 `transformOrigin` 으로 **칸의 가운데**에 맞춘다(RN 0.76+).
 *
 * 🔴 **`useNativeDriver: true` 다.** 움직이는 것은 `rotate` 뿐이고 **`setValue` 로 되돌리지 않는다**
 *    (한 판에 한 번 차오르고 끝난다). 1.7.0 사고의 조건(네이티브로 넘긴 값을 `setValue` 로 되돌림)이
 *    여기엔 없다. ⚠ 다만 **가운데 숫자는 JS 로 센다** — 글자는 네이티브 드라이버로 못 바꾼다.
 */

interface ScoreRingProps {
  /** 0~100 */
  percent: number;
  /** 링 바깥 지름 */
  size?: number;
  /** 선 두께 */
  stroke?: number;
  /**
   * 가운데에 쓸 글자. 안 주면 `N%` 를 **세면서** 보여준다.
   * ⚠ 주면 숫자 세기를 하지 않는다 — 홈의 「오늘 목표」는 `6/10` 처럼 분수라 세는 것이 말이 안 된다.
   */
  label?: string;
  /**
   * 만점 축하(초록 · 빛 · ✓ 도장)를 할 것인가. 기본 `true`.
   * ⚠ 홈의 작은 링은 `false` 다 — **매일 보는 자리**라 축하가 금세 성가셔진다.
   *   축하는 퀴즈를 막 끝낸 그 순간에만 값이 있다.
   */
  celebrate?: boolean;
  /** 글자 크기. 작은 링에 40 은 넘친다 */
  fontSize?: number;
}

const FILL_MS = 900;
/** 만점일 때만 한 번 번지는 빛 */
const GLOW_MS = 520;
/**
 * 반원 두 개가 만나는 자리(12시·6시)를 **겹치는 폭**.
 *
 * 🔴 **실기기에서 보고 넣었다.** 칸을 정확히 반씩 나누면 둘이 맞닿은 선에
 *    머리카락 같은 흰 틈이 보인다(100%·50% 에서 특히). 테두리 가장자리의 안티앨리어싱이라
 *    색을 바꿔서는 안 없어진다 — **1px 겹치는 것이 유일한 해법이다.**
 */
const SEAM = 1;

export default function ScoreRing({
  percent,
  size = 168,
  stroke = 14,
  label,
  celebrate = true,
  fontSize = 40,
}: ScoreRingProps) {
  const { colors } = useTheme();
  const safe = Number.isFinite(percent) ? Math.max(0, Math.min(100, percent)) : 0;
  const perfect = safe >= 100 && celebrate;

  const p = useRef(new Animated.Value(0)).current;
  const glow = useRef(new Animated.Value(0)).current;
  const stamp = useRef(new Animated.Value(0)).current;
  /** 가운데 숫자. 🔴 글자는 네이티브 드라이버가 못 바꾸므로 JS 로 센다 */
  const [shown, setShown] = useState(0);

  useEffect(() => {
    const target = safe / 100;
    const anim = Animated.timing(p, {
      toValue: target,
      duration: FILL_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    // 숫자는 같은 시간 동안 따로 센다. 값이 하나여도 쓰임이 둘(회전 · 글자)이라 드라이버가 갈린다
    if (label !== undefined) {
      // 글자를 직접 주면 셀 것이 없다
      anim.start();
      return () => anim.stop();
    }
    const started = Date.now();
    const tick = setInterval(() => {
      const t = Math.min(1, (Date.now() - started) / FILL_MS);
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(Math.round(safe * eased));
      if (t >= 1) clearInterval(tick);
    }, 33);
    anim.start(({ finished }) => {
      if (!finished || !perfect) return;
      Animated.parallel([
        Animated.sequence([
          Animated.timing(glow, { toValue: 1, duration: GLOW_MS, useNativeDriver: true }),
          Animated.timing(glow, { toValue: 0, duration: GLOW_MS, useNativeDriver: true }),
        ]),
        Animated.spring(stamp, { toValue: 1, useNativeDriver: true, speed: 14, bounciness: 10 }),
      ]).start();
    });
    // 🔴 cleanup — 화면을 떠난 뒤 타이머가 setState 하면 경고가 나고 누수가 된다
    return () => {
      anim.stop();
      clearInterval(tick);
    };
  }, [safe, perfect, label, p, glow, stamp]);

  // 만점이면 주색 → 초록. 차오르는 동안에는 주색이고, 100%에 닿는 순간 바뀐다
  const arcColor = safe >= 100 ? colors.success : colors.primary;

  const half = {
    width: size / 2,
    height: size,
    borderWidth: stroke,
    borderColor: arcColor,
    position: 'absolute' as const,
  };

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      {/* 만점일 때 바깥으로 한 번 번지는 빛 */}
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          {
            borderRadius: size / 2,
            backgroundColor: colors.success,
            opacity: glow.interpolate({ inputRange: [0, 1], outputRange: [0, 0.22] }),
            transform: [{ scale: glow.interpolate({ inputRange: [0, 1], outputRange: [1, 1.18] }) }],
          },
        ]}
      />

      {/* 트랙 */}
      <View
        style={{
          position: 'absolute',
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: stroke,
          borderColor: colors.borderLight,
        }}
      />

      {/* 0~50% — 오른쪽 칸을 왼쪽 반원이 쓸고 들어온다 */}
      <View
        style={{
          position: 'absolute',
          right: 0,
          width: size / 2 + SEAM,
          height: size,
          overflow: 'hidden',
        }}
      >
        <Animated.View
          style={[
            half,
            // ⚠ 칸을 왼쪽으로 1px 넓혔으므로 반원도 그만큼 되밀어 **가운데를 유지**한다
            {
              left: -size / 2 + SEAM,
              borderTopLeftRadius: size / 2,
              borderBottomLeftRadius: size / 2,
              borderRightWidth: 0,
              transformOrigin: 'right center',
              transform: [
                { rotate: p.interpolate({ inputRange: [0, 0.5, 1], outputRange: ['0deg', '180deg', '180deg'] }) },
              ],
            },
          ]}
        />
      </View>

      {/* 50~100% — 왼쪽 칸을 오른쪽 반원이 쓸고 들어온다 */}
      {/* ⚠ 이쪽은 왼쪽에 붙어 있어 넓혀도 반원 위치가 그대로다 */}
      <View
        style={{
          position: 'absolute',
          left: 0,
          width: size / 2 + SEAM,
          height: size,
          overflow: 'hidden',
        }}
      >
        <Animated.View
          style={[
            half,
            {
              left: size / 2,
              borderTopRightRadius: size / 2,
              borderBottomRightRadius: size / 2,
              borderLeftWidth: 0,
              /*
               * 🔴 **50% 전에는 숨긴다.** 겹치려고 칸을 1px 넓혔더니, 아직 안 돌아간 이 반원의
               *    가장자리 1px 이 6시 아래로 **삐져나와 보였다**(실기기). 겹침이 만든 부작용이라
               *    겹침을 되돌리는 대신 **안 쓰는 동안 숨기는** 쪽이 맞다.
               */
              opacity: p.interpolate({ inputRange: [0, 0.499, 0.5, 1], outputRange: [0, 0, 1, 1] }),
              transformOrigin: 'left center',
              transform: [
                { rotate: p.interpolate({ inputRange: [0, 0.5, 1], outputRange: ['0deg', '0deg', '180deg'] }) },
              ],
            },
          ]}
        />
      </View>

      <View style={styles.center}>
        <Text style={[styles.percent, { color: arcColor, fontSize }]}>
          {label ?? `${shown}%`}
        </Text>
      </View>

      {/*
        만점 도장 (시안 #7). 🔴 **기울어진 채 내려와 찍힌다.**
        ⚠ 컨페티·트로피·소리는 없다 — 이 앱의 톤이 아니고, 매번 하면 금세 성가시다.
      */}
      {perfect && (
        <Animated.View
          style={[
            styles.stamp,
            {
              backgroundColor: colors.success,
              opacity: stamp,
              transform: [
                { rotate: '-14deg' },
                { scale: stamp.interpolate({ inputRange: [0, 1], outputRange: [1.8, 1] }) },
              ],
            },
          ]}
        >
          <MaterialIcons name="check" size={22} color="#FFFFFF" />
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  percent: { fontSize: 40, fontWeight: '800' },
  stamp: {
    position: 'absolute',
    right: -4,
    bottom: 4,
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
