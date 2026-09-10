import React, { useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { MaterialIcons } from '@expo/vector-icons';

import BottomSheet from './BottomSheet';
import { useTheme } from '../contexts/ThemeContext';
import { FONT, RADIUS, SPACING } from '../constants/design';
import { useNotification } from '../contexts/NotificationContext';
import { formatTime } from '../utils/notificationSchedule';

/**
 * 알림을 켜 보라는 **한 번뿐인** 권유.
 *
 * 첫 퀴즈를 끝내고 홈으로 돌아왔을 때 뜬다 — 방금 가치를 느낀 자리라 수락률이 가장 높고,
 * 첫 실행에 맥락 없이 묻는 것보다 거절이 적다. 안드로이드는 한 번 거절당하면 앱이 다시
 * 묻지 못하게 막으므로, **어디서 묻느냐가 되돌릴 수 없는 선택**이다.
 *
 * 🔴 퀴즈 결과 화면에 두지 않았다. 그 화면은 진입 500ms 뒤에 전면 광고를 띄운다 —
 *    같은 순간에 시트를 올리면 둘이 겹쳐 싸우고, 사용자는 광고를 닫다가 권유를 놓친다.
 *
 * 수락하든 거절하든 markPrompted 로 기록해 **두 번 묻지 않는다.**
 */

interface NotificationPromptSheetProps {
  visible: boolean;
}

export default function NotificationPromptSheet({ visible }: NotificationPromptSheetProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const notify = useNotification();
  const busyRef = useRef(false);

  // 권한 대화상자가 뜨는 동안 버튼을 또 누르면 대화상자가 겹친다
  const guard = async (action: () => Promise<void>) => {
    if (busyRef.current) return;
    busyRef.current = true;
    try {
      await action();
    } catch {
      // 권유를 실패로 남기지 않는다. 기록만 하고 조용히 닫는다 — 다음에 또 물으면 성가시다.
    } finally {
      notify.markPrompted();
      busyRef.current = false;
    }
  };

  const handleAccept = () => guard(async () => {
    // 거절당해도 여기서는 안내하지 않는다. 방금 OS 대화상자에서 "허용 안 함"을 누른 사람에게
    // 곧바로 "설정에서 켜세요"를 띄우는 것은 조르는 것이다. 설정 화면에 토글이 있다.
    await notify.setEnabled(true);
  });

  const handleDecline = () => guard(async () => {});

  return (
    <BottomSheet visible={visible} onClose={handleDecline} title={t('복습 알림을 받아 볼까요?')}>
      <View style={styles.body}>
        <View style={[styles.iconCircle, { backgroundColor: colors.primaryLight }]}>
          <MaterialIcons name="notifications-active" size={28} color={colors.primaryStrong} />
        </View>

        <Text style={[styles.description, { color: colors.textSecondary }]}>
          {t(
            '하루 동안 앱을 열지 않으면 {{time}} 에 알려 드려요. 아직 안 풀어 본 단어나 자주 틀린 단어를 골라서요.',
            { time: formatTime(notify.time) },
          )}
        </Text>
        <Text style={[styles.note, { color: colors.textTertiary }]}>
          {t('언제든 설정에서 끄거나 시각을 바꿀 수 있어요')}
        </Text>

        <TouchableOpacity
          onPress={handleAccept}
          activeOpacity={0.8}
          accessibilityRole="button"
          style={[styles.primaryButton, { backgroundColor: colors.primary }]}
        >
          <Text style={[styles.primaryText, { color: colors.textOnPrimary }]}>{t('알림 받기')}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={handleDecline}
          activeOpacity={0.7}
          accessibilityRole="button"
          style={styles.secondaryButton}
        >
          <Text style={[styles.secondaryText, { color: colors.textTertiary }]}>{t('괜찮아요')}</Text>
        </TouchableOpacity>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  body: {
    alignItems: 'center',
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.lg,
  },
  description: {
    fontSize: FONT.body,
    lineHeight: 22,
    textAlign: 'center',
  },
  note: {
    fontSize: FONT.label,
    textAlign: 'center',
    marginTop: SPACING.sm,
  },
  primaryButton: {
    alignSelf: 'stretch',
    marginTop: SPACING.xl,
    paddingVertical: SPACING.lg,
    borderRadius: RADIUS.md,
    alignItems: 'center',
  },
  primaryText: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  secondaryButton: {
    alignSelf: 'stretch',
    paddingVertical: SPACING.md,
    alignItems: 'center',
  },
  secondaryText: {
    fontSize: 14,
  },
});
