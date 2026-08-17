import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { MaterialIcons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../contexts/ThemeContext';
import { useBootstrap } from '../contexts/BootstrapContext';
import { usePurchase } from '../contexts/PurchaseContext';
import { useToast } from '../hooks/useToast';
import Toast from '../components/Toast';
import { THEMES } from '../constants/themes';
import { APP_VERSION } from '../constants/appConfig';
import ScreenHeader from '../components/ScreenHeader';
import { changeAppLanguage } from '../i18n';
import { LANGUAGE_LABEL, SUPPORTED_LANGUAGES, getCurrentLanguage, type AppLanguage } from '../i18n/language';

interface SettingsScreenProps {
  onBack: () => void;
  onSupport: () => void;
  onNotices: () => void;
}

export default function SettingsScreen({ onBack, onSupport, onNotices }: SettingsScreenProps) {
  const { colors, themeId, setThemeId } = useTheme();
  const { unreadCount } = useBootstrap();
  const { t } = useTranslation();
  const [language, setLanguage] = useState<AppLanguage>(() => getCurrentLanguage());
  const { adFree, ready, price, busy, buy, restore } = usePurchase();
  const { toast, showToast, hideToast } = useToast();

  const handleLanguageChange = async (next: AppLanguage) => {
    if (next === language) return;
    setLanguage(next);
    await changeAppLanguage(next);
  };

  /*
   * ⚠ 성공 문구를 여기서 띄우지 않는다. 결제창을 닫는 것과 결제가 끝나는 것은 다른 사건이고,
   *   실제 지급은 PurchaseContext 의 구매 리스너가 한다. 여기서는 실패만 알린다.
   */
  const handleBuy = async () => {
    if (busy) return;
    const result = await buy();
    if (result.ok) return;
    if (result.reason === 'cancelled') return; // 사용자가 스스로 닫은 것은 알릴 일이 아니다
    if (result.reason === 'already-owned') {
      showToast(t('이미 구매한 상품이에요. 구매 복원을 눌러 주세요'), 'info');
      return;
    }
    if (result.reason === 'unavailable') {
      showToast(t('지금은 스토어에 연결할 수 없어요'), 'error');
      return;
    }
    showToast(t('구매를 마치지 못했어요. 잠시 후 다시 시도해 주세요'), 'error');
  };

  const handleRestore = async () => {
    if (busy) return;
    const result = await restore();
    if (result.ok) {
      showToast(t('광고 제거를 복원했어요'), 'success');
      return;
    }
    if (result.reason === 'unavailable') {
      showToast(t('복원할 구매 내역이 없어요'), 'info');
      return;
    }
    showToast(t('복원하지 못했어요. 잠시 후 다시 시도해 주세요'), 'error');
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style={colors.isDark ? 'light' : 'dark'} />
      <ScreenHeader title={t('설정')} onBack={onBack} />

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {/* 언어 선택 */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('언어')}</Text>
          <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.border, padding: 0 }]}>
            {SUPPORTED_LANGUAGES.map((code, index) => (
              <React.Fragment key={code}>
                {index > 0 && <View style={[styles.infoDivider, { backgroundColor: colors.borderLight, marginVertical: 0 }]} />}
                <TouchableOpacity
                  onPress={() => handleLanguageChange(code)}
                  activeOpacity={0.7}
                  style={styles.languageRow}
                >
                  {/* 각 언어를 그 언어로 적는다 — 자기 언어를 못 찾으면 의미가 없다 */}
                  <Text style={[styles.linkTitle, { color: colors.text }]}>{LANGUAGE_LABEL[code]}</Text>
                  {language === code && (
                    <MaterialIcons name="check" size={20} color={colors.primary} />
                  )}
                </TouchableOpacity>
              </React.Fragment>
            ))}
          </View>
        </View>

        {/* 테마 선택 */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('색상 테마')}</Text>
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
                    {t(theme.name)}
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
          <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('소식')}</Text>
          <TouchableOpacity
            onPress={onNotices}
            activeOpacity={0.7}
            style={[styles.linkRow, { backgroundColor: colors.card, borderColor: colors.border }]}
          >
            <View style={styles.linkLeft}>
              <MaterialIcons name="campaign" size={20} color={colors.primary} />
              <View>
                <Text style={[styles.linkTitle, { color: colors.text }]}>{t('공지사항')}</Text>
                <Text style={[styles.linkSubtitle, { color: colors.textTertiary }]}>
                  {t('업데이트와 새로운 소식을 확인하세요')}
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
          <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('고객 지원')}</Text>
          <TouchableOpacity
            onPress={onSupport}
            activeOpacity={0.7}
            style={[styles.linkRow, { backgroundColor: colors.card, borderColor: colors.border }]}
          >
            <View style={styles.linkLeft}>
              <MaterialIcons name="chat-bubble-outline" size={20} color={colors.primary} />
              <View>
                <Text style={[styles.linkTitle, { color: colors.text }]}>{t('문의하기')}</Text>
                <Text style={[styles.linkSubtitle, { color: colors.textTertiary }]}>
                  {t('익명으로 의견을 보낼 수 있어요')}
                </Text>
              </View>
            </View>
            <MaterialIcons name="chevron-right" size={22} color={colors.textTertiary} />
          </TouchableOpacity>
        </View>

        {/* 광고 */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('광고')}</Text>
          {adFree ? (
            <View
              style={[styles.linkRow, { backgroundColor: colors.card, borderColor: colors.border }]}
            >
              <View style={styles.linkLeft}>
                <MaterialIcons name="check-circle" size={20} color={colors.primary} />
                <View>
                  <Text style={[styles.linkTitle, { color: colors.text }]}>
                    {t('광고가 제거되었어요')}
                  </Text>
                  <Text style={[styles.linkSubtitle, { color: colors.textTertiary }]}>
                    {t('구매해 주셔서 고맙습니다')}
                  </Text>
                </View>
              </View>
            </View>
          ) : (
            <>
              <TouchableOpacity
                onPress={handleBuy}
                activeOpacity={0.7}
                disabled={busy || !ready}
                style={[
                  styles.linkRow,
                  {
                    backgroundColor: colors.card,
                    borderColor: colors.border,
                    opacity: busy || !ready ? 0.5 : 1,
                  },
                ]}
              >
                <View style={styles.linkLeft}>
                  <MaterialIcons name="block" size={20} color={colors.primary} />
                  <View>
                    <Text style={[styles.linkTitle, { color: colors.text }]}>
                      {t('광고 제거')}
                    </Text>
                    <Text style={[styles.linkSubtitle, { color: colors.textTertiary }]}>
                      {t('한 번만 결제하면 평생 광고가 없어요')}
                    </Text>
                  </View>
                </View>
                <View style={styles.linkRight}>
                  {busy ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : (
                    <>
                      {price !== null && (
                        <Text style={[styles.priceText, { color: colors.primary }]}>{price}</Text>
                      )}
                      <MaterialIcons name="chevron-right" size={22} color={colors.textTertiary} />
                    </>
                  )}
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleRestore}
                activeOpacity={0.7}
                disabled={busy || !ready}
                style={[styles.restoreRow, { opacity: busy || !ready ? 0.5 : 1 }]}
              >
                <Text style={[styles.restoreText, { color: colors.textSecondary }]}>
                  {t('구매 복원')}
                </Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        {/* 앱 정보 */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('앱 정보')}</Text>
          <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.infoRow}>
              <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>{t('버전')}</Text>
              <Text style={[styles.infoValue, { color: colors.text }]}>{APP_VERSION}</Text>
            </View>
            <View style={[styles.infoDivider, { backgroundColor: colors.borderLight }]} />
            <View style={styles.infoRow}>
              <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>{t('패키지')}</Text>
              <Text style={[styles.infoValue, { color: colors.text }]}>com.myword.front</Text>
            </View>
          </View>
        </View>
      </ScrollView>

      <Toast
        message={toast.message}
        type={toast.type}
        visible={toast.visible}
        onHide={hideToast}
      />
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
  priceText: {
    fontSize: 15,
    fontWeight: '600',
  },
  restoreRow: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  restoreText: {
    fontSize: 13,
    textDecorationLine: 'underline',
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
  languageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
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
