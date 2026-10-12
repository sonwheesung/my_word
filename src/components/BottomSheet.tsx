import React, { useEffect, useRef, useState } from 'react';
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
  Animated,
  Easing,
  PanResponder,
  useWindowDimensions,
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
 *
 * ## 2026-10-12 시안 #15 — 어둠막은 제자리 페이드, 시트만 올라온다 · 끌어 내려 닫는다
 *
 * 🔴 **전에는 `animationType="slide"` 라 어둠막까지 시트와 한 덩어리로 밀려 올라왔다.**
 *    화면 아래쪽부터 회색으로 덮여 가는 모양이어서 *"화면 전체가 바뀐다"* 처럼 보였다.
 *    어둠막은 **뒤 화면이 잠깐 물러났다는 표시**이지 움직이는 물건이 아니다 — 제자리에서 짙어진다.
 *
 * 🔴 **손잡이가 있는데 끌리지 않았다.** 보이는데 안 되는 것은 없는 것보다 나쁘다.
 *
 * ⚠ **`Modal` 은 닫힘 애니메이션이 끝난 뒤에 내린다**(`mounted`). 바로 내리면 툭 사라진다.
 * ⚠ 시트 높이는 **열 때마다 다시 잰다**(`onLayout`) — 시트마다 높이가 달라 1/3 기준도 다르다.
 * ⚠ 끌기 영역은 **손잡이 + 제목 줄만**이다. 시트 전체에 걸면 안쪽 목록 스크롤과 다툰다.
 * ⚠ `avoidKeyboard` 시트는 끌기를 끈다 — 입력 중에 끌려 내려가면 입력이 날아간다.
 */

/** 어둠막 최대 농도 */
const DIM = 0.45;
/** 닫힘 판정: 이만큼 내려오면 닫는다(시트 높이 대비) */
const CLOSE_RATIO = 1 / 3;
/** 닫힘 판정: 이보다 빠르게 튕기면 거리와 무관하게 닫는다 (px/ms) */
const CLOSE_VELOCITY = 0.8;
/** 위로 끌 때의 저항. 1 이면 손가락을 그대로 따라가 시트가 화면에서 떨어져 나가 보인다 */
const UP_RESISTANCE = 0.2;
const OPEN_SPRING = { damping: 30, stiffness: 320, mass: 1 } as const;
const CLOSE_MS = 200;

/*
 * 🔴 **드라이버를 JS 로 둔다 — 시안의 제안과 다르다. 일부러다.**
 *
 * 시안은 *"두 Value 모두 네이티브 드라이버 전용 · setValue 로 끌고 spring 으로 놓는다 —
 * 섞어도 같은 드라이버라 안전"* 이라고 적었다. 이 저장소에는 **정확히 그 조합으로 당한 기록**이 있다
 * (`CLAUDE.md` 플래시카드 절, 1.7.0): 네이티브 드라이버로 돌린 변환을 `setValue` 로 되돌렸더니
 * **JS 쪽 숫자만 바뀌고 화면의 카드는 밖에 그대로 서 있었다.** 크래시도 경고도 없고
 * 타입 체크와 테스트 284개를 전부 통과한 채였다. 그래서 그 화면의 가로 이동은 전부 JS 드라이버다.
 *
 * `PanResponder` 는 `Animated.event` 를 네이티브로 못 받으므로 **끌기는 `setValue` 일 수밖에 없다.**
 * 그러면 시안이 말한 그 조합이 된다. 측정으로 뒤집히기 전까지는 **당해 본 쪽을 믿는다.**
 * 대가는 프레임마다 브리지를 건너는 것이고, 같은 선택을 한 플래시카드에서 문제가 없었다.
 */
