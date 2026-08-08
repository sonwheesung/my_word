import { useTranslation } from 'react-i18next';
import React, { useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, BackHandler } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';
import type { BlockingDecision } from '../services/versionService';

interface BlockingGateProps {
  decision: BlockingDecision;
}

const FALLBACK_BODY_KEY = '더 나은 서비스를 위해 점검 중입니다.\n잠시 후 다시 이용해주세요.';

/**
 * 앱 진입을 막는 전체 화면 — 현재는 서버 점검 하나뿐이다.
 *
 * 버전으로는 앱을 막지 않는다(`evaluateGate` 참조). 점검만 남긴 이유는 이것이 일시적이고,
 * 서버에서 즉시 되돌릴 수 있으며, 앱을 새로 배포해야 풀리는 종류의 차단이 아니기 때문이다.
 *
 * 닫는 방법이 없어야 게이트다. 화면 안에 닫기 버튼을 두지 않고, 안드로이드 하드웨어 백까지
 * 삼킨다(true 반환 = 이벤트 소비). 이 컴포넌트는 다른 화면 대신 렌더되므로 뒤에 아무것도 없다.
 */
export default function BlockingGate({ decision }: BlockingGateProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();

  // 하드웨어 백으로 빠져나가지 못하게 막는다. 이 화면이 떠 있는 동안만.
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => subscription.remove();
  }, []);

  const body = decision.body.trim() || t(FALLBACK_BODY_KEY);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style={colors.isDark ? 'light' : 'dark'} />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.iconCircle, { backgroundColor: colors.primaryLight }]}>
          <MaterialIcons name="build-circle" size={44} color={colors.primary} />
        </View>

        <Text style={[styles.title, { color: colors.text }]}>{decision.title}</Text>
        <Text style={[styles.body, { color: colors.textSecondary }]}>{body}</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  iconCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 12,
  },
  body: {
    fontSize: 15,
    lineHeight: 23,
    textAlign: 'center',
  },
});
