import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { MaterialIcons } from '@expo/vector-icons';

import ConfirmSheet from '../components/ConfirmSheet';
import ScreenHeader from '../components/ScreenHeader';
import Toast from '../components/Toast';
import { EXAM_FREE_QUOTA, PLAY_SUBSCRIPTIONS_URL } from '../constants/appConfig';
import { FONT, RADIUS, SPACING } from '../constants/design';
import { usePurchase } from '../contexts/PurchaseContext';
import { useTheme } from '../contexts/ThemeContext';
import { useToast } from '../hooks/useToast';
import { examQuotaService } from '../services/examQuotaService';
import { subscriptionService, type SubPlanKind } from '../services/subscriptionService';

/**
 * 구독 관리 · 해지 — 설정 › 구독 관리 (시안 단어앱#21 · 2026-10-16 사장님 승인).
 *
 * 🔴 **앱은 구독을 직접 해지할 수 없다. Play 가 주인이다.**
 *    그래서 이 화면이 하는 일은 **상태를 정직하게 보여 주고 Play 로 보내는 것**뿐이다.
 *    구독을 파는 앱은 **앱 안에 관리·해지 경로가 있어야 한다**(Play 구독 정책).
 *
 * 🚫 **해지를 붙잡지 않는다.** 버튼을 숨기거나 흐리게 하지 않고, 「정말요? → 할인 → 설문」으로
 *    여러 단계를 만들지 않는다. 확인 **한 번** 뒤 바로 Play 로 보낸다
 *    (전자상거래법 다크패턴 「취소·탈퇴 방해」).
 *
 * 🔴 **금액을 적지 않는다**(2026-10-16 사장님 결정). 서버가 주는 것은
 *    `active · expiresAt · willRenew · inGracePeriod` 넷뿐이라 **금액이 없다.**
 *    「지금 파는 가격」을 가져다 쓰면, 가격을 올린 뒤 **옛 가격을 내는 사람에게 새 가격**이 뜬다.
 *    정확한 금액은 [Play 구독 관리]에 있다.
 */
interface SubscriptionScreenProps {
  onBack: () => void;
  /** 구독이 없을 때 안내로 보낸다(시안 #20) */
  onSubscribe: () => void;
}

/**
 * 어떤 상태로 그릴 것인가.
 *
 * 🔴 **순서가 중요하다. 유예가 먼저다**(2026-10-16).
 *    결제가 실패한 뒤 해지까지 누른 사람은 `!willRenew` 와 `inGracePeriod` 가 **둘 다 참**이다.
 *    그때 「해지 예약」을 보여 주면 *"11월 13일까지 쓸 수 있어요"* 라고 말하는데,
 *    실제로는 **유예가 끝나는 날 끊긴다.** 마음을 바꿔도 그때는 늦다.
 *    → **시한이 급하고 할 일이 있는 쪽**을 먼저 보여 준다.
 */
type SubState = 'grace' | 'canceled' | 'on';

function stateOf(active: boolean, grace: boolean, willRenew: boolean): SubState | null {
  if (!active) return null;
  if (grace) return 'grace';
  if (!willRenew) return 'canceled';
  return 'on';
}