const NATIVE = false;

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
  const { height: screenH } = useWindowDimensions();
  // Modal 은 루트 <SafeAreaView edges={['bottom']}> 바깥의 별도 네이티브 뷰에 그려진다.
  // 즉 루트가 주는 하단 여백이 시트에는 닿지 않는다. edgeToEdgeEnabled=true 라
  // 시트가 내비게이션 바 아래까지 내려가므로 여기서 직접 비켜 준다.
  // (이 값을 빼먹으면 3버튼 내비바 기기에서 시트 맨 아래 버튼이 절반 잘린다)
  const insets = useSafeAreaInsets();

  /** 닫힘 애니메이션이 끝날 때까지 Modal 을 붙잡아 둔다 */
  const [mounted, setMounted] = useState(visible);
  /** 시트가 제자리에서 내려간 거리(0 = 완전히 올라옴) */
  const ty = useRef(new Animated.Value(screenH)).current;
  /** 어둠막 0 → 1 */
  const fade = useRef(new Animated.Value(0)).current;
  /** 실측 시트 높이. 🔴 시트마다 다르므로 열 때마다 다시 잰다 */
  const sheetH = useRef(screenH * maxHeightRatio);
  /** 끌기 중에는 닫힘 effect 가 끼어들지 않게 한다 */
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (visible) {
      setMounted(true);
      ty.setValue(sheetH.current);
      Animated.parallel([
        Animated.spring(ty, { toValue: 0, ...OPEN_SPRING, useNativeDriver: NATIVE }),
        Animated.timing(fade, {
          toValue: 1,
          duration: CLOSE_MS,
          easing: Easing.out(Easing.quad),
          useNativeDriver: NATIVE,
        }),
      ]).start();
      return;
    }
    // ⚠ 닫힘은 **열린 적이 있을 때만** 돌린다. 첫 렌더에서 돌면 Modal 이 잠깐 떴다 사라진다
    let alive = true;
    const out = { duration: CLOSE_MS, easing: Easing.in(Easing.cubic), useNativeDriver: NATIVE };
    Animated.parallel([
      Animated.timing(ty, { toValue: sheetH.current + 24, ...out }),
      Animated.timing(fade, { toValue: 0, ...out }),
    ]).start(() => {
      if (alive) setMounted(false);
    });
    return () => {
      alive = false;
    };
  }, [visible, ty, fade]);

  /**
   * 손잡이 · 제목 줄을 끌어 내린다.
   * 🔴 `useRef` 로 한 번만 만든다 — 매 렌더 새로 만들면 끌던 중에 응답자가 바뀐다.
   */
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 4,
      // 아래로는 1:1, 위로는 저항을 둔다
      onPanResponderMove: (_, g) => ty.setValue(g.dy >= 0 ? g.dy : g.dy * UP_RESISTANCE),
      onPanResponderRelease: (_, g) => {
        if (g.dy > sheetH.current * CLOSE_RATIO || g.vy > CLOSE_VELOCITY) {
          // 닫기는 부모가 visible=false 로 한다 — 위 effect 가 마저 내린다
          onCloseRef.current();
        } else {
          Animated.spring(ty, { toValue: 0, ...OPEN_SPRING, useNativeDriver: NATIVE }).start();
        }
      },
      onPanResponderTerminate: () => {
        Animated.spring(ty, { toValue: 0, ...OPEN_SPRING, useNativeDriver: NATIVE }).start();
      },
    }),
  ).current;

  // 끄는 만큼 어둠막도 옅어진다. 같은 Value 에서 파생되므로 드라이버가 섞이지 않는다
  const dimOpacity = Animated.multiply(
    fade,
    ty.interpolate({
      inputRange: [0, Math.max(1, sheetH.current)],
      outputRange: [DIM, 0],
      extrapolate: 'clamp',
    }),
  );

  // 🔴 가로 여백은 **여기 한 곳에서만** 준다. 자세한 이유는 파일 맨 아래 SHEET_GUTTER 참조.
  //    스크롤바가 화면 끝에 붙어야 하므로 ScrollView 자체가 아니라 콘텐츠에 준다.
  const body = scrollable ? (
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
      {children}
    </ScrollView>
  ) : (
    <View style={styles.content}>{children}</View>
  );

  const sheet = (
    <View style={styles.overlay}>
      {/*
        어둠막 — **제자리에서 짙어진다**(시안 #15). 바깥을 눌러 닫는 영역이기도 하다.
        시트를 감싸지 않고 **형제**로 둔다. 감싸면 시트 안의 버튼이 이 버튼 안에 중첩돼
        웹에서 `<button> cannot contain a nested <button>` DOM 오류가 나고,
        스크린 리더는 시트 전체를 "닫기" 버튼 하나로 읽어 내용을 못 읽는다.
      */}
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: '#000', opacity: dimOpacity }]}>
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          activeOpacity={1}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={t('닫기')}
        />
      </Animated.View>
      <Animated.View
        onLayout={(e) => {
          sheetH.current = e.nativeEvent.layout.height;
        }}
        style={[
          styles.sheet,
          {
            backgroundColor: colors.card,
            maxHeight: `${Math.round(maxHeightRatio * 100)}%`,
            paddingBottom: SPACING.xxl + insets.bottom,
            transform: [{ translateY: ty }],
          },
        ]}
      >
        {/* 끌기 영역 — 손잡이 + 제목 줄만. ⚠ 시트 전체에 걸면 안쪽 목록 스크롤과 다툰다 */}
        <View
          {...(avoidKeyboard ? {} : pan.panHandlers)}
          accessibilityHint={avoidKeyboard ? undefined : t('끌어 내려 닫기')}
          style={styles.dragArea}
        >
          <View style={[styles.grabber, { backgroundColor: colors.border }]} />
          {title ? <Text style={[styles.title, { color: colors.text }]}>{title}</Text> : null}
        </View>
        {body}
      </Animated.View>
    </View>
  );

  return (
    <Modal visible={mounted} transparent animationType="none" onRequestClose={onClose}>
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

/**
 * 시트 안쪽 가로 여백. 🔴 **이 값은 시트가 갖는다. 쓰는 쪽이 다시 주지 않는다.**
 *
 * 2026-09-10 이전에는 시트가 제목에만 여백을 주고 본문(children)에는 안 줬다.
 * 그래서 시트를 쓰는 화면 9곳이 각자 같은 값을 다시 선언하고 있었고,
 * **플래시카드 설정에서 그걸 빠뜨려 카테고리 목록이 화면 왼쪽 끝에 붙었다**(사용자 발견).
 * 값이 제각각이어서 생긴 사고가 아니다. 값은 전부 20 으로 같았다.
 * 주인이 없어서 **빠뜨릴 수 있었던 것**이 원인이다. 그래서 주인을 여기로 옮겼다.
 *
 * ⚠ 목록 항목처럼 **선택 강조 배경이 여백 밖까지 나가야 하는 것**은
 *   `marginHorizontal: -SPACING.md` 로 명시적으로 빼낸다(`SHEET_BLEED`).
 *   빼내는 것은 눈에 보이는 선언이라 잊을 수 없고, 안 주는 것은 조용하다.
 */
export const SHEET_GUTTER = SPACING.xl;

/** 강조 배경을 여백 밖으로 빼낼 때 쓴다. 글자는 여전히 SHEET_GUTTER 자리에 선다 */
export const SHEET_BLEED = -SPACING.md;

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  overlay: {
    flex: 1,
    // 🔴 배경색을 여기 주지 않는다 — 어둠막은 위 Animated.View 가 맡는다(시안 #15)
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: RADIUS.sheet,
    borderTopRightRadius: RADIUS.sheet,
    paddingTop: SPACING.sm,
    // paddingBottom 은 insets.bottom 을 더해 인라인으로 준다
  },
  /** ⚠ 제목이 없는 시트에서도 손가락이 닿을 만큼은 돼야 한다 */
  dragArea: {
    paddingTop: SPACING.xs,
    paddingBottom: SPACING.xs,
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
    // 제목은 body 바깥(형제)이라 같은 값을 직접 쓴다. 상수는 하나다
    paddingHorizontal: SHEET_GUTTER,
    marginBottom: SPACING.sm,
  },
  content: {
    paddingHorizontal: SHEET_GUTTER,
  },
});
