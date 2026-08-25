import { useTranslation } from 'react-i18next';
import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Linking,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../contexts/ThemeContext';
import { FONT, RADIUS, SPACING } from '../constants/design';

interface UpdateModalProps {
  visible: boolean;
  currentVersion: string;
  latestVersion: string;
  /** 스토어 링크. 공통 서버가 준 값을 우선하고 없으면 앱 상수로 폴백한 결과가 들어온다. */
  storeUrl: string;
  onSkip: () => void;
  onClose: () => void;
}

export default function UpdateModal({
  visible,
  currentVersion,
  latestVersion,
  storeUrl,
  onSkip,
  onClose,
}: UpdateModalProps) {
  // Modal 은 루트 SafeAreaView 바깥이라 시스템 바를 직접 비켜 줘야 한다.
  // 세로 중앙 정렬이라 지금은 잘리지 않지만, 버튼이 3개라 화면이 짧으면 아래가 물린다.
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  // 이 컴포넌트만 테마를 안 쓰고 색을 박아 두었었다. 다크 테마 사용자가 업데이트 안내를
  // 받으면 흰 팝업이 그대로 떴다. 버전 게이트라 자주는 아니어도 반드시 보게 되는 화면이다.
  const { colors } = useTheme();

  const handleUpdate = () => {
    if (storeUrl) {
      Linking.openURL(storeUrl).catch(() => {
        // 링크 열기 실패 시 무시
      });
    }
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View
        style={[
          styles.overlay,
          { paddingTop: insets.top + SPACING.xxl, paddingBottom: insets.bottom + SPACING.xxl },
        ]}
      >
        <View style={[styles.container, { backgroundColor: colors.card }]}>
          {/* 아이콘 */}
          <Text style={styles.icon}>🔄</Text>

          {/* 제목 */}
          <Text style={[styles.title, { color: colors.text }]}>{t('새 버전이 있습니다')}</Text>

          {/* 버전 정보 */}
          <View style={[styles.versionInfo, { backgroundColor: colors.surface }]}>
            <View style={styles.versionRow}>
              <Text style={[styles.versionLabel, { color: colors.textSecondary }]}>{t('현재 버전')}</Text>
              <Text style={[styles.versionValue, { color: colors.textSecondary }]}>{currentVersion}</Text>
            </View>
            <View style={styles.versionArrow}>
              <Text style={[styles.versionArrowText, { color: colors.textTertiary }]}>→</Text>
            </View>
            <View style={styles.versionRow}>
              <Text style={[styles.versionLabel, { color: colors.textSecondary }]}>{t('최신 버전')}</Text>
              <Text style={[styles.versionValue, { color: colors.primary }]}>{latestVersion}</Text>
            </View>
          </View>

          {/* 안내 문구 */}
          <Text style={[styles.description, { color: colors.textSecondary }]}>
            {t('최신 버전으로 업데이트하면\n새로운 기능을 사용할 수 있습니다.')}
          </Text>

          {/* 버튼 — 주 / 보조 / 3차 3단 위계 */}
          <View style={styles.buttons}>
            {Platform.OS !== 'web' && storeUrl ? (
              <TouchableOpacity
                style={[styles.updateButton, { backgroundColor: colors.primaryStrong }]}
                onPress={handleUpdate}
                accessibilityRole="button"
              >
                <Text style={styles.updateButtonText}>{t('업데이트')}</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity
              style={[styles.skipButton, { backgroundColor: colors.surface, borderColor: colors.border }]}
              onPress={onSkip}
              accessibilityRole="button"
            >
              <Text style={[styles.skipButtonText, { color: colors.textSecondary }]}>{t('이 버전 건너뛰기')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.closeButton} onPress={onClose} accessibilityRole="button">
              <Text style={[styles.closeButtonText, { color: colors.textTertiary }]}>{t('나중에')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SPACING.xxl,
    // 세로 패딩은 insets 를 더해 인라인으로 준다
  },
  container: {
    borderRadius: RADIUS.xl,
    padding: SPACING.xxl + SPACING.xs,
    width: '100%',
    maxWidth: 360,
    alignItems: 'center',
  },
  icon: {
    fontSize: 48,
    marginBottom: SPACING.lg,
  },
  title: {
    fontSize: FONT.title + 2,
    fontWeight: 'bold',
    marginBottom: SPACING.lg,
  },
  versionInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: RADIUS.lg,
    padding: SPACING.lg - 2,
    marginBottom: SPACING.lg,
    gap: SPACING.md,
  },
  versionRow: {
    alignItems: 'center',
  },
  versionLabel: {
    fontSize: FONT.caption,
    marginBottom: SPACING.xs,
  },
  versionValue: {
    fontSize: FONT.body + 1,
    fontWeight: '600',
  },
  versionArrow: {
    paddingHorizontal: SPACING.xs,
  },
  versionArrowText: {
    fontSize: FONT.title,
  },
  description: {
    fontSize: FONT.label + 1,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: SPACING.xxl,
  },
  buttons: {
    width: '100%',
    gap: SPACING.sm + 2,
  },
  updateButton: {
    borderRadius: RADIUS.md,
    padding: SPACING.lg - 2,
    alignItems: 'center',
  },
  updateButtonText: {
    color: '#FFFFFF',
    fontSize: FONT.body + 1,
    fontWeight: '600',
  },
  skipButton: {
    borderWidth: 1,
    borderRadius: RADIUS.md,
    padding: SPACING.lg - 2,
    alignItems: 'center',
  },
  skipButtonText: {
    fontSize: FONT.label + 1,
    fontWeight: '500',
  },
  closeButton: {
    padding: SPACING.sm + 2,
    alignItems: 'center',
  },
  closeButtonText: {
    fontSize: FONT.label + 1,
  },
});
