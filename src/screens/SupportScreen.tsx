import { useTranslation } from 'react-i18next';
import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { MaterialIcons } from '@expo/vector-icons';
import ScreenHeader from '../components/ScreenHeader';
import Toast from '../components/Toast';
import { useToast } from '../hooks/useToast';
import { useTheme } from '../contexts/ThemeContext';
import { supportService } from '../services/supportService';
import type { SupportCategory } from '../services/supportService';
import { SUPPORT_CONTENT_MAX, SUPPORT_CONTENT_MIN } from '../constants/appConfig';

interface SupportScreenProps {
  onBack: () => void;
}

const CATEGORIES: {
  key: SupportCategory;
  label: string;
  icon: React.ComponentProps<typeof MaterialIcons>['name'];
}[] = [
  { key: 'bug', label: '오류', icon: 'bug-report' },
  { key: 'suggestion', label: '건의', icon: 'lightbulb-outline' },
  { key: 'question', label: '질문', icon: 'help-outline' },
  { key: 'etc', label: '기타', icon: 'more-horiz' },
];

// 전송 실패 사유별 안내 — 사용자가 다음에 뭘 하면 되는지가 드러나게 적는다.
const FAIL_MESSAGE: Record<string, string> = {
  'not-configured': '지금은 문의를 받을 수 없습니다. 잠시 후 다시 시도해주세요',
  // 서버에 이 앱이 등록되지 않은 상태 — 사용자가 할 수 있는 일은 not-configured 와 같다.
  'not-found': '지금은 문의를 받을 수 없습니다. 잠시 후 다시 시도해주세요',
  offline: '연결이 원활하지 않습니다. 네트워크 확인 후 다시 시도해주세요',
  'rate-limited': '문의가 많아 잠시 제한되었습니다. 잠시 후 다시 시도해주세요',
  error: '전송에 실패했습니다. 잠시 후 다시 시도해주세요',
};

