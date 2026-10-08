import React, { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Animated, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

import { FONT, RADIUS, SPACING } from '../constants/design';
import { useTheme } from '../contexts/ThemeContext';

/**
 * 첫 사용자 안내 — **아직 한 판도 안 풀었을 때만** 홈에 뜬다.
 *
 * 🔴 **버튼 7개를 숨기는 것은 단어가 0개일 때뿐이다.**
 *    시안(#2)은 *"단어가 0개면 버튼 7개 대신"* 이라고만 적었는데, 그걸 "퀴즈를 풀 때까지"로
 *    늘려 읽으면 **단어 50개를 넣어 두고 아직 안 푼 사람이 단어장·통계에 못 들어간다.**
 *    담을 것이 없는 사람에게만 길을 좁힌다.
 *
 * ```
 * 단어 0개           패널만 (버튼 숨김) · 카드 = [단어 추가] + CSV 링크
 * 단어 ≥1 · 퀴즈 0   패널 + 버튼 둘 다  · ①에 ✓ · 카드 = [퀴즈 시작]
 * 퀴즈 ≥1            패널이 사라진다 (알림은 기존 권유 시트가 이어받는다)
 * ```
 *
 * ⚠ **3단계의 ③(복습 알림)은 여기서 ✓ 가 되지 않는다.** 퀴즈를 한 판 풀면 이 패널이 사라지고
 *   그 자리를 `NotificationPromptSheet` 가 이어받기 때문이다. 같은 일을 두 곳이 조르지 않는다.
 */

interface OnboardingPanelProps {
  wordCount: number;
  quizCount: number;
  onAddWord: () => void;
  onImportWords: () => void;
  onStartQuiz: () => void;
}

/** 이 패널을 띄울 것인가. 🔴 홈과 이 파일이 같은 함수를 본다 — 조건이 두 벌이 되면 갈라진다 */
export function shouldShowOnboarding(wordCount: number, quizCount: number): boolean {
  return quizCount === 0;
}

/** 버튼 7개를 숨길 것인가. **담을 것이 없는 사람에게만** 길을 좁힌다 */
export function shouldHideMenu(wordCount: number, quizCount: number): boolean {
  return wordCount === 0 && quizCount === 0;
}

const STEP_COUNT = 3;
/** 연결선이 차오르는 시간. 눈에 보이되 기다리게 하지는 않는 길이 */
const LINE_FILL_MS = 420;

export default function OnboardingPanel({
  wordCount,
  quizCount,
  onAddWord,
  onImportWords,
  onStartQuiz,
}: OnboardingPanelProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();

  const hasWord = wordCount > 0;

  /*
   * 연결선 채우기(①→②). 🔴 **`useNativeDriver: false` 다.**
   *    높이는 네이티브 드라이버가 못 받는 값이고, 이 앱은 그 둘을 섞어 쓰다가 1.7.0 에서
   *    **카드가 화면 밖에 그대로 서 있는** 버그를 냈다(`CLAUDE.md` 플래시카드 절).
   *    섞지 않는 것이 규칙이라 여기서도 지킨다.
   */
  const fill = useRef(new Animated.Value(hasWord ? 1 : 0)).current;
  useEffect(() => {
    const anim = Animated.timing(fill, {
      toValue: hasWord ? 1 : 0,
      duration: LINE_FILL_MS,
      useNativeDriver: false,
    });
    anim.start();
    // 🔴 cleanup 필수 — 화면을 떠난 뒤 값이 바뀌면 경고가 나고 누수가 된다
    return () => anim.stop();
  }, [hasWord, fill]);

  const steps = [
    { title: t('단어 추가'), hint: t('뜻은 「뜻 찾기」로 채워 드려요'), done: hasWord },
    { title: t('퀴즈로 확인'), hint: '', done: quizCount > 0 },
    { title: t('복습 알림 받기'), hint: '', done: false },
  ];
  // 지금 해야 할 칸. 다 됐으면 -1
  const current = steps.findIndex((s) => !s.done);

  return (
    <View style={styles.wrap}>
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={[styles.iconCircle, { backgroundColor: colors.primaryLight }]}>
          <MaterialIcons name={hasWord ? 'school' : 'add'} size={30} color={colors.primary} />
        </View>
        <Text style={[styles.cardTitle, { color: colors.text }]}>
          {hasWord ? t('이제 퀴즈로 확인해 볼까요') : t('첫 단어를 추가해 보세요')}
        </Text>
        <Text style={[styles.cardSub, { color: colors.textSecondary }]}>
          {hasWord ? t('방금 담은 단어로 바로 풀 수 있어요') : t('단어 하나면 퀴즈를 시작해요')}
        </Text>

        <TouchableOpacity
          style={[styles.primaryButton, { backgroundColor: colors.primary }]}
          onPress={hasWord ? onStartQuiz : onAddWord}
          activeOpacity={0.8}
          accessibilityRole="button"
        >
          <Text style={styles.primaryButtonText}>
            {hasWord ? t('퀴즈 시작') : t('단어 추가')}
          </Text>
        </TouchableOpacity>

        {/* ⚠ 단어가 생긴 뒤에는 숨긴다 — 그때 할 일은 가져오기가 아니라 퀴즈다 */}
        {!hasWord && (
          <TouchableOpacity onPress={onImportWords} accessibilityRole="button" style={styles.linkHit}>
            <Text style={[styles.link, { color: colors.primaryStrong }]}>
              {t('CSV 파일로 한 번에 가져오기')}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      <Text style={[styles.stepsTitle, { color: colors.textSecondary }]}>
        {t('이렇게 시작해요')}
      </Text>

      <View style={[styles.steps, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {steps.map((step, index) => (
          <View key={step.title} style={styles.stepRow}>
            <View style={styles.rail}>
              <View
                style={[
                  styles.badge,
                  { borderColor: colors.border, backgroundColor: colors.background },
                  step.done && { backgroundColor: colors.primary, borderColor: colors.primary },
                ]}
              >
                {step.done ? (
                  <MaterialIcons name="check" size={15} color="#FFFFFF" />
                ) : (
                  <Text style={[styles.badgeNum, { color: colors.textTertiary }]}>{index + 1}</Text>
                )}
              </View>
              {index < STEP_COUNT - 1 && (
                <View style={[styles.line, { backgroundColor: colors.border }]}>
                  {/* 첫 칸이 끝나면 ②까지 차오른다 */}
                  {index === 0 && (
                    <Animated.View
                      style={[
                        styles.lineFill,
                        {
                          backgroundColor: colors.primary,
                          height: fill.interpolate({
                            inputRange: [0, 1],
                            outputRange: ['0%', '100%'],
                          }),
                        },
                      ]}
                    />
                  )}
                </View>
              )}
            </View>

            <View style={styles.stepTexts}>
              <View style={styles.stepTitleRow}>
                <Text style={[styles.stepTitle, { color: colors.text }]}>{step.title}</Text>
                {index === current && (
                  <View style={[styles.nowChip, { backgroundColor: colors.primaryLight }]}>
                    <Text style={[styles.nowChipText, { color: colors.primaryStrong }]}>
                      {t('지금')}
                    </Text>
                  </View>
                )}
              </View>
              {step.hint !== '' && (
                <Text style={[styles.stepHint, { color: colors.textTertiary }]}>{step.hint}</Text>
              )}
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

const BADGE = 26;

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: SPACING.lg, paddingTop: SPACING.lg },
  card: {
    borderWidth: 1,
    borderRadius: RADIUS.xl,
    padding: SPACING.xl,
    alignItems: 'center',
  },
  iconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: { fontSize: FONT.title, fontWeight: '700', marginTop: SPACING.md, textAlign: 'center' },
  cardSub: { fontSize: FONT.body, marginTop: SPACING.xs, textAlign: 'center' },
  primaryButton: {
    alignSelf: 'stretch',
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: SPACING.lg,
    minHeight: 48,
  },
  primaryButtonText: { color: '#FFFFFF', fontSize: FONT.body, fontWeight: '700' },
  linkHit: { paddingVertical: SPACING.sm, paddingHorizontal: SPACING.sm, marginTop: SPACING.xs },
  link: { fontSize: FONT.label, fontWeight: '600' },

  stepsTitle: {
    fontSize: FONT.label,
    fontWeight: '700',
    marginTop: SPACING.xl,
    marginBottom: SPACING.sm,
  },
  steps: {
    borderWidth: 1,
    borderRadius: RADIUS.xl,
    paddingVertical: SPACING.lg,
    paddingHorizontal: SPACING.lg,
  },
  stepRow: { flexDirection: 'row' },
  rail: { width: BADGE, alignItems: 'center' },
  badge: {
    width: BADGE,
    height: BADGE,
    borderRadius: BADGE / 2,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeNum: { fontSize: FONT.caption, fontWeight: '700' },
  line: { width: 2, flex: 1, minHeight: 18, marginVertical: 2, overflow: 'hidden' },
  lineFill: { width: 2 },
  stepTexts: { flex: 1, paddingLeft: SPACING.md, paddingBottom: SPACING.lg },
  stepTitleRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  stepTitle: { fontSize: FONT.body, fontWeight: '600' },
  nowChip: { paddingHorizontal: SPACING.sm, paddingVertical: 2, borderRadius: RADIUS.pill },
  nowChipText: { fontSize: FONT.micro, fontWeight: '700' },
  stepHint: { fontSize: FONT.caption, marginTop: 2, lineHeight: 16 },
});
