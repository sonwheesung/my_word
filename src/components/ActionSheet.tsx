import React, { useCallback, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

import { FONT, RADIUS, SPACING } from '../constants/design';
import { useTheme } from '../contexts/ThemeContext';
import BottomSheet, { SHEET_BLEED } from './BottomSheet';

/**
 * 고를 것이 여럿인 질문을 **줄 목록 시트**로 묻는다 (2026-10-12 시안 #17).
 *
 * 🔴 **`Alert.alert` 로 묻지 않는다.** 안드로이드 `AlertDialog` 는 버튼을 3개까지만 받고
 *    RN 은 넘는 것을 **조용히 버린다** — 2026-10-12 에 단어장 ⋯ 메뉴가 그 때문에
 *    `취소`를 잃고 **빠져나갈 수 없는 상태**가 됐다(`__tests__/alertButtons.test.ts` 가 막는다).
 *
 * ⚠ **새 `Modal` 을 만들지 않는다.** 공용 `BottomSheet` 를 감싼다 — 어둠막 · 끌어 내려 닫기 ·
 *   하단 여백 같은 규칙이 한 곳에 있어야 한다(시안 #15).
 *
 * ⚠ **[취소] 버튼을 두지 않는다.** 바깥 어둠 · 손잡이 · 뒤로 버튼으로 닫힌다.
 *   버튼까지 두면 줄이 많을 때 작은 화면에서 아래가 잘린다.
 *
 * 🔴 **위험 항목(빨간 줄 · 시트 안 재확인)은 일부러 만들지 않았다.** 시안이 자리와 모양을
 *    보여 주지만 지금 이 앱의 메뉴에는 지울 것이 없다. 쓰지 않는 길을 미리 깔면
 *    아무도 안 밟는 코드가 남고, 그건 이 저장소가 계속 걷어내 온 것이다. 필요해지면 그때 넣는다.
 */

export interface ActionItem {
  key: string;
  icon: keyof typeof MaterialIcons.glyphMap;
  label: string;
  /** 누르기 전에 무엇이 일어날지 알려 주는 한 줄 */
  desc?: string;
  onPress: () => void;
}

interface ActionSheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  /** 제목 아래 작은 줄. 「어느 카테고리에서 여는가」처럼 맥락을 준다 */
  subtitle?: string;
  items: readonly ActionItem[];
}

/** 누름 강조가 깔리는 시간 */
const PRESS_IN_MS = 80;
/** 강조를 보여 주는 시간. 🔴 바로 닫으면 무엇을 눌렀는지 못 본다 */
const PRESS_HOLD_MS = 160;
/** 시트가 다 내려간 뒤에 동작을 실행한다. ⚠ 겹치면 토스트와 시트가 둘 다 안 읽힌다 */
const RUN_AFTER_CLOSE_MS = 220;
const ROW_HEIGHT = 56;

function ActionRow({ item, onClose }: { item: ActionItem; onClose: () => void }) {
  const { colors } = useTheme();
  /** 강조 배경 투명도 하나만 움직인다 — `setValue` 는 애니메이션이 끝난 뒤에만 부른다 */
  const hl = useRef(new Animated.Value(0)).current;
  const busy = useRef(false);
  const timers = useRef<Array<ReturnType<typeof setTimeout>>>([]);

  // 🔴 화면을 떠난 뒤 타이머가 남으면 닫힌 시트의 동작이 뒤늦게 실행된다
  React.useEffect(
    () => () => {
      timers.current.forEach(clearTimeout);
      timers.current = [];
    },
    [],
  );

  const press = useCallback(() => {
    if (busy.current) return; // 연속 탭 방지
    busy.current = true;
    Animated.timing(hl, { toValue: 1, duration: PRESS_IN_MS, useNativeDriver: true }).start();
    timers.current.push(
      setTimeout(() => {
        onClose();
        hl.setValue(0);
        timers.current.push(
          setTimeout(() => {
            busy.current = false;
            item.onPress();
          }, RUN_AFTER_CLOSE_MS),
        );
      }, PRESS_IN_MS + PRESS_HOLD_MS),
    );
  }, [hl, item, onClose]);

  return (
    <Pressable onPress={press} style={styles.row} accessibilityRole="button">
      {/* ⚠ 강조는 시트 가로 여백 **밖까지** 번진다. 글자는 여백 자리에 그대로 선다 */}
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          {
            marginHorizontal: SHEET_BLEED,
            borderRadius: RADIUS.md,
            backgroundColor: colors.primaryLight,
            opacity: hl,
          },
        ]}
      />
      <MaterialIcons name={item.icon} size={22} color={colors.textSecondary} />
      <View style={styles.texts}>
        <Text style={[styles.label, { color: colors.text }]} numberOfLines={1}>
          {item.label}
        </Text>
        {item.desc ? (
          <Text style={[styles.desc, { color: colors.textTertiary }]} numberOfLines={1}>
            {item.desc}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

export default function ActionSheet({ visible, onClose, title, subtitle, items }: ActionSheetProps) {
  const { colors } = useTheme();
  return (
    <BottomSheet visible={visible} onClose={onClose} title={title}>
      {subtitle ? (
        <Text style={[styles.subtitle, { color: colors.textSecondary }]} numberOfLines={1}>
          {subtitle}
        </Text>
      ) : null}
      {items.map((item) => (
        <ActionRow key={item.key} item={item} onClose={onClose} />
      ))}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  subtitle: { fontSize: FONT.label, marginBottom: SPACING.xs },
  row: {
    height: ROW_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  texts: { flex: 1 },
  label: { fontSize: FONT.body - 1, fontWeight: '500' },
  desc: { fontSize: FONT.micro + 1, fontWeight: '500', marginTop: 2 },
});
