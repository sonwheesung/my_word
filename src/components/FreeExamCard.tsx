import React, { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Animated, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

import { EXAM_FREE_QUOTA, EXAM_SIZE } from '../constants/appConfig';
import { FONT, RADIUS, SPACING } from '../constants/design';
import { useTheme } from '../contexts/ThemeContext';
import type { QuotaNotice } from '../services/examQuotaService';

/**
 * AI 시험 진입 화면 맨 위의 **무료 판수 안내 카드** (시안 단어앱#19 · 2026-10-15).
 *
 * 🔴 **들어오기 전에는 남은 판수를 알 방법이 없었다.** 서버는 `remaining` 을 *시험을 받은
 *    응답에만* 싣는다. 그래서 다 쓴 사람은 **90초를 기다릴 각오를 하고 누른 뒤** 실패 화면에서
 *    처음 알았다. 사장님 폰에서 2026-10-15 에 실제로 그렇게 보였다.
 *
 * 🔴 **겁주지 않는다.** 빨강 · 경고 아이콘 · *"곧 끝나요!"* 같은 재촉을 쓰지 않고 남은 수를
 *    사실대로만 말한다(화풍 「동기 장치 최소」). 다 쓴 카드도 주색을 빼 **흰 카드**로 둔다 —
 *    가장 아쉬운 순간에 색으로 몰아붙이지 않는다.
 *
 * 🔴 **카드는 자리에 그대로 있고 글자만 바뀐다.** 없앴다 다시 그리면 아래 입력들이 덜컹 밀린다.
 *
 * ## 🚫 쓰지 않는 말
 *
 * ```
 * 「평생」 · 「이 기기에서」   로그인이 들어오면 거짓이 된다(횟수는 주체당이다)
 * 「무제한」                  구독이 여는 것은 **판수** 제한뿐이다. 하루 호출 한도 · 10분 쿨다운 ·
 *                            월 예산은 구독자에게도 남는다 → 정확한 말은 **「판수 제한 없음」**
 * ```
 *
 * ⚠ 점은 **남은 무료 판수**지 「남은 새 문제」가 아니다. 단어가 적으면 점이 남아 있어도
 *   이미 본 문제가 나올 수 있다(무료는 단어당 15문제까지).
 */
interface FreeExamCardProps {
  /** 남은 무료 판수. 🔴 **대략이다** — 시험 응답의 `remaining` 으로 보정된다 */
  remaining: number;
  /**
   * 구독이 끝났다는 것을 **아직 안 알렸으면** 그 사유 (2026-10-15 시안 보강).
   *
   * 🔴 **사라짐으로 알리는 설계는 되돌아올 때 할 말이 없다.** 구독자에게는 카드를 아예 안
   *    그리는데, 해지·결제 실패로 무료가 되면 카드가 설명 없이 다시 뜨고 숫자도 10이 아니라
   *    쓰다 만 숫자로 돌아온다(구독 중에는 무료분을 쓰지 않는다 — 서버의 의도된 설계).
   *    그 숫자만 보면 *"내 횟수가 왜 이렇지"* 가 된다. 그래서 **카드가 직접 말한다.**
   */
  notice: QuotaNotice | null;
  /** 지난 시험 다시 풀기 → 성적표. 재시험은 서버를 안 불러 **공짜다** */
  onHistory: () => void;
  /** 결제 수단 확인 → Play. `notice === 'billing'` 일 때만 보인다 */
  onBilling: () => void;
}

/** 점 하나. 켜짐/꺼짐만 다르다 */
function Dot({ on, color, off }: { on: boolean; color: string; off: string }) {
  return <View style={[styles.dot, { backgroundColor: on ? color : off }]} />;
}

export default function FreeExamCard({
  remaining,
  notice,
  onHistory,
  onBilling,
}: FreeExamCardProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();

  const left = Math.max(0, Math.min(EXAM_FREE_QUOTA, Math.floor(remaining)));
  const spent = left === 0;

  /*
   * 등장만 움직인다 — 아래 6px → 0 · 투명 → 보임 · 220ms (화풍: 180~260ms · 출렁임 없음).
   * 🚫 `useNativeDriver` 로 돌린 뒤 `setValue` 로 되돌리지 않는다 — 플래시카드가 그걸로
   *    **값은 맞는데 화면이 비는** 버그를 냈다(`CLAUDE.md` 플래시카드 절). 여기는 한 번 올라오고
   *    끝이라 되돌릴 일이 없으므로 네이티브 드라이버가 안전하다.
   */
  const appear = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(appear, { toValue: 1, duration: 220, useNativeDriver: true }).start();
  }, [appear]);

  const title = spent
    ? t('무료 시험 {{total}}번을 다 썼어요', { total: EXAM_FREE_QUOTA })
    : left === EXAM_FREE_QUOTA
      ? t('AI 시험을 무료로 {{total}}번 볼 수 있어요', { total: EXAM_FREE_QUOTA })
      : left === 1
        ? t('마지막 무료 시험이에요')
        : t('무료 시험이 {{n}}번 남았어요', { n: left });

  const sub = spent
    ? t('구독하면 시험 판수 제한 없이 볼 수 있어요')
    : left === EXAM_FREE_QUOTA
      ? t('내 단어로 {{count}}문제를 만들어요. 새 시험을 만들 때만 1번씩 줄어요', {
          count: EXAM_SIZE,
        })
      : t('다 쓰면 구독으로 계속 볼 수 있어요');

  return (
    <Animated.View
      style={{
        opacity: appear,
        transform: [{ translateY: appear.interpolate({ inputRange: [0, 1], outputRange: [6, 0] }) }],
      }}
    >
      {/*
        🔴 **결제 실패는 카드 밖 노란 박스다.** 해지는 예정된 일이라 카드 안 한 줄이지만,
           이쪽은 **사고**라서 손쓸 길이 같이 있어야 한다(설정 › 구독 관리의 「결제 문제」와 같은 결).
      */}
      {notice === 'billing' && (
        <View
          style={[
            styles.billingBox,
            { backgroundColor: colors.warningBg, borderColor: colors.warningBorder },
          ]}
        >
          <Text style={[styles.billingTitle, { color: colors.warningText }]}>
            {t('결제가 안 돼서 구독이 멈췄어요')}
          </Text>
          <Text style={[styles.billingBody, { color: colors.textSecondary }]}>
            {t('결제 수단을 바꾸면 다시 이어져요. 그동안은 남은 무료 시험으로 볼 수 있어요')}
          </Text>
          <TouchableOpacity onPress={onBilling} accessibilityRole="button" style={styles.billingLink}>
            <Text style={[styles.billingLinkText, { color: colors.primaryStrong }]}>
              {t('결제 수단 확인')}
            </Text>
            <MaterialIcons name="chevron-right" size={16} color={colors.primaryStrong} />
          </TouchableOpacity>
        </View>
      )}

      <View
        style={[
          styles.card,
          spent
            ? { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }
            : { backgroundColor: colors.primaryLight },
        ]}
      >
        {/* 🔴 해지는 **좋은 소식으로** 전한다 — 나무랄 일이 아니다 */}
        {notice === 'ended' && (
          <View style={styles.endedRow}>
            <MaterialIcons name="check" size={16} color={colors.successText} />
            <Text style={[styles.endedText, { color: colors.successText }]}>
              {t('구독이 끝나서, 쓰지 않았던 무료 시험 {{n}}번이 돌아왔어요', { n: left })}
            </Text>
          </View>
        )}

        {left === EXAM_FREE_QUOTA && notice === null && (
          <View style={[styles.pill, { backgroundColor: colors.card }]}>
            <Text style={[styles.pillText, { color: colors.primaryStrong }]}>
              {t('처음 {{total}}번은 무료', { total: EXAM_FREE_QUOTA })}
            </Text>
          </View>
        )}

        <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
        <Text style={[styles.sub, { color: colors.textSecondary }]}>
          {notice === null ? sub : t('구독하면 다시 판수 제한 없이 볼 수 있어요')}
        </Text>

        {spent ? (
          /* 🔴 다 썼을 때는 **혜택 둘**을 적는다. 숫자를 세는 자리가 아니다 */
          <View style={styles.benefits}>
            <View style={styles.benefitRow}>
              <MaterialIcons name="check" size={16} color={colors.successText} />
              <Text style={[styles.benefitText, { color: colors.text }]}>
                {t('AI 시험 판수 제한 없이')}
              </Text>
            </View>
            <View style={styles.benefitRow}>
              <MaterialIcons name="check" size={16} color={colors.successText} />
              <Text style={[styles.benefitText, { color: colors.text }]}>{t('광고 없이')}</Text>
            </View>
          </View>
        ) : (
          <>
            <View style={styles.dotsRow}>
              <View style={styles.dots}>
                {Array.from({ length: EXAM_FREE_QUOTA }, (_, i) => (
                  <Dot key={i} on={i < left} color={colors.primary} off={colors.border} />
                ))}
              </View>
              {/* 🔴 고정폭 숫자 — 9 → 10 에서 글자가 흔들리지 않게 */}
              <Text style={[styles.count, { color: colors.primaryStrong }]}>
                {left}
                <Text style={[styles.countTotal, { color: colors.textSecondary }]}>
                  {' / '}
                  {EXAM_FREE_QUOTA}
                </Text>
              </Text>
            </View>
            <Text style={[styles.note, { color: colors.textTertiary }]}>
              {t('재시험과 만들다 실패한 시험은 횟수에 안 들어가요')}
            </Text>
          </>
        )}
      </View>

      {/*
        🔴 **다 썼어도 할 수 있는 일을 보여 준다.** 재시험은 서버를 안 불러 공짜이고,
           *"구독을 끊어도 객관식 재시험까지 된다"* 가 이 기능의 약속이다.
        ⚠ 구독 구매 화면(시안 #20)이 아직 없다. 생기면 여기 [구독 알아보기]가 붙는다 —
          **없는 화면으로 보내는 버튼을 먼저 만들지 않는다.**
      */}
      {spent && (
        <TouchableOpacity onPress={onHistory} accessibilityRole="button" style={styles.historyLink}>
          <MaterialIcons name="history" size={16} color={colors.primary} />
          <Text style={[styles.historyText, { color: colors.primaryStrong }]}>
            {t('지난 시험 다시 풀기 · 무료')}
          </Text>
        </TouchableOpacity>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    gap: SPACING.xs,
  },
  pill: {
    alignSelf: 'flex-start',
    paddingHorizontal: SPACING.sm,
    paddingVertical: 3,
    borderRadius: RADIUS.pill,
    marginBottom: SPACING.xs,
  },
  pillText: { fontSize: FONT.caption, fontWeight: '700' },
  title: { fontSize: FONT.title, fontWeight: '700' },
  sub: { fontSize: FONT.body, lineHeight: 20 },
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: SPACING.sm,
  },
  dots: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  dot: { width: 10, height: 10, borderRadius: 5 },
  count: { fontSize: FONT.display, fontWeight: '700', fontVariant: ['tabular-nums'] },
  countTotal: { fontSize: FONT.body, fontWeight: '600' },
  note: { fontSize: FONT.caption, marginTop: SPACING.xs },
  benefits: { marginTop: SPACING.sm, gap: SPACING.xs },
  benefitRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs },
  benefitText: { fontSize: FONT.body },
  endedRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.xs,
    marginBottom: SPACING.xs,
  },
  endedText: { fontSize: FONT.body, fontWeight: '600', flex: 1, lineHeight: 20 },
  billingBox: {
    borderRadius: RADIUS.md,
    borderWidth: 1,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    gap: 4,
  },
  billingTitle: { fontSize: FONT.body, fontWeight: '700' },
  billingBody: { fontSize: FONT.body, lineHeight: 20 },
  billingLink: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  billingLinkText: { fontSize: FONT.body, fontWeight: '700' },
  historyLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    paddingVertical: SPACING.sm,
    marginTop: SPACING.xs,
  },
  historyText: { fontSize: FONT.body, fontWeight: '700' },
});