/** `2026-11-13T…` → `11월 13일`. ⚠ 못 읽으면 **빈 문자열**이다(아무 날짜도 지어내지 않는다) */
function dayText(iso: string | null): string {
  if (iso === null) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getMonth() + 1}월 ${d.getDate()}일`;
}

export default function SubscriptionScreen({ onBack, onSubscribe }: SubscriptionScreenProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { toast, showToast, hideToast } = useToast();
  const { proActive, proKnown, proExpiresAt, proWillRenew, inGracePeriod, recheckPro, restore } =
    usePurchase();

  const [kind, setKind] = useState<SubPlanKind | null>(null);
  const [freeLeft, setFreeLeft] = useState<number | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const [k, left] = await Promise.all([
        subscriptionService.activePlanKind(),
        examQuotaService.loadFreeLeft(),
      ]);
      if (!alive) return;
      setKind(k);
      setFreeLeft(left);
    })();
    return () => {
      alive = false;
    };
  }, []);

  // 🔴 들어올 때 한 번 다시 묻는다. 값이 6시간까지 묵을 수 있다(서버 쿨다운)
  useEffect(() => {
    void recheckPro();
  }, [recheckPro]);

  const openPlay = useCallback(() => {
    void Linking.openURL(PLAY_SUBSCRIPTIONS_URL);
  }, []);

  const onRestore = useCallback(async () => {
    setBusy(true);
    const r = await restore();
    await recheckPro(true);
    setBusy(false);
    showToast(r.ok ? t('구독을 다시 확인했어요') : t('되살릴 구독을 찾지 못했어요'), 'info');
  }, [recheckPro, restore, showToast, t]);

  const state = stateOf(proActive, inGracePeriod, proWillRenew);
  const until = dayText(proExpiresAt);

  // ── 구독이 없을 때 ────────────────────────────────────────────────────────
  if (proKnown && state === null) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <StatusBar style={colors.isDark ? 'light' : 'dark'} />
        <ScreenHeader title={t('구독 관리')} onBack={onBack} />
        <View style={styles.emptyBox}>
          <MaterialIcons name="workspace-premium" size={56} color={colors.textTertiary} />
          <Text style={[styles.emptyTitle, { color: colors.text }]}>
            {t('지금은 구독 중이 아니에요')}
          </Text>
          <Text style={[styles.emptySub, { color: colors.textSecondary }]}>
            {t('구독하면 날마다 새 문제로 시험을 볼 수 있어요')}
          </Text>
          <TouchableOpacity
            style={[styles.cta, { backgroundColor: colors.primaryStrong }]}
            onPress={onSubscribe}
            accessibilityRole="button"
          >
            <Text style={styles.ctaText}>{t('구독 알아보기')}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => void onRestore()} disabled={busy} accessibilityRole="button">
            <Text style={[styles.link, { color: colors.primaryStrong }]}>{t('구매 복원')}</Text>
          </TouchableOpacity>
        </View>
        <Toast message={toast.message} type={toast.type} visible={toast.visible} onHide={hideToast} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style={colors.isDark ? 'light' : 'dark'} />
      <ScreenHeader title={t('구독 관리')} onBack={onBack} />
      <ScrollView contentContainerStyle={styles.scroll}>
        {/*
          🔴 **결제 문제는 빨강이 아니라 노랑이다.** 겁주는 색을 쓰면 사용자가 굳는다.
             말해야 하는 것은 **언제까지 무엇을 하면 되는지** 하나다.
        */}
        {state === 'grace' && (
          <View
            style={[styles.alert, { backgroundColor: colors.warningBg, borderColor: colors.warningBorder }]}
          >
            <Text style={[styles.alertTitle, { color: colors.warningText }]}>
              {t('결제가 안 됐어요')}
            </Text>
            <Text style={[styles.alertBody, { color: colors.textSecondary }]}>
              {until === ''
                ? t('결제 수단을 바꿔 주세요')
                : t('{{day}}까지 결제 수단을 바꿔 주세요', { day: until })}
            </Text>
            <TouchableOpacity onPress={openPlay} accessibilityRole="button" style={styles.alertLink}>
              <Text style={[styles.alertLinkText, { color: colors.primaryStrong }]}>
                {t('결제 수단 바꾸기')}
              </Text>
              <MaterialIcons name="chevron-right" size={16} color={colors.primaryStrong} />
            </TouchableOpacity>
          </View>
        )}

        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View
            style={[
              styles.pill,
              { backgroundColor: state === 'canceled' ? colors.surface : colors.successBg },
            ]}
          >
            <Text
              style={[
                styles.pillText,
                { color: state === 'canceled' ? colors.textSecondary : colors.successText },
              ]}
            >
              {state === 'canceled' ? t('해지 예약됨') : t('구독 중')}
            </Text>
          </View>

          {/* ⚠ 종류를 모르면 아예 안 적는다. 「월간」을 찍어 두고 틀리는 것보다 낫다 */}
          {kind !== null && (
            <Text style={[styles.kind, { color: colors.text }]}>
              {kind === 'yearly' ? t('연간 구독') : t('월간 구독')}
            </Text>
          )}

          {/*
            🔴 **금액을 적지 않는다**(머리 주석). 날짜만 말한다.
            ⚠ 날짜를 못 읽으면 그 줄을 **통째로 뺀다** — 「없음」도 지어낸 말이다.
          */}
          {until !== '' && (
            <View style={styles.row}>
              <Text style={[styles.rowKey, { color: colors.textSecondary }]}>
                {state === 'canceled' ? t('이날까지 쓸 수 있어요') : t('다음 결제')}
              </Text>
              <Text style={[styles.rowVal, { color: colors.text }]}>{until}</Text>
            </View>
          )}

          {state === 'canceled' && (
            <Text style={[styles.note, { color: colors.textSecondary }]}>
              {t('그날까지는 지금 그대로예요. 그 뒤에는 무료로 바뀌어요')}
            </Text>
          )}
        </View>

        {/*
          🟢 **해지해도 남는 것을 먼저 말한다.** 해지를 망설이는 사람에게 필요한 것은
             겁이 아니라 사실이다. 셋 다 코드로 확인한 것이다(2026-10-15).
        */}
        <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('해지해도 그대로예요')}</Text>
        <View style={[styles.keepBox, { backgroundColor: colors.surface }]}>
          {[
            t('단어와 단어장, 퀴즈 기록, 시험 성적표'),
            t('지난 시험 다시 풀기는 계속 무료'),
            freeLeft !== null && freeLeft > 0
              ? t('쓰지 않았던 무료 시험 {{n}}번이 돌아와요', { n: freeLeft })
              : t('쓰지 않았던 무료 시험이 남아 있으면 돌아와요'),
          ].map((line) => (
            <View key={line} style={styles.keepRow}>
              <MaterialIcons name="check" size={16} color={colors.successText} />
              <Text style={[styles.keepText, { color: colors.text }]}>{line}</Text>
            </View>
          ))}
        </View>
      </ScrollView>

      <View style={[styles.bottom, { borderTopColor: colors.border }]}>
        {/*
          🚫 **해지 버튼을 숨기거나 흐리게 하지 않는다**(머리 주석). 본문 글자색 + 테두리다.
          ⚠ 되돌릴 수 없는 일이 아니라서 **빨강을 쓰지 않는다** — 해지는 다시 켤 수 있다.
        */}
        {state === 'canceled' ? (
          <TouchableOpacity
            style={[styles.cta, { backgroundColor: colors.primaryStrong }]}
            onPress={openPlay}
            accessibilityRole="button"
          >
            <Text style={styles.ctaText}>{t('다시 구독하기')}</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.cta, styles.ctaLine, { borderColor: colors.border }]}
            onPress={() => setConfirmCancel(true)}
            accessibilityRole="button"
          >
            <Text style={[styles.ctaText, { color: colors.text }]}>{t('구독 해지')}</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity onPress={() => void onRestore()} disabled={busy} accessibilityRole="button">
          <Text style={[styles.link, { color: colors.primaryStrong }]}>{t('구매 복원')}</Text>
        </TouchableOpacity>
      </View>

      {/*
        🔴 **확인은 한 번이다.** 잃는 것과 남는 것을 나란히 보여 준 뒤 바로 Play 로 보낸다.
           「정말요?」를 두 번 묻거나 할인을 내밀지 않는다.
      */}
      <ConfirmSheet
        visible={confirmCancel}
        title={t('구독을 해지할까요?')}
        message={
          until === ''
            ? t('결제한 기간이 끝나면 무료로 바뀌어요')
            : t('{{day}}까지는 지금 그대로 쓰시고, 그 뒤에 무료로 바뀌어요', { day: until })
        }
        preview={
          <View style={[styles.keepBox, { backgroundColor: colors.surface, marginTop: SPACING.sm }]}>
            <Text style={[styles.keepHead, { color: colors.dangerText }]}>{t('없어지는 것')}</Text>
            <Text style={[styles.keepText, { color: colors.text }]}>
              {t('AI 시험은 날마다 새 문제로, 광고도 없어요')}
            </Text>
            <Text style={[styles.keepHead, { color: colors.successText, marginTop: SPACING.sm }]}>
              {t('그대로인 것')}
            </Text>
            <Text style={[styles.keepText, { color: colors.text }]}>
              {t('단어 · 기록 · 성적표 · 지난 시험 다시 풀기(무료)')}
            </Text>
          </View>
        }
        confirmLabel={t('Play 에서 해지하기')}
        cancelLabel={t('계속 쓰기')}
        tone="primary"
        onConfirm={() => {
          setConfirmCancel(false);
          openPlay();
        }}
        onCancel={() => setConfirmCancel(false)}
      />
      <Toast message={toast.message} type={toast.type} visible={toast.visible} onHide={hideToast} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { padding: SPACING.lg, gap: SPACING.md },
  alert: { borderWidth: 1, borderRadius: RADIUS.md, padding: SPACING.md, gap: 4 },
  alertTitle: { fontSize: FONT.body, fontWeight: '700' },
  alertBody: { fontSize: FONT.label, lineHeight: 19 },
  alertLink: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  alertLinkText: { fontSize: FONT.label, fontWeight: '700' },
  card: { borderWidth: 1, borderRadius: RADIUS.lg, padding: SPACING.lg, gap: SPACING.xs },
  pill: {
    alignSelf: 'flex-start',
    paddingHorizontal: SPACING.sm,
    paddingVertical: 3,
    borderRadius: RADIUS.pill,
  },
  pillText: { fontSize: FONT.micro, fontWeight: '700' },
  kind: { fontSize: FONT.title, fontWeight: '700', marginTop: 2 },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginTop: SPACING.xs },
  rowKey: { fontSize: FONT.label },
  rowVal: { fontSize: FONT.label, fontWeight: '700' },
  note: { fontSize: FONT.caption, lineHeight: 17, marginTop: SPACING.xs },
  sectionTitle: { fontSize: FONT.label, fontWeight: '700', marginTop: SPACING.sm },
  keepBox: { borderRadius: RADIUS.md, padding: SPACING.md, gap: SPACING.xs },
  keepHead: { fontSize: FONT.micro, fontWeight: '700' },
  keepRow: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.xs },
  keepText: { fontSize: FONT.label, lineHeight: 19, flex: 1 },
  bottom: { padding: SPACING.lg, borderTopWidth: StyleSheet.hairlineWidth, gap: SPACING.md, alignItems: 'center' },
  cta: { height: 48, borderRadius: RADIUS.lg, alignItems: 'center', justifyContent: 'center', alignSelf: 'stretch' },
  ctaLine: { borderWidth: 1, backgroundColor: 'transparent' },
  ctaText: { fontSize: FONT.body, fontWeight: '700', color: '#FFFFFF' },
  link: { fontSize: FONT.label, fontWeight: '700' },
  emptyBox: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACING.xl, gap: SPACING.md },
  emptyTitle: { fontSize: FONT.title, fontWeight: '700' },
  emptySub: { fontSize: FONT.body, textAlign: 'center' },
});
