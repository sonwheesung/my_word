import { useTranslation } from 'react-i18next';
import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Linking,
  Platform,
  Animated,
  Easing,
  Pressable,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../contexts/ThemeContext';
import { FONT, RADIUS, SPACING } from '../constants/design';

/**
 * 업데이트 안내 (2026-10-12 시안 #18).
 *
 * 🔴 **이 앱에서 가운데 뜨는 창은 이것 하나다.** 고르는 창 · 확인 창은 전부 아래 시트다
 *    (`BottomSheet` 머리 주석: 항목이 늘면 위쪽에 엄지가 안 닿는다).
 *    가운데 창이 더 생기면 이 카드 · 이 등장을 그대로 쓴다.
 *
 * 🔴 **색은 `useTheme()` 에서만 가져온다.** 예전에 이 컴포넌트만 색을 박아 둬서
 *    다크 테마 사용자에게 **흰 팝업**이 떴다. 버전 게이트라 자주는 아니어도 반드시 보게 되는 화면이다.
 *
 * 🔴 **강제 업데이트(닫을 수 없는 창)는 만들지 않는다.** *"버전으로는 앱을 막지 않는다"* 가
 *    이 앱의 방침이다(`BlockingGate` · `evaluateGate`). 막는 화면은 서버 점검 하나뿐이다.
 *    닫는 길 셋이 전부 같다 — 「나중에」 · 바깥 누름 · 뒤로 가기.
 */

interface UpdateModalProps {
  visible: boolean;
  currentVersion: string;
  latestVersion: string;
  /** 스토어 링크. 공통 서버가 준 값을 우선하고 없으면 앱 상수로 폴백한 결과가 들어온다. */
  storeUrl: string;
  /**
   * 「바뀐 점」 세 줄. ⚠ **공통 서버는 아직 이 값을 주지 않는다** — 없으면 기존 한 줄로 돌아간다.
   * 서버가 주기 시작하면 그대로 뜬다(최대 3줄).
   */
  notes?: readonly string[];
  onSkip: () => void;
  onClose: () => void;
}

const IN_MS = 200;
const OUT_MS = 160;
const SPIN_MS = 520;
/** 옛 버전 → 화살표 → 새 버전 순서로 눈이 가게 한다 */
const ARROW_DELAY = 220;
const NEW_VER_DELAY = 360;
/** 건너뛴 버전을 알려 주는 알약이 떠 있는 시간 */
const SKIPPED_PILL_MS = 1400;
const MAX_NOTES = 3;

/**
 * 어둠막 농도를 **테마 id 가 아니라 배경 밝기**로 정한다.
 * 🔴 `themeId === 'dark'` 로 박으면 다크 계열 테마가 하나 더 생기는 순간 조용히 틀린다.
 *    다크는 바탕이 이미 어두워서 0.6 이어야 카드가 떠 보인다.
 */
