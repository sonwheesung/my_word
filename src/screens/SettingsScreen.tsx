import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';
import { useBootstrap } from '../contexts/BootstrapContext';
import { THEMES } from '../constants/themes';
import { APP_VERSION } from '../constants/appConfig';
import ScreenHeader from '../components/ScreenHeader';

interface SettingsScreenProps {
  onBack: () => void;
  onSupport: () => void;
  onNotices: () => void;
}

export default function SettingsScreen({ onBack, onSupport, onNotices }: SettingsScreenProps) {
  const { colors, themeId, setThemeId } = useTheme();
  const { unreadCount } = useBootstrap();

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style={colors.isDark ? 'light' : 'dark'} />
      <ScreenHeader title="설정" onBack={onBack} />

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {/* 테마 선택 */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>색상 테마</Text>
          <View style={styles.themeGrid}>
            {THEMES.map((theme) => {
              const isSelected = themeId === theme.id;
              return (
                <TouchableOpacity
                  key={theme.id}
                  style={[
                    styles.themeCard,
                    {
                      backgroundColor: theme.colors.card,
                      borderColor: isSelected ? theme.colors.primary : colors.border,
                      borderWidth: isSelected ? 2 : 1,
                    },
                  ]}
                  onPress={() => setThemeId(theme.id)}
                >
                  {/* 색상 미리보기 */}
                  <View style={styles.themePreview}>
                    <View
                      style={[
                        styles.previewBar,
                        { backgroundColor: theme.colors.primary, flex: 3 },
                      ]}
                    />
                    <View
                      style={[
                        styles.previewBar,
                        { backgroundColor: theme.colors.accent, flex: 2 },
                      ]}
                    />
                    <View
                      style={[
                        styles.previewBar,
                        { backgroundColor: theme.colors.background, flex: 1, borderWidth: 1, borderColor: '#E5E7EB' },
                      ]}
                    />
                  </View>
                  <Text
                    style={[
                      styles.themeName,
                      { color: theme.colors.text },
                      isSelected && { color: theme.colors.primary, fontWeight: 'bold' },
                    ]}
                  >
                    {theme.name}
                  </Text>
                  {isSelected && (
                    <View style={[styles.checkBadge, { backgroundColor: theme.colors.primary }]}>
                      <MaterialIcons name="check" size={14} color="#FFFFFF" />
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* 소식 */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>소식</Text>
          <TouchableOpacity
            onPress={onNotices}
            activeOpacity={0.7}
            style={[styles.linkRow, { backgroundColor: colors.card, borderColor: colors.border }]}
          >
            <View style={styles.linkLeft}>
              <MaterialIcons name="campaign" size={20} color={colors.primary} />
              <View>
                <Text style={[styles.linkTitle, { color: colors.text }]}>공지사항</Text>
                <Text style={[styles.linkSubtitle, { color: colors.textTertiary }]}>
                  업데이트와 새로운 소식을 확인하세요
                </Text>
              </View>
            </View>
            <View style={styles.linkRight}>
              {unreadCount > 0 && (
                <View style={[styles.countBadge, { backgroundColor: colors.error }]}>
                  <Text style={styles.countBadgeText}>{unreadCount}</Text>
                </View>
              )}
              <MaterialIcons name="chevron-right" size={22} color={colors.textTertiary} />
            </View>
          </TouchableOpacity>
        </View>

        {/* 고객 지원 */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>고객 지원</Text>
          <TouchableOpacity
            onPress={onSupport}
            activeOpacity={0.7}
            style={[styles.linkRow, { backgroundColor: colors.card, borderColor: colors.border }]}
          >
            <View style={styles.linkLeft}>
              <MaterialIcons name="chat-bubble-outline" size={20} color={colors.primary} />
              <View>
                <Text style={[styles.linkTitle, { color: colors.text }]}>문의하기</Text>
                <Text style={[styles.linkSubtitle, { color: colors.textTertiary }]}>
                  익명으로 의견을 보낼 수 있어요
                </Text>
              </View>
            </View>
            <MaterialIcons name="chevron-right" size={22} color={colors.textTertiary} />
          </TouchableOpacity>
        </View>

        {/* 앱 정보 */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>앱 정보</Text>
          <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.infoRow}>
              <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>버전</Text>
              <Text style={[styles.infoValue, { color: colors.text }]}>{APP_VERSION}</Text>
            </View>
            <View style={[styles.infoDivider, { backgroundColor: colors.borderLight }]} />
            <View style={styles.infoRow}>
              <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>패키지</Text>
              <Text style={[styles.infoValue, { color: colors.text }]}>com.myword.front</Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
  },
  section: {
    marginBottom: 28,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  themeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  themeCard: {
    width: '31%',
    borderRadius: 16,
    padding: 12,
    alignItems: 'center',
    position: 'relative',
  },
  themePreview: {
    flexDirection: 'row',
    width: '100%',
    height: 32,
    borderRadius: 6,
    overflow: 'hidden',
    marginBottom: 8,
    gap: 2,
  },
  previewBar: {
    borderRadius: 3,
  },
  themeName: {
    fontSize: 13,
    fontWeight: '500',
  },
  checkBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 16,
    borderWidth: 1,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  linkLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  linkRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  countBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  linkTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  linkSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  infoCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  infoLabel: {
    fontSize: 14,
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '500',
  },
  infoDivider: {
    height: 1,
    marginVertical: 10,
  },
});
