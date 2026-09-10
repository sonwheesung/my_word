import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { FONT, SPACING } from '../constants/design';
import { useTheme } from '../contexts/ThemeContext';

/**
 * 뜻 여러 개를 번호 목록으로 그린다.
 *
 * 🔴 **한 앱에서 같은 데이터를 두 가지로 그리고 있어서 만들었다**(2026-09-10).
 *    단어 상세 시트는 `1. 해결하다 / 2. 결심하다` 로 줄을 나눠 보여 주는데,
 *    플래시카드 뒷면은 `해결하다, 결심하다, 분해하다` 로 쉼표로 붙여 놓았다.
 *    뜻이 다섯 개인 단어에서 한쪽은 읽히고 한쪽은 뭉쳤다.
 *    값이 아니라 **그리는 방법에 주인이 없어서** 갈라진 것이라 여기로 모았다.
 *
 * ⚠ 번호는 뜻이 하나일 때도 붙는다. 기존 상세 시트가 그렇게 하고 있어 그대로 둔다
 *   (이 컴포넌트를 만들면서 기존 화면의 출력을 바꾸지 않는 것이 우선이다).
 */

interface MeaningListProps {
  meanings: string[];
  /** `detail` 단어 상세 시트(15) · `card` 플래시카드 뒷면(크게) */
  variant?: 'detail' | 'card';
  style?: StyleProp<ViewStyle>;
}

export default function MeaningList({ meanings, variant = 'detail', style }: MeaningListProps) {
  const { colors } = useTheme();
  if (meanings.length === 0) return null;

  return (
    <View style={style}>
      {meanings.map((meaning, index) => (
        <Text
          key={index}
          style={[variant === 'card' ? styles.card : styles.detail, { color: colors.text }]}
        >
          {index + 1}. {meaning}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  detail: {
    fontSize: FONT.body,
    marginBottom: 6,
    lineHeight: 22,
  },
  card: {
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.3,
    marginBottom: SPACING.xs,
    lineHeight: 28,
  },
});