function isDarkBackground(hex: string): boolean {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return false;
  const n = parseInt(m[1], 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  // 사람 눈이 느끼는 밝기(ITU-R BT.601)
  return (r * 299 + g * 587 + b * 114) / 1000 < 128;
}

export default function UpdateModal({
  visible,
  currentVersion,
  latestVersion,
  storeUrl,
  notes,
  onSkip,
  onClose,
}: UpdateModalProps) {
  // Modal 은 루트 SafeAreaView 바깥이라 시스템 바를 직접 비켜 줘야 한다.
  // 세로 중앙 정렬이라 지금은 잘리지 않지만, 버튼이 3개라 화면이 짧으면 아래가 물린다.
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const { colors } = useTheme();

  /** 닫힘 애니메이션이 끝날 때까지 Modal 을 붙잡아 둔다 */
  const [mounted, setMounted] = useState(visible);
  /** 건너뛴 직후 1.4초 동안 뜨는 알약 */
  const [skipped, setSkipped] = useState<string | null>(null);

  const v = useRef(new Animated.Value(0)).current;
  const spin = useRef(new Animated.Value(0)).current;
  const arrow = useRef(new Animated.Value(0)).current;
  const newVer = useRef(new Animated.Value(0)).current;

  /*
   * 🔴 **`setValue` 를 쓰지 않는다.** 이 값들은 전부 네이티브 드라이버로 도는데,
   *    이 저장소에는 *"네이티브로 넘긴 값을 `setValue` 로 되돌렸더니 JS 쪽 숫자만 바뀌고
   *    화면은 그대로였다"* 는 사고 기록이 있다(`CLAUDE.md` 플래시카드 절 · 1.7.0).
   *    되돌리기도 **길이 0 인 timing** 으로 한다 — 같은 네이티브 경로를 지나므로 어긋나지 않는다.
   */
  const reset = React.useCallback(
    (done?: () => void) => {
      Animated.parallel(
        [spin, arrow, newVer].map((x) =>
          Animated.timing(x, { toValue: 0, duration: 0, useNativeDriver: true }),
        ),
      ).start(done);
    },
    [spin, arrow, newVer],
  );

  useEffect(() => {
    if (visible) {
      setMounted(true);
      reset(() => {
        Animated.parallel([
          Animated.timing(v, {
            toValue: 1,
            duration: IN_MS,
            easing: Easing.bezier(0.33, 1, 0.68, 1),
            useNativeDriver: true,
          }),
          // ⚠ 한 번만 돈다. 🚫 반복 회전은 금지 — 로딩으로 읽힌다
          Animated.timing(spin, {
            toValue: 1,
            duration: SPIN_MS,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.sequence([
            Animated.delay(ARROW_DELAY),
            Animated.timing(arrow, { toValue: 1, duration: IN_MS, useNativeDriver: true }),
          ]),
          Animated.sequence([
            Animated.delay(NEW_VER_DELAY),
            Animated.timing(newVer, { toValue: 1, duration: IN_MS, useNativeDriver: true }),
          ]),
        ]).start();
      });
      return;
    }
    let alive = true;
    Animated.timing(v, {
      toValue: 0,
      duration: OUT_MS,
      easing: Easing.in(Easing.quad),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished && alive) setMounted(false);
    });
    return () => {
      alive = false;
    };
  }, [visible, v, spin, arrow, newVer, reset]);

  // 🔴 알약 타이머 정리 — 창이 사라진 뒤 setState 가 돌면 누수가 된다
  const pillTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (pillTimer.current !== null) clearTimeout(pillTimer.current);
    },
    [],
  );

  const handleUpdate = () => {
    if (storeUrl) {
      Linking.openURL(storeUrl).catch(() => {
        // 링크 열기 실패 시 무시
      });
    }
    onClose();
  };

  /** 무엇을 건너뛰었는지 **남긴다.** 아무 표시 없이 닫히면 눌렀는지도 모른다 */
  const handleSkip = () => {
    setSkipped(latestVersion);
    if (pillTimer.current !== null) clearTimeout(pillTimer.current);
    pillTimer.current = setTimeout(() => {
      setSkipped(null);
      onSkip();
    }, SKIPPED_PILL_MS);
  };

  const shown = (notes ?? []).filter((n) => n.trim()).slice(0, MAX_NOTES);
  const dim = isDarkBackground(colors.background) ? 'rgba(0,0,0,0.6)' : 'rgba(17,24,39,0.5)';

  return (
    <Modal visible={mounted} transparent animationType="none" onRequestClose={onClose}>
      <Animated.View
        style={[
          styles.overlay,
          {
            backgroundColor: dim,
            opacity: v,
            paddingTop: insets.top + SPACING.xxl,
            paddingBottom: insets.bottom + SPACING.xxl,
          },
        ]}
      >
        {/*
          바깥 누르기 = 「나중에」. 🔴 카드를 **감싸지 않고 형제**로 둔다 —
          감싸면 웹에서 중첩 <button> 오류가 나고 스크린 리더가 카드 전체를 "닫기"로 읽는다
          (`BottomSheet` 와 같은 이유).
        */}
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={t('닫기')}
        />
        <Animated.View
          style={[
            styles.container,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              opacity: v,
              transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) }],
            },
          ]}
        >
          {/* 🔴 이모지가 아니라 선 아이콘이다 — 이모지는 기기마다 그림이 다르고 테마를 안 따른다 */}
          <Animated.View
            style={{
              transform: [
                {
                  rotate: spin.interpolate({
                    inputRange: [0, 1],
                    outputRange: ['-120deg', '0deg'],
                  }),
                },
              ],
            }}
          >
            <MaterialIcons name="system-update" size={28} color={colors.primaryStrong} />
          </Animated.View>

          <Text style={[styles.title, { color: colors.text }]}>{t('새 버전이 나왔어요')}</Text>

          {/* 버전 알약 한 줄 — 라벨 없이 화살표 방향으로 읽힌다 */}
          <View style={[styles.versionRow, { backgroundColor: colors.surface }]}>
            <Text style={[styles.versionOld, { color: colors.textSecondary }]}>{currentVersion}</Text>
            <Animated.Text
              style={[
                styles.versionArrow,
                {
                  color: colors.textTertiary,
                  opacity: arrow,
                  transform: [
                    { translateX: arrow.interpolate({ inputRange: [0, 1], outputRange: [-8, 0] }) },
                  ],
                },
              ]}
            >
              →
            </Animated.Text>
            <Animated.View
              style={{
                opacity: newVer,
                transform: [
                  { translateY: newVer.interpolate({ inputRange: [0, 1], outputRange: [4, 0] }) },
                ],
              }}
            >
              <Text
                style={[
                  styles.versionNew,
                  { backgroundColor: colors.primaryLight, color: colors.primary },
                ]}
              >
                {latestVersion}
              </Text>
            </Animated.View>
          </View>

          {shown.length > 0 ? (
            <View style={styles.notes}>
              <Text style={[styles.notesTitle, { color: colors.textSecondary }]}>{t('바뀐 점')}</Text>
              {shown.map((n, i) => (
                <View key={i} style={styles.noteRow}>
                  <Text style={[styles.noteDot, { color: colors.primary }]}>·</Text>
                  <Text style={[styles.noteText, { color: colors.textSecondary }]}>{n}</Text>
                </View>
              ))}
            </View>
          ) : (
            <Text style={[styles.description, { color: colors.textSecondary }]}>
              {t('최신 버전으로 업데이트하면\n새로운 기능을 사용할 수 있습니다.')}
            </Text>
          )}

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
              onPress={handleSkip}
              accessibilityRole="button"
            >
              <Text style={[styles.skipButtonText, { color: colors.textSecondary }]}>
                {t('이 버전 건너뛰기')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.closeButton} onPress={onClose} accessibilityRole="button">
              {/*
                ⚠ `textTertiary` 가 아니라 `textSecondary` 다. 다크의 `textTertiary` 는
                  카드 배경 위에서 대비가 3.6:1 로 기준(4.5:1)에 못 미친다.
              */}
              <Text style={[styles.closeButtonText, { color: colors.textSecondary }]}>
                {t('나중에')}
              </Text>
            </TouchableOpacity>
          </View>

          {skipped !== null && (
            <View style={[styles.skippedPill, { backgroundColor: colors.surface }]}>
              <MaterialIcons name="check-circle" size={16} color={colors.success} />
              <Text style={[styles.skippedText, { color: colors.textSecondary }]}>
                {t('{{version}} 은 다시 묻지 않을게요', { version: skipped })}
              </Text>
            </View>
          )}
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SPACING.xxl,
    // 세로 패딩은 insets 를 더해 인라인으로 준다
  },
  container: {
    borderRadius: 20,
    borderWidth: 1,
    padding: SPACING.xxl + SPACING.xs,
    width: '100%',
    maxWidth: 360,
    alignItems: 'center',
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: SPACING.md,
    marginBottom: SPACING.lg,
  },
  versionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: RADIUS.lg,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    marginBottom: SPACING.lg,
    gap: SPACING.sm,
  },
  versionOld: { fontSize: FONT.body, fontWeight: '600' },
  versionArrow: { fontSize: FONT.body },
  versionNew: {
    fontSize: FONT.body,
    fontWeight: '700',
    overflow: 'hidden',
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
  },
  notes: { alignSelf: 'stretch', marginBottom: SPACING.xxl },
  notesTitle: { fontSize: FONT.caption, fontWeight: '700', marginBottom: SPACING.xs },
  noteRow: { flexDirection: 'row', gap: SPACING.xs },
  noteDot: { fontSize: FONT.label + 1, lineHeight: 22 },
  noteText: { flex: 1, fontSize: FONT.label + 1, lineHeight: 22 },
  description: {
    fontSize: FONT.label + 1,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: SPACING.xxl,
  },
  buttons: {
    width: '100%',
    gap: SPACING.sm,
  },
  updateButton: {
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  updateButtonText: {
    color: '#FFFFFF',
    fontSize: FONT.body + 1,
    fontWeight: '600',
  },
  skipButton: {
    height: 48,
    borderWidth: 1,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  skipButtonText: {
    fontSize: FONT.label + 1,
    fontWeight: '500',
  },
  closeButton: {
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButtonText: {
    fontSize: FONT.label + 1,
  },
  skippedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    borderRadius: 999,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    marginTop: SPACING.md,
  },
  skippedText: { fontSize: FONT.caption, fontWeight: '500' },
});
