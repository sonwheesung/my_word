import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Animated,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { MaterialIcons } from '@expo/vector-icons';

import ScreenHeader from '../components/ScreenHeader';
import Toast from '../components/Toast';
import { FONT, RADIUS, SPACING } from '../constants/design';
import { PRIVACY_POLICY_URL, TERMS_OF_SERVICE_URL } from '../constants/appConfig';
import { usePurchase } from '../contexts/PurchaseContext';
import { useTheme } from '../contexts/ThemeContext';
import { useToast } from '../hooks/useToast';
import { subscriptionService, type SubPlan, type SubPlanKind } from '../services/subscriptionService';

/**
 * 구독 결제 화면 — 페이월 (시안 단어앱#20 · 2026-10-16 사장님 승인).
 *
 * 🔴 **돈을 받는 화면이라 지켜야 하는 것이 셋이다. 셋 다 법에서 온다.**
 *
 * ```
 * ① 결제 전에 가격 · 주기 · 자동 갱신 · 해지 방법을 버튼 **바로 아래** 둔다
 *    (Play 구독 정책 · 작은 글씨를 다른 화면에 숨기면 심사에서 걸린다)
 * ② 요금제를 **미리 골라 두지 않는다**
 *    전자상거래법 다크패턴 「특정 옵션 사전선택」(2025-02-14 개정 · 공정위 지침 2025-10-24)
 * ③ 가격을 **지어내지 않는다**
 *    Play 가 준 현지 가격만 쓴다. 못 받으면 비워 두고 [다시 시도]를 준다
 * ```
 *
 * 🚫 **「무제한」이라고 쓰지 않는다.** 하루 호출 한도 · 10분 쿨다운 · 월 예산은 구독자에게도
 *    남는다(`common_server/lib/ai-policy.ts`).
 *
 * 🔴 **그리고 「판수 제한 없이」도 쓰지 않는다**(2026-10-28 사장님 지적으로 바꿨다).
 *    말 자체는 맞다 — 하루 캡 20은 **판수가 아니라 「새 문제 만드는 호출」**을 세고, 막혀도
 *    시험은 **이미 본 문제로 채워** 나간다(`lib/ai-exam.ts`). 그런데 두 가지가 걸렸다:
 *    ① 아주 새 단어만으로 치는데 그날 한도에 닿아 있으면 **창고가 비어 한 판도 못 본다** —
 *       그 순간 「제한 없이 볼 수 있다」가 거짓이 된다.
 *    ② 무료 10판 벽을 겪어 본 사람만 알아듣는 말이라, 처음 보는 사람에게는 무엇이 풀리는지
 *       안 보인다.
 *    → **날마다 진짜로 리셋되는 것을 말한다: 「날마다 새 문제로」.** 한도에 닿아도 거짓이 아니다.
 *    ⚠ 숫자를 박지 않는다. 전부 새 문제면 하루 10판쯤이고 창고에 있으면 제한이 없어서,
 *      **참인 N 이 없다**(20은 호출 수다 — 그걸 판수로 적으면 새 거짓이 된다).
 *
 * 🔴 **결제가 끝나도 곧바로 구독자가 아니다.** Play → RevenueCat 웹훅 → 우리 서버까지
 *    몇 초가 걸린다. 그 사이를 실패로 보여 주면 **이미 돈을 낸 사람이 놀란다** —
 *    「확인 중」을 띄우고 `recheckPro(true)` 로 몇 번 다시 묻는다(시안 #23 이 이 안에 있다).
 */
interface PaywallScreenProps {
  onBack: () => void;
  /** 구독이 붙은 뒤 「시험 보러 가기」. 없으면 그냥 돌아간다 */
  onDone?: () => void;
}

/** 혜택 셋. 🔴 **스토어 혜택 칸 첫 줄과 글자 그대로 같아야 한다**(세 언어 모두) */
const PERKS = ['AI 시험을 날마다 새 문제로', '광고 없이', '지난 시험 다시 풀기는 해지해도 무료'];

/**
 * 결제 뒤 서버에 다시 묻는 간격과 횟수.
 *
 * ⚠ **앱이 포기해도 결제는 살아 있다.** 포기는 화면을 「오래 걸려요」로 바꾸는 것일 뿐,
 *   실패로 보여 주지 않는다. 그 뒤에는 [구매 복원]이 답이다.
 */
const RECHECK_EVERY_MS = 2500;
const RECHECK_TRIES = 6;

type Phase = 'choose' | 'buying' | 'checking' | 'done';

