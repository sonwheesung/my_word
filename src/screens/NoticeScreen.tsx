import { useTranslation } from 'react-i18next';
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { MaterialIcons } from '@expo/vector-icons';
import ScreenHeader from '../components/ScreenHeader';
import { useTheme } from '../contexts/ThemeContext';
import { useBootstrap } from '../contexts/BootstrapContext';

interface NoticeScreenProps {
  onBack: () => void;
}

// 서버가 정하는 값이라 앱이 모르는 종류가 올 수 있다 — 그때는 라벨을 붙이지 않는다.
const KIND_LABEL: Record<string, string> = {
  notice: '공지',
  event: '이벤트',
  update: '업데이트',
};

/** ISO 시각을 기기 시간대 기준 "YYYY. M. D." 로. 잘못된 값은 빈 문자열(날짜 줄을 감춘다). */
function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}. ${date.getMonth() + 1}. ${date.getDate()}.`;
}

/**
 * 공지사항 목록.
 *
 * 정렬은 서버가 이미 (고정 우선 → 최신순) 끝냈으므로 받은 순서를 그대로 쓴다.
 * body 는 서버에서 마크다운 원문으로 오지만, 렌더러를 들이지 않고 줄바꿈만 살려 그대로 보여준다
 * (공지 작성자가 관리자 콘솔에서 평문으로 쓰면 되는 일이라, 파서를 두는 편이 손해다).
 */
export default function NoticeScreen({ onBack }: NoticeScreenProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { announcements, readIds, loaded, markAllNoticesRead } = useBootstrap();

  // 입장 시점의 안읽음을 고정해 둔다 — 바로 읽음 처리하더라도 이번 방문에서는 NEW 가 유지된다.
  const [unreadSnapshot] = useState<Set<string>>(
    () => new Set(announcements.filter((a) => !readIds.includes(a.id)).map((a) => a.id)),
  );

  // 목록을 본 시점에 전체 읽음 처리(본문이 목록에 그대로 펼쳐지므로 "봤다"로 본다).
  // 조회가 늦게 끝나 이 화면이 먼저 열린 경우에도, 목록이 채워지면 다시 실행된다.
  useEffect(() => {
    markAllNoticesRead();
  }, [markAllNoticesRead]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style={colors.isDark ? 'light' : 'dark'} />
      <ScreenHeader title={t('공지사항')} onBack={onBack} />

      {!loaded ? (
        <View style={styles.centered}>
          <ActivityIndicator size="small" color={colors.primary} />
        </View>
      ) : announcements.length === 0 ? (
        <View style={styles.centered}>
          <MaterialIcons name="campaign" size={48} color={colors.textTertiary} />
          <Text style={[styles.emptyTitle, { color: colors.textSecondary }]}>
            등록된 공지사항이 없습니다
          </Text>
          <Text style={[styles.emptyBody, { color: colors.textTertiary }]}>
            새로운 소식이 있으면 이곳에 안내해드릴게요
          </Text>
        </View>
      ) : (
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
          {announcements.map((item) => {
            const kindLabel = KIND_LABEL[item.kind] ? t(KIND_LABEL[item.kind]) : undefined;
            const date = formatDate(item.startsAt);
            return (
              <View
                key={item.id}
                style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
              >
                <View style={styles.badgeRow}>
                  {item.pinned && (
                    <View style={[styles.badge, { backgroundColor: colors.primaryLight }]}>
                      <MaterialIcons name="push-pin" size={12} color={colors.primary} />
                      <Text style={[styles.badgeText, { color: colors.primary }]}>{t('고정')}</Text>
                    </View>
                  )}
                  {kindLabel && (
                    <View style={[styles.badge, { backgroundColor: colors.surface }]}>
                      <Text style={[styles.badgeText, { color: colors.textSecondary }]}>
                        {kindLabel}
                      </Text>
                    </View>
                  )}
                  {unreadSnapshot.has(item.id) && (
                    <View style={[styles.badge, { backgroundColor: colors.error }]}>
                      <Text style={[styles.badgeText, { color: '#FFFFFF' }]}>NEW</Text>
                    </View>
                  )}
                </View>

                <Text style={[styles.title, { color: colors.text }]}>{item.title}</Text>
                {date !== '' && (
                  <Text style={[styles.date, { color: colors.textTertiary }]}>{date}</Text>
                )}
                <Text style={[styles.body, { color: colors.textSecondary }]}>{item.body}</Text>
              </View>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: 8,
  },
  emptyBody: {
    fontSize: 13,
    textAlign: 'center',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
    gap: 12,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 10,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  title: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  date: {
    fontSize: 12,
    marginBottom: 10,
  },
  body: {
    fontSize: 14,
    lineHeight: 22,
  },
});
