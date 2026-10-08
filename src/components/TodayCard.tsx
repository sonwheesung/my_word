import React from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import { FONT, RADIUS, SPACING } from '../constants/design';
import { useTheme } from '../contexts/ThemeContext';
import ScoreRing from './ScoreRing';
import type { DailyActivity } from '../services/quizService';
import { formatLocalDate } from '../utils/date';

/**
 * 홈 맨 위의 **흰 카드** (2026-10-08 시안 #1).
 *
 * 🔴 보라 히어로가 하던 자리를 대신한다. 히어로는 **예뻤지만 아무것도 안 말했다** —
 *    이 카드는 한 자리에서 셋을 말한다: 오늘 얼마나 했나 · 며칠째인가 · 최근 일주일은 어땠나.
 *
 * ⚠ **오늘 목표는 저장하지 않는다.** `DAILY_GOAL` 상수 하나다. 사용자가 고르게 만들면
 *   "목표를 정하는 화면"이 하나 더 필요하고, 그건 단어를 외우러 온 사람에게 숙제를 하나 더 주는 것이다.
 *   바꿀 일이 생기면 그때 설정으로 꺼낸다.
 *
 * ⚠ **막대는 7칸으로 고정이다.** 활동이 없는 날도 빈 칸으로 그린다 — 칸이 줄면 "어제는 8칸이었는데"가 된다.
 */

/** 하루 목표 문제 수. ⚠ 저장하지 않는다(머리 주석) */
export const DAILY_GOAL = 10;
/** 막대 칸 수 */
const BAR_DAYS = 7;

interface TodayCardProps {
  streakDays: number;
  /** 마이 화면이 쓰는 그 목록. 홈이 이미 받아 오므로 새로 읽지 않는다 */
  activities: readonly DailyActivity[];
}

/**
 * 오늘부터 거꾸로 7일. **순수 함수다.**
 *
 * 🔴 `activities` 에 없는 날은 0 으로 채운다 — 있는 날만 그리면 **막대 사이가 좁아졌다 넓어졌다** 한다.
 * ⚠ 날짜는 `formatLocalDate`(로컬 기준)로 만든다. UTC 를 그대로 자르면 KST 오전 0~9시 활동이 전날로 간다
 *   (`quizService.date.test.ts` 가 지키는 바로 그 결함이다).
 */
export function lastSevenDays(
  activities: readonly DailyActivity[],
  now: Date = new Date(),
): Array<{ key: string; count: number; isToday: boolean }> {
  const byDate = new Map<string, number>();
  for (const a of activities) {
    byDate.set(a.date, (byDate.get(a.date) ?? 0) + a.wordCount + a.quizCount);
  }
  const todayKey = formatLocalDate(now);
  const out: Array<{ key: string; count: number; isToday: boolean }> = [];
  for (let i = BAR_DAYS - 1; i >= 0; i -= 1) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = formatLocalDate(d);
    out.push({ key, count: byDate.get(key) ?? 0, isToday: key === todayKey });
  }
  return out;
}

/** 오늘 푼 문제 수. **순수 함수다** */
export function todayQuizCount(
  activities: readonly DailyActivity[],
  now: Date = new Date(),
): number {
  const todayKey = formatLocalDate(now);
  let n = 0;
  for (const a of activities) if (a.date === todayKey) n += a.quizCount;
  return n;
}

export default function TodayCard({ streakDays, activities }: TodayCardProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();

  const done = todayQuizCount(activities);
  const days = lastSevenDays(activities);
  // 막대 높이의 기준. ⚠ 1 이 바닥이면 하루만 많이 한 날에 나머지가 다 사라진다
  const peak = Math.max(DAILY_GOAL, ...days.map((d) => d.count));

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.top}>
        <ScoreRing
          percent={Math.min(100, (done / DAILY_GOAL) * 100)}
          size={76}
          stroke={8}
          fontSize={FONT.body}
          label={`${done}/${DAILY_GOAL}`}
          // ⚠ 매일 보는 자리라 축하하지 않는다(ScoreRing 주석)
          celebrate={false}
        />
        <View style={styles.topTexts}>
          <Text style={[styles.streak, { color: colors.text }]} numberOfLines={1}>
            {streakDays > 0
              ? t('🔥 {{count}}일 연속', { count: streakDays })
              : t('오늘 첫 학습을 시작해 보세요')}
          </Text>
          <Text style={[styles.goal, { color: colors.textSecondary }]} numberOfLines={2}>
            {t('오늘 목표 {{goal}}문제 중 {{done}}문제', { goal: DAILY_GOAL, done })}
          </Text>
        </View>
      </View>

      {/* 최근 7일. 오늘이 맨 오른쪽이다 */}
      <View style={styles.bars}>
        {days.map((d) => (
          <View key={d.key} style={styles.barCol}>
            <View style={[styles.barTrack, { backgroundColor: colors.borderLight }]}>
              <View
                style={[
                  styles.barFill,
                  {
                    backgroundColor: d.isToday ? colors.primaryStrong : colors.primary,
                    // ⚠ 0 이어도 1% 는 남긴다 — 완전히 비면 "칸이 없는 날"로 보인다
                    height: `${Math.max(d.count === 0 ? 0 : 8, Math.round((d.count / peak) * 100))}%`,
                  },
                ]}
              />
            </View>
            <Text
              style={[
                styles.barLabel,
                { color: d.isToday ? colors.primaryStrong : colors.textTertiary },
                d.isToday && { fontWeight: '700' },
              ]}
              numberOfLines={1}
            >
              {d.isToday ? t('오늘') : t(WEEKDAYS[new Date(d.key).getDay()] ?? '')}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

/** ⚠ 번역 키다. 한 글자라도 로케일마다 다르다(일본어는 같고 영어는 S·M·T…) */
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: RADIUS.xl,
    padding: SPACING.lg,
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.lg,
  },
  top: { flexDirection: 'row', alignItems: 'center', gap: SPACING.lg },
  topTexts: { flex: 1 },
  streak: { fontSize: FONT.title, fontWeight: '800' },
  goal: { fontSize: FONT.label, marginTop: 4, lineHeight: 18 },
  bars: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.lg },
  barCol: { flex: 1, alignItems: 'center' },
  barTrack: {
    width: '100%',
    height: 42,
    borderRadius: RADIUS.sm,
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  barFill: { width: '100%', borderRadius: RADIUS.sm },
  barLabel: { fontSize: FONT.micro, marginTop: 4 },
});