export default function PaywallScreen({ onBack, onDone }: PaywallScreenProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { toast, showToast, hideToast } = useToast();
  const { proActive, recheckPro, restore } = usePurchase();

  const [plans, setPlans] = useState<SubPlan[] | null>(null);
  /**
   * 🔴 **미리 고르지 않는다**(위 머리 주석 ②). 고르기 전에는 버튼이 흐리고
   *    「요금제를 골라 주세요」라고만 말한다.
   */
  const [plan, setPlan] = useState<SubPlanKind | null>(null);
  const [phase, setPhase] = useState<Phase>('choose');
  /** 버튼 **위** 한 줄. 🔴 토스트·빨간 오류로 띄우지 않는다 — 취소는 오류가 아니다 */
  const [note, setNote] = useState<string | null>(null);
  const [owned, setOwned] = useState(false);
  const [slow, setSlow] = useState(false);
  const [busy, setBusy] = useState(false);

  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const appear = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(appear, { toValue: 1, duration: 220, useNativeDriver: true }).start();
  }, [appear]);

  const loadPlans = useCallback(async () => {
    setBusy(true);
    const got = await subscriptionService.getPlans();
    if (!alive.current) return;
    setPlans(got);
    setBusy(false);
  }, []);

  useEffect(() => {
    void loadPlans();
  }, [loadPlans]);

  const yearly = plans?.find((p) => p.kind === 'yearly');
  const monthly = plans?.find((p) => p.kind === 'monthly');
  const priced = (plans?.length ?? 0) > 0;

  /**
   * 연간이 얼마나 싼가. 🔴 **두 가격의 숫자로 계산한다** — 「34%」를 글자로 박으면
   *    나라마다, 가격을 바꿀 때마다 거짓이 된다.
   */
  const savePercent =
    yearly !== undefined && monthly !== undefined && monthly.price > 0
      ? Math.round((1 - yearly.price / (monthly.price * 12)) * 100)
      : null;

  /** 🔴 서버가 pro 를 줄 때까지 몇 번 묻는다. `null`(못 물어봤다)은 **아니다가 아니다** */
  const waitForPro = useCallback(async () => {
    for (let i = 0; i < RECHECK_TRIES; i += 1) {
      const pro = await recheckPro(true);
      if (!alive.current) return;
      if (pro === true) {
        setPhase('done');
        return;
      }
      await new Promise<void>((r) => setTimeout(r, RECHECK_EVERY_MS));
      if (!alive.current) return;
    }
    // 🔴 포기해도 **실패로 보여 주지 않는다.** 돈은 이미 냈을 수 있다
    if (alive.current) setSlow(true);
  }, [recheckPro]);

  const buy = useCallback(async () => {
    if (plan === null || busy) return;
    setNote(null);
    setBusy(true);
    setPhase('buying');
    const r = await subscriptionService.purchase(plan);
    if (!alive.current) return;
    setBusy(false);

    if (r.ok || r.reason === 'already-owned') {
      // 🔴 이미 구독 중이면 **다시 결제시키지 않는다.** 확인만 한다
      setOwned(r.ok !== true);
      setPhase('checking');
      void waitForPro();
      return;
    }
    setPhase('choose');
    if (r.reason === 'cancelled') {
      // 🔴 **가장 흔한 길이다.** 오류로 보여 주지 않고, 고른 요금제도 그대로 둔다
      setNote(t('결제를 취소했어요. 고른 요금제는 그대로예요'));
    } else if (r.reason === 'not-allowed') {
      // 🚫 「다시 시도」로 안 풀린다 — error 와 섞지 않는다
      setNote(t('이 기기에서는 지금 결제할 수 없어요. 보호자 승인이나 기기 결제 설정을 확인해 주세요'));
    } else if (r.reason === 'unavailable') {
      setPlans([]);
    } else {
      // 🚫 「돈은 나가지 않았어요」라고 단정하지 않는다 — 확신할 때만 참이다
      setNote(t('결제를 마치지 못했어요. 결제가 됐다면 구매 복원을 눌러 주세요'));
    }
  }, [busy, plan, t, waitForPro]);

  const onRestore = useCallback(async () => {
    setBusy(true);
    /*
     * ⚠ **객체가 온다.** `if (await restore())` 로 쓰면 **늘 참**이라 실패해도 「찾았다」가 된다.
     *   타입 검사가 안 잡는 종류라 여기 적어 둔다(2026-10-16 만들면서 한 번 그렇게 썼다).
     * 🔴 그리고 **이 값으로 구독 여부를 판정하지 않는다** — 소유자 이전은 웹훅을 거치고,
     *    진실은 서버다. 성공이면 「확인 중」으로 넘겨 `recheckPro` 가 판정하게 한다.
     */
    const r = await restore();
    if (!alive.current) return;
    setBusy(false);
    if (r.ok) {
      setPhase('checking');
      setSlow(false);
      void waitForPro();
      return;
    }
    showToast(t('되살릴 구독을 찾지 못했어요'), 'info');
  }, [restore, showToast, t, waitForPro]);

  // ── 끝난 화면 ─────────────────────────────────────────────────────────────
  if (phase === 'checking' || phase === 'done') {
    const settled = phase === 'done';
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <StatusBar style={colors.isDark ? 'light' : 'dark'} />
        <ScreenHeader title={t('구독')} onBack={onBack} />
        <View style={styles.doneBox}>
          {settled ? (
            <View style={[styles.stamp, { backgroundColor: colors.successBg }]}>
              <MaterialIcons name="check" size={34} color={colors.successText} />
            </View>
          ) : (
            <ActivityIndicator size="large" color={colors.primary} />
          )}
          <Text style={[styles.doneTitle, { color: colors.text }]}>
            {settled
              ? owned
                ? t('구독이 확인됐어요')
                : t('구독을 시작했어요')
              : t('구독을 확인하고 있어요')}
          </Text>
          <Text style={[styles.doneSub, { color: colors.textSecondary }]}>
            {settled
              ? t('이제 날마다 새 문제로 시험을 볼 수 있어요')
              : t('결제는 끝났어요. 확인되면 저절로 열려요')}
          </Text>
          {owned && settled && (
            <Text style={[styles.doneMeta, { color: colors.textTertiary }]}>
              {t('이번에는 결제하지 않았어요')}
            </Text>
          )}
          {/* 🔴 오래 걸릴 때의 답은 [구매 복원]이다. **다시 결제하는 길은 두지 않는다** */}
          {!settled && slow && (
            <Text style={[styles.doneMeta, { color: colors.textTertiary }]}>
              {t('오래 걸리면 아래 구매 복원을 눌러 주세요')}
            </Text>
          )}
        </View>
        <View style={styles.bottom}>
          {settled ? (
            <TouchableOpacity
              style={[styles.cta, { backgroundColor: colors.primaryStrong }]}
              onPress={onDone ?? onBack}
              accessibilityRole="button"
            >
              <Text style={styles.ctaText}>{t('시험 보러 가기')}</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.cta, styles.ctaLine, { borderColor: colors.border }]}
              onPress={() => void onRestore()}
              disabled={busy}
              accessibilityRole="button"
            >
              {busy ? (
                <ActivityIndicator size="small" color={colors.primaryStrong} />
              ) : (
                <Text style={[styles.ctaText, { color: colors.primaryStrong }]}>
                  {t('구매 복원')}
                </Text>
              )}
            </TouchableOpacity>
          )}
        </View>
        <Toast message={toast.message} type={toast.type} visible={toast.visible} onHide={hideToast} />
      </View>
    );
  }

  // ── 고르는 화면 ───────────────────────────────────────────────────────────
  const card = (p: SubPlan | undefined, kind: SubPlanKind, name: string, per: string, sub: string) => {
    const on = plan === kind;
    return (
      <TouchableOpacity
        key={kind}
        disabled={!priced || busy}
        onPress={() => {
          setPlan(kind);
          setNote(null);
        }}
        accessibilityRole="radio"
        accessibilityState={{ selected: on }}
        style={[
          styles.planCard,
          {
            backgroundColor: on ? colors.primaryLight : colors.card,
            borderColor: on ? colors.primary : colors.border,
            borderWidth: on ? 2 : 1,
            opacity: priced ? 1 : 0.6,
          },
        ]}
      >
        <View style={styles.planLeft}>
          <View style={[styles.radio, { borderColor: on ? colors.primary : colors.border }]}>
            {on && <View style={[styles.radioDot, { backgroundColor: colors.primary }]} />}
          </View>
          <View>
            <Text style={[styles.planName, { color: colors.text }]}>{t(name)}</Text>
            {/* 🔴 가격을 못 받으면 **회색 자리로 비운다**(지어내지 않는다) */}
            {p === undefined ? (
              <View style={[styles.skeleton, { backgroundColor: colors.border }]} />
            ) : (
              <Text style={[styles.planSub, { color: colors.textSecondary }]}>{t(sub)}</Text>
            )}
          </View>
        </View>
        <View style={styles.planRight}>
          {p === undefined ? (
            <View style={[styles.skeletonWide, { backgroundColor: colors.border }]} />
          ) : (
            <Text style={[styles.planPrice, { color: colors.text }]}>
              {p.priceString}
              <Text style={[styles.planPer, { color: colors.textSecondary }]}> {t(per)}</Text>
            </Text>
          )}
          {kind === 'yearly' && savePercent !== null && savePercent > 0 && (
            <View style={[styles.save, { backgroundColor: colors.successBg }]}>
              <Text style={[styles.saveText, { color: colors.successText }]}>
                {t('{{n}}% 아껴요', { n: savePercent })}
              </Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style={colors.isDark ? 'light' : 'dark'} />
      <ScreenHeader title={t('구독')} onBack={onBack} />
      <Animated.View style={{ flex: 1, opacity: appear }}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <Text style={[styles.h1, { color: colors.text }]}>{t('구독하고 계속 시험 보기')}</Text>
          <View style={styles.perks}>
            {PERKS.map((p) => (
              <View key={p} style={styles.perkRow}>
                <MaterialIcons name="check" size={18} color={colors.successText} />
                <Text style={[styles.perk, { color: colors.text }]}>{t(p)}</Text>
              </View>
            ))}
          </View>

          <View style={styles.plans}>
            {card(yearly, 'yearly', '연간', '/ 년', '1년마다 결제')}
            {card(monthly, 'monthly', '월간', '/ 월', '매달 결제')}
          </View>

          {/* 🔴 가격을 못 받았을 때 — 가격 없이 결제받지 않는다 */}
          {plans !== null && !priced && (
            <View style={[styles.noPrice, { backgroundColor: colors.warningBg, borderColor: colors.warningBorder }]}>
              <Text style={[styles.noPriceTitle, { color: colors.warningText }]}>
                {t('지금은 가격을 불러오지 못했어요')}
              </Text>
              <Text style={[styles.noPriceBody, { color: colors.textSecondary }]}>
                {t('인터넷 연결을 확인하고 다시 시도해 주세요')}
              </Text>
            </View>
          )}
        </ScrollView>

        <View style={[styles.bottom, { borderTopColor: colors.border }]}>
          {note !== null && (
            <Text style={[styles.note, { color: colors.textSecondary }]}>{note}</Text>
          )}
          {plans !== null && !priced ? (
            <TouchableOpacity
              style={[styles.cta, styles.ctaLine, { borderColor: colors.border }]}
              onPress={() => void loadPlans()}
              disabled={busy}
              accessibilityRole="button"
            >
              {busy ? (
                <ActivityIndicator size="small" color={colors.primaryStrong} />
              ) : (
                <Text style={[styles.ctaText, { color: colors.primaryStrong }]}>{t('다시 시도')}</Text>
              )}
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[
                styles.cta,
                { backgroundColor: plan === null ? colors.border : colors.primaryStrong },
              ]}
              onPress={() => void buy()}
              disabled={plan === null || busy}
              accessibilityRole="button"
            >
              {busy ? (
                <ActivityIndicator size="small" color={colors.textOnPrimary} />
              ) : (
                <Text style={styles.ctaText}>
                  {/*
                    ⚠ **자리표시자 뒤에 조사를 붙이지 않는다**(`KOREAN_WRITING.md` §4.5).
                      「{{price}}으로」로 쓰면 나라마다 틀린다 — 「₩39,000으로」는 맞지만
                      「$2.99으로」는 틀리다. 주기를 **앞에** 두면 조사가 없어도 읽힌다.
                    🔴 버튼 글자에 **가격과 주기가 둘 다** 있어야 한다(Play 구독 정책).
                  */}
                  {plan === null
                    ? t('요금제를 골라 주세요')
                    : plan === 'yearly'
                      ? t('연 {{price}} 구독하기', { price: yearly?.priceString ?? '' })
                      : t('월 {{price}} 구독하기', { price: monthly?.priceString ?? '' })}
                </Text>
              )}
            </TouchableOpacity>
          )}

          {/*
            🔴 **고지는 버튼 바로 아래다**(머리 주석 ①). 다른 화면으로 숨기면 심사에서 걸린다.
            ⚠ 법으로 넣는 문장이라 **사실을 빼지 않는다**(`KOREAN_WRITING.md` §4.3) —
              자동 갱신된다는 것과 해지해도 기간 끝까지 쓴다는 것 **둘 다** 남아야 한다.
          */}
          <Text style={[styles.legal, { color: colors.textTertiary }]}>
            {plan === 'yearly'
              ? t('Play 에서 해지하실 때까지 매년 자동으로 갱신돼요. 해지해도 결제한 기간 끝까지 쓸 수 있어요')
              : plan === 'monthly'
                ? t('Play 에서 해지하실 때까지 매월 자동으로 갱신돼요. 해지해도 결제한 기간 끝까지 쓸 수 있어요')
                : t('Play 에서 해지하실 때까지 고른 기간마다 자동으로 갱신돼요. 해지해도 결제한 기간 끝까지 쓸 수 있어요')}
          </Text>

          <View style={styles.links}>
            <TouchableOpacity onPress={() => void onRestore()} accessibilityRole="button">
              <Text style={[styles.link, { color: colors.primaryStrong }]}>{t('구매 복원')}</Text>
            </TouchableOpacity>
            <Text style={[styles.linkSep, { color: colors.textTertiary }]}>·</Text>
            <TouchableOpacity
              onPress={() => void Linking.openURL(TERMS_OF_SERVICE_URL)}
              accessibilityRole="button"
            >
              <Text style={[styles.link, { color: colors.primaryStrong }]}>{t('이용약관')}</Text>
            </TouchableOpacity>
            <Text style={[styles.linkSep, { color: colors.textTertiary }]}>·</Text>
            <TouchableOpacity
              onPress={() => void Linking.openURL(PRIVACY_POLICY_URL)}
              accessibilityRole="button"
            >
              <Text style={[styles.link, { color: colors.primaryStrong }]}>
                {t('개인정보처리방침')}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Animated.View>
      <Toast message={toast.message} type={toast.type} visible={toast.visible} onHide={hideToast} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { padding: SPACING.lg, paddingBottom: SPACING.xl },
  h1: { fontSize: FONT.display, fontWeight: '700', marginBottom: SPACING.md },
  perks: { gap: SPACING.xs, marginBottom: SPACING.xl },
  perkRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  perk: { fontSize: FONT.body },
  plans: { gap: SPACING.sm },
  planCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: RADIUS.xl,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
  },
  planLeft: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  radioDot: { width: 10, height: 10, borderRadius: 5 },
  planName: { fontSize: FONT.body, fontWeight: '700' },
  planSub: { fontSize: FONT.caption, marginTop: 2 },
  planRight: { alignItems: 'flex-end', gap: 4 },
  planPrice: { fontSize: FONT.title, fontWeight: '700' },
  planPer: { fontSize: FONT.caption, fontWeight: '600' },
  save: { paddingHorizontal: SPACING.sm, paddingVertical: 2, borderRadius: RADIUS.pill },
  saveText: { fontSize: FONT.micro, fontWeight: '700' },
  skeleton: { width: 72, height: 11, borderRadius: 4, marginTop: 5 },
  skeletonWide: { width: 96, height: 18, borderRadius: 5 },
  noPrice: { borderWidth: 1, borderRadius: RADIUS.md, padding: SPACING.md, marginTop: SPACING.lg, gap: 4 },
  noPriceTitle: { fontSize: FONT.body, fontWeight: '700' },
  noPriceBody: { fontSize: FONT.label, lineHeight: 19 },
  bottom: { padding: SPACING.lg, borderTopWidth: StyleSheet.hairlineWidth, gap: SPACING.sm },
  note: { fontSize: FONT.label, textAlign: 'center' },
  cta: { height: 48, borderRadius: RADIUS.lg, alignItems: 'center', justifyContent: 'center' },
  ctaLine: { borderWidth: 1, backgroundColor: 'transparent' },
  ctaText: { fontSize: FONT.body, fontWeight: '700', color: '#FFFFFF' },
  legal: { fontSize: FONT.micro, lineHeight: 16, textAlign: 'center' },
  links: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: SPACING.xs },
  link: { fontSize: FONT.micro, fontWeight: '700' },
  linkSep: { fontSize: FONT.micro },
  doneBox: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACING.xl, gap: SPACING.sm },
  stamp: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
  doneTitle: { fontSize: FONT.title, fontWeight: '700', textAlign: 'center' },
  doneSub: { fontSize: FONT.body, textAlign: 'center', lineHeight: 21 },
  doneMeta: { fontSize: FONT.caption, textAlign: 'center' },
});