export default function SupportScreen({ onBack }: SupportScreenProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { toast, showToast, hideToast } = useToast();

  const [category, setCategory] = useState<SupportCategory>('bug');
  const [content, setContent] = useState('');
  const [sending, setSending] = useState(false);

  const trimmedLength = content.trim().length;
  const canSubmit = trimmedLength >= SUPPORT_CONTENT_MIN && !sending;

  const handleSubmit = useCallback(async () => {
    if (sending) return; // 중복 전송 방지
    if (trimmedLength < SUPPORT_CONTENT_MIN) {
      showToast(t('{{count}}자 이상 입력해주세요', { count: SUPPORT_CONTENT_MIN }), 'error');
      return;
    }

    setSending(true);
    try {
      const result = await supportService.sendInquiry(category, content);
      if (result.ok) {
        setContent('');
        showToast(t('문의가 접수되었습니다. 소중한 의견 감사합니다'), 'success');
      } else {
        showToast(t(FAIL_MESSAGE[result.reason] ?? FAIL_MESSAGE.error), 'error');
      }
    } catch {
      // supportService 는 throw 하지 않지만, 예기치 못한 경우에도 로딩에 갇히지 않게 막아둔다.
      showToast(t(FAIL_MESSAGE.error), 'error');
    } finally {
      setSending(false);
    }
  }, [category, content, sending, trimmedLength, showToast]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style={colors.isDark ? 'light' : 'dark'} />
      <ScreenHeader title={t('문의하기')} onBack={onBack} />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* 무엇이 전송되는지 먼저 밝힌다.
              ⚠ 이 릴리스에는 답변을 보는 화면이 없다. 귀속만 시작했을 뿐이므로
                 "답변을 받을 수 있다"고 쓰지 않는다 — 화면이 생기면 그때 문구를 바꾼다.

              🔴 **이 문구는 로그인 상태를 묻지 않는다. 일부러다**(2026-10-15).
                 전에는 *"이 기기에 만든 임의의 식별자로 접수됩니다"* 한 가지였는데,
                 2026-10-14 에 구글 로그인이 들어가면서 **로그인한 사람에게는 거짓**이 됐다 —
                 `sendInquiry` 는 세션을 실어 보내고 SDK 주석이 직접 *"로그인 상태면
                 본인 문의로 귀속된다"* 고 적고 있다. 그 계정에는 이메일이 붙어 있다.
                 ⚠ 상태를 읽어 문구를 갈라도 되지만, 그러면 **로그인 판정이 틀리는 순간
                   고지도 같이 틀린다**(`authService.current()` 는 콜드부팅 직후 비어 있다).
                   두 경우에 다 참인 한 문장이 낡지 않는다. */}
          <View style={[styles.notice, { backgroundColor: colors.primaryLight }]}>
            <MaterialIcons name="lock-outline" size={18} color={colors.primary} />
            <Text style={[styles.noticeText, { color: colors.textSecondary }]}>
              {t('로그인하셨으면 문의가 그 계정에, 로그인 전이면 이 기기에 만든 임의의 식별자에 붙습니다. 보내는 것은 문의 내용과 앱 버전·기기 종류입니다. 답변 확인 기능은 준비 중입니다.')}
            </Text>
          </View>

          <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('분류')}</Text>
          <View style={styles.categoryRow}>
            {CATEGORIES.map((item) => {
              const selected = category === item.key;
              return (
                <TouchableOpacity
                  key={item.key}
                  onPress={() => setCategory(item.key)}
                  disabled={sending}
                  activeOpacity={0.7}
                  style={[
                    styles.categoryChip,
                    {
                      backgroundColor: selected ? colors.primaryLight : colors.card,
                      borderColor: selected ? colors.primary : colors.border,
                    },
                  ]}
                >
                  <MaterialIcons
                    name={item.icon}
                    size={20}
                    color={selected ? colors.primary : colors.textTertiary}
                  />
                  <Text
                    style={[
                      styles.categoryText,
                      { color: selected ? colors.primary : colors.textSecondary },
                      selected && styles.categoryTextSelected,
                    ]}
                  >
                    {t(item.label)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('내용')}</Text>
          <TextInput
            style={[
              styles.input,
              { backgroundColor: colors.card, borderColor: colors.border, color: colors.text },
            ]}
            placeholder={t('불편한 점이나 바라는 점을 자유롭게 적어주세요')}
            placeholderTextColor={colors.textTertiary}
            value={content}
            onChangeText={setContent}
            multiline
            textAlignVertical="top"
            maxLength={SUPPORT_CONTENT_MAX}
            editable={!sending}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Text style={[styles.counter, { color: colors.textTertiary }]}>
            {content.length} / {SUPPORT_CONTENT_MAX}
          </Text>

          <TouchableOpacity
            onPress={handleSubmit}
            disabled={!canSubmit}
            activeOpacity={0.8}
            style={[
              styles.submitButton,
              { backgroundColor: colors.primary },
              !canSubmit && styles.submitButtonDisabled,
            ]}
          >
            {sending ? (
              <ActivityIndicator size="small" color={colors.textOnPrimary} />
            ) : (
              <Text style={[styles.submitText, { color: colors.textOnPrimary }]}>{t('보내기')}</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>

      <Toast
        visible={toast.visible}
        message={toast.message}
        type={toast.type}
        onHide={hideToast}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  notice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderRadius: 14,
    padding: 14,
    marginBottom: 24,
  },
  noticeText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  categoryRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 24,
  },
  categoryChip: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 12,
  },
  categoryText: {
    fontSize: 13,
  },
  categoryTextSelected: {
    fontWeight: '700',
  },
  input: {
    minHeight: 180,
    borderWidth: 1,
    borderRadius: 8,
    padding: 16,
    fontSize: 15,
    lineHeight: 22,
  },
  counter: {
    fontSize: 12,
    textAlign: 'right',
    marginTop: 6,
  },
  submitButton: {
    marginTop: 24,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  submitText: {
    fontSize: 16,
    fontWeight: '700',
  },
});
