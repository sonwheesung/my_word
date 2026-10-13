import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Linking,
  Switch,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { MaterialIcons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../contexts/ThemeContext';
import { useBootstrap } from '../contexts/BootstrapContext';
import { usePurchase } from '../contexts/PurchaseContext';
import { useNotification } from '../contexts/NotificationContext';
import { useToast } from '../hooks/useToast';
import Toast from '../components/Toast';
import { THEMES } from '../constants/themes';
import {
  APP_VERSION,
  PRIVACY_POLICY_URL,
  TERMS_OF_SERVICE_URL,
  OPEN_SOURCE_LICENSES_URL,
} from '../constants/appConfig';
import ScreenHeader from '../components/ScreenHeader';
import TimePickerSheet from '../components/TimePickerSheet';
import RestoreConfirmSheet from '../components/RestoreConfirmSheet';
import { backupFile } from '../services/backupFile';
import { backupService, type BackupFile, type BackupError, type BackupSummary } from '../services/backupService';
import { restoreService, RESTORE_READY, type RestoreFail } from '../services/restoreService';
import { syncService, EMPTY_STATE } from '../services/syncService';
import { authService, SIGNED_OUT, type AuthState, type SignInFail } from '../services/authService';
import { commonServer } from '../services/commonServer/client';
import ConfirmSheet from '../components/ConfirmSheet';
import type { SyncCounts } from '../services/commonServer/types';
import * as Updates from 'expo-updates';
import { formatTime, type TimeOfDay } from '../utils/notificationSchedule';
import { changeAppLanguage } from '../i18n';
import { LANGUAGE_LABEL, SUPPORTED_LANGUAGES, getCurrentLanguage, type AppLanguage } from '../i18n/language';

interface SettingsScreenProps {
  onBack: () => void;
  onSupport: () => void;
  onNotices: () => void;
}

/**
 * 설정 화면에 노출할 법적 고지 문서. 배열 순서가 곧 표시 순서다.
 *
 * 문서는 GitHub Pages 에 있고 서로 링크돼 있다(처리방침 제8항 ↔ 약관 제11조).
 * 그래서 하나만 걸면 사용자가 링크를 타고 나갔다 돌아올 길이 없다 — 셋 다 건다.
 */
const LEGAL_LINKS = [
  { key: 'privacy', title: '개인정보처리방침', icon: 'privacy-tip', url: PRIVACY_POLICY_URL },
  { key: 'terms', title: '이용약관', icon: 'gavel', url: TERMS_OF_SERVICE_URL },
  { key: 'licenses', title: '오픈소스 라이선스', icon: 'code', url: OPEN_SOURCE_LICENSES_URL },
] as const;

export default function SettingsScreen({ onBack, onSupport, onNotices }: SettingsScreenProps) {
  const { colors, themeId, setThemeId } = useTheme();
  const { unreadCount } = useBootstrap();
  const { t } = useTranslation();
  const [language, setLanguage] = useState<AppLanguage>(() => getCurrentLanguage());
  const { adFree, ready, price, busy, buy, restore } = usePurchase();
  const { toast, showToast, hideToast } = useToast();
  const notify = useNotification();
  const [showTimePicker, setShowTimePicker] = useState(false);
  const notifyBusyRef = useRef(false);
  const dataBusyRef = useRef(false);
  const [restoreCandidate, setRestoreCandidate] = useState<{ data: BackupFile; fileName: string } | null>(null);
  const [currentSummary, setCurrentSummary] = useState<BackupSummary | null>(null);
  const [restoreBusy, setRestoreBusy] = useState(false);
  /*
   * 서버 복구(2026-10-13 · `docs/SERVER_RESTORE_PLAN.md` D 단계).
   *
   * `null` 은 **아직 모른다**이고 `'off'` 는 **서버가 설정돼 있지 않다**이다. 둘을 같은 값으로
   * 두면 모르는 동안 줄이 깜빡이거나, 영원히 실패할 줄을 띄워 두게 된다.
   */
  const [serverCounts, setServerCounts] = useState<SyncCounts | 'off' | null>(null);
  const [serverCandidate, setServerCandidate] = useState<BackupFile | null>(null);
  const [serverBusy, setServerBusy] = useState(false);
  /*
   * 로그인(2026-10-13 · C 단계). 🔴 `null` 은 **아직 확인 중**이다 —
   * 「로그인 안 됨」과 같은 값으로 두면 콜드부팅 직후 로그인해 둔 사람에게
   * 「구글로 로그인」 줄이 잠깐 보였다가 사라진다.
   */
  const [auth, setAuth] = useState<AuthState | null>(null);
  const [authBusy, setAuthBusy] = useState(false);
  const [confirmErase, setConfirmErase] = useState(false);
  const [eraseBusy, setEraseBusy] = useState(false);

  /*
   * 서버가 들고 있는 개수를 한 번 묻는다 — 줄의 부제가 그 값이다(설계서 §7).
   *
   * ⚠ **실패를 화면에 띄우지 않는다.** 인터넷이 없을 때 설정 화면에 빨간 줄이 뜨면
   *   사용자는 앱이 고장 난 줄 안다. 못 물어봤으면 부제가 일반 문구로 남는다.
   */
  /*
   * 계정 상태. 🔴 **여기서만 묻는다** — 계정 줄이 이 화면에만 있고, 부팅마다 요청을 하나
   *   더할 이유가 없다. 오프라인이면 기기에 들고 있는 값으로 답한다(로그아웃시키지 않는다).
   */
  useEffect(() => {
    if (!authService.isAvailable()) {
      setAuth(SIGNED_OUT);
      return;
    }
    let alive = true;
    void authService.refresh().then((next) => {
      if (alive) setAuth(next);
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    void restoreService.serverCounts().then((res) => {
      if (!alive) return;
      if (res.ok) setServerCounts(res.counts);
      else if (res.reason === 'not-configured') setServerCounts('off');
    });
    return () => {
      alive = false;
    };
  }, []);

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

  /*
   * 법적 고지 문서 열기.
   *
   * ⚠ 현재 앱 언어를 `?lang=` 으로 넘긴다. 문서는 한/영을 한 파일에 담고 이 값으로 고른다.
   *   넘기지 않으면 브라우저 언어를 따라가서, 한국어로 앱을 쓰는 사람에게 영문 약관이
   *   뜰 수 있다 — 읽을 수 없는 문서를 준 것과 같다.
   *
   * 브라우저가 없거나 열기에 실패해도 앱이 죽지 않도록 감싼다.
   */
  /** 검사에서 걸린 이유를 사용자 말로 옮긴다. 이유마다 할 수 있는 일이 다르다 */
  const describeBackupError = (reason: BackupError): string => {
    switch (reason) {
      case 'newer-schema':
        // 유일하게 사용자가 고칠 수 있는 경우 — 앱을 올리면 읽을 수 있다
        return t('더 새로운 버전에서 만든 백업이에요. 앱을 업데이트해 주세요');
      case 'corrupt':
        return t('백업 파일이 손상됐어요');
      default:
        return t('My Word 백업 파일이 아니에요');
    }
  };

  /** 복구가 걸린 이유를 사용자 말로 옮긴다. 이유마다 할 수 있는 일이 다르다 */
  const describeRestoreFail = (reason: RestoreFail): string => {
    switch (reason) {
      case 'offline':
        return t('인터넷에 연결한 뒤 다시 시도해 주세요');
      case 'empty':
        // 실패가 아니다 — 아직 아무것도 안 올라간 상태다
        return t('서버에 복구할 내용이 아직 없어요');
      case 'not-configured':
        return t('지금은 서버 복구를 쓸 수 없어요');
      default:
        return t('복구하지 못했어요. 잠시 후 다시 시도해 주세요');
    }
  };

  /** 줄의 부제. 🔴 0인 종류는 아예 안 적는다 — "퀴즈 기록 0개"는 알려 주는 말이 아니다 */
  const serverSubtitle = (): string => {
    if (serverCounts === null || serverCounts === 'off') {
      return t('폰을 잃어도 서버에 남은 기록으로 되돌려요');
    }
    const parts: string[] = [];
    if (serverCounts.words > 0) parts.push(t('단어 {{n}}개', { n: serverCounts.words }));
    if (serverCounts.categories > 0) parts.push(t('카테고리 {{n}}개', { n: serverCounts.categories }));
    if (serverCounts.results > 0) parts.push(t('퀴즈 기록 {{n}}개', { n: serverCounts.results }));
    if (serverCounts.exams > 0) parts.push(t('AI 시험 {{n}}회', { n: serverCounts.exams }));
    if (parts.length === 0) return t('서버에 아직 보관된 것이 없어요');
    return t('서버에 {{what}} 보관 중', { what: parts.join(' · ') });
  };

  /**
   * 서버에서 전부 받아 온 뒤 확인을 받는다.
   *
   * 🔴 **받기를 먼저 하고 묻는다.** 받는 중에 실패하면 기기를 아직 안 건드린 채 물러날 수
   *    있고, 다 받은 뒤라야 "몇 개를 가져올지"를 정확한 숫자로 말할 수 있다.
   */
  const handleServerRestore = async () => {
    if (dataBusyRef.current) return;
    dataBusyRef.current = true;
    setServerBusy(true);
    try {
      const got = await restoreService.fetchAll();
      if (!got.ok) {
        showToast(describeRestoreFail(got.reason), got.reason === 'empty' ? 'info' : 'error');
        return;
      }
      setServerCounts(got.counts);

      const current = backupService.summarize(await backupService.create());

      /*
       * 🔴 **서버에 없는 종류가 기기에는 있으면 물러난다.** 그대로 덮으면 복구가 아니라
       *    삭제다 — 2026-10-13 에 실물에서 그 상태를 봤다(서버에 단어만 10줄).
       *    `RESTORE_READY` 가 평소에 막지만, 한 종류의 밀기가 실패해 있어도 같은 일이
       *    벌어진다. **줄을 가리는 것과 별개로 누르는 순간 다시 센다.**
       */
      if (
        (current.categories > 0 && got.counts.categories === 0) ||
        (current.quizResults > 0 && got.counts.results === 0)
      ) {
        showToast(t('서버에 아직 일부만 올라가 있어서 지금 복구하면 기록이 사라져요'), 'error');
        return;
      }
      // 🔴 잃을 것이 없으면 묻지 않는다 — 백업 복원과 같은 규칙이다(설계서 §7)
      if (current.words === 0 && current.categories === 0 && current.quizResults === 0) {
        await runRestore(got.backup);
        return;
      }
      setCurrentSummary(current);
      setServerCandidate(got.backup);
    } finally {
      dataBusyRef.current = false;
      setServerBusy(false);
    }
  };

  /**
   * 서버에 보관된 사본을 지운다 — **기기는 건드리지 않는다.**
   *
   * 🔴 **게시된 처리방침이 약속한 길이다.** 제5-3항이 *"기기 식별자를 삭제하시면 서버에
   *    보관된 학습 데이터도 함께 삭제됩니다"* 라고 적는데, 앱을 지우는 것만으로는 **기기
   *    안의 식별자만** 사라지고 서버의 줄은 남는다. 그 약속을 실제로 지키는 자리가 여기다.
   *    (Google Play 가 로그인 앱에 요구하는 「앱 안의 계정 삭제」와 같은 경로이기도 하다)
   *
   * 🔴 **장부를 반드시 함께 비운다.** 안 비우면 다음 밀기가 *"이미 다 올렸다"* 로 믿고
   *    아무것도 안 보내, 새 식별자의 서버가 **영원히 비어 있게 된다.** 되감기가 저절로
   *    잡아 주기는 하지만 저절로 되는 것에 기대지 않는다.
   */
  const handleEraseServer = async () => {
    if (eraseBusy) return;
    setEraseBusy(true);
    try {
      const res = await commonServer.deleteAccount();
      if (!res.ok) {
        showToast(
          res.reason === 'offline'
            ? t('인터넷에 연결한 뒤 다시 시도해 주세요')
            : t('지우지 못했어요. 잠시 후 다시 시도해 주세요'),
          'error',
        );
        return;
      }
      await syncService.saveState(EMPTY_STATE);
      /*
       * 🔴 탈퇴는 **그 주체를 가명화**한다. 구글로 들어와 있었다면 권한까지 회수하고 기기
       *    세션을 되살려야, 화면이 「로그인됨」으로 남아 있지 않고 다음 밀기도 떠돌지 않는다.
       */
      await authService.afterServerErased();
      setAuth(SIGNED_OUT);
      setServerCounts({ words: 0, categories: 0, results: 0, exams: 0 });
      showToast(t('서버에 보관된 내용을 지웠어요'), 'success');
    } catch {
      showToast(t('지우지 못했어요. 잠시 후 다시 시도해 주세요'), 'error');
    } finally {
      setEraseBusy(false);
      setConfirmErase(false);
    }
  };

  /** 로그인 실패를 사용자 말로. 🔴 취소는 아무 말도 하지 않는다 — 스스로 닫은 것이다 */
  const describeSignInFail = (fail: SignInFail): string | null => {
    switch (fail.kind) {
      case 'cancelled':
        return null;
      case 'unavailable':
        return t('이 버전에서는 로그인을 쓸 수 없어요');
      case 'google':
        /*
         * 🔴 구글이 준 코드를 그대로 붙인다. `DEVELOPER_ERROR` 는 **우리 설정 문제**이고
         *    (서명 지문·패키지 이름), 그 글자가 보여야 원인을 찾을 수 있다.
         */
        return fail.code === undefined
          ? t('구글 로그인에 실패했어요')
          : t('구글 로그인에 실패했어요 ({{code}})', { code: fail.code });
      default:
        return fail.reason === 'offline'
          ? t('인터넷에 연결한 뒤 다시 시도해 주세요')
          : t('로그인하지 못했어요. 잠시 후 다시 시도해 주세요');
    }
  };

  const handleSignIn = async () => {
    if (authBusy) return;
    setAuthBusy(true);
    try {
      const fail = await authService.signIn();
      if (fail !== null) {
        const message = describeSignInFail(fail);
        if (message !== null) showToast(message, 'error');
        return;
      }
      const next = await authService.refresh();
      setAuth(next);
      showToast(t('로그인했어요. 이 기기의 학습 내용을 계정으로 올리고 있어요'), 'success');
    } catch {
      showToast(t('로그인하지 못했어요. 잠시 후 다시 시도해 주세요'), 'error');
    } finally {
      setAuthBusy(false);
    }
  };

  const handleSignOut = async () => {
    if (authBusy) return;
    setAuthBusy(true);
    try {
      await authService.signOut();
      setAuth(SIGNED_OUT);
      showToast(t('로그아웃했어요. 이 기기의 단어와 기록은 그대로예요'), 'info');
    } finally {
      setAuthBusy(false);
    }
  };

  const handleExportBackup = async () => {
    if (dataBusyRef.current) return;
    dataBusyRef.current = true;
    try {
      const result = await backupFile.exportToFile();
      if (result.status === 'shared') {
        showToast(t('백업 파일을 만들었어요'), 'success');
      } else if (result.status === 'unsupported') {
        showToast(t('이 기기에서는 파일 공유를 쓸 수 없어요'), 'info');
      }
      // 'error' 에는 사용자가 공유 시트를 그냥 닫은 경우도 섞인다 — 조용히 끝낸다
    } finally {
      dataBusyRef.current = false;
    }
  };

  /** 파일을 고르고 검사까지 한다. 복원은 확인을 받은 뒤에 한다 */
  const handlePickBackup = async () => {
    if (dataBusyRef.current) return;
    dataBusyRef.current = true;
    try {
      const picked = await backupFile.pickAndParse();
      if (picked.status === 'canceled') return;
      if (picked.status === 'invalid') {
        showToast(describeBackupError(picked.reason), 'error');
        return;
      }
      if (picked.status !== 'picked') {
        showToast(t('파일을 읽지 못했어요'), 'error');
        return;
      }

      const current = backupService.summarize(await backupService.create());
      // 🔴 잃을 것이 없으면 묻지 않는다(새 기기·초기화 직후). 확인 화면은 "무엇을 잃는지"를
      //    보여 주려고 있는 것이라, 잃을 게 없는데 띄우면 방해일 뿐이다.
      if (current.words === 0 && current.categories === 0 && current.quizResults === 0) {
        await runRestore(picked.data);
        return;
      }
      setCurrentSummary(current);
      setRestoreCandidate({ data: picked.data, fileName: picked.fileName });
    } finally {
      dataBusyRef.current = false;
    }
  };

  const runRestore = async (data: BackupFile) => {
    setRestoreBusy(true);
    try {
      // 🔴 되돌릴 수 없는 작업 직전의 유일한 방어선. 실패해도 복원 자체는 막지 않는다.
      await backupFile.writeSafetyCopy();
      await backupService.restore(data);

      // 저장소가 통째로 바뀌었으므로 화면·컨텍스트가 들고 있는 값이 전부 낡았다.
      // 번들을 다시 올려 모두가 저장소를 새로 읽게 한다.
      try {
        await Updates.reloadAsync();
      } catch {
        // 개발 클라이언트 등 다시 시작이 안 되는 환경 — 사용자에게 맡긴다
        showToast(t('복원했어요. 앱을 다시 실행해 주세요'), 'success');
      }
    } catch {
      showToast(t('복원하지 못했어요'), 'error');
    } finally {
      setRestoreBusy(false);
      // 🔴 두 통로(백업 파일 · 서버)가 같은 마무리를 쓴다. 한쪽만 지우면 시트가 남는다
      setRestoreCandidate(null);
      setServerCandidate(null);
    }
  };

  /**
   * 알림 토글.
   *
   * 켤 때만 권한을 묻는다 — 사용자가 스스로 켠 순간이라 맥락이 있고, 거절률이 가장 낮다.
   * 거절당하면 토글을 켜지 않는다. 켠 척해 두면 알림이 왜 안 오는지 알 길이 없다.
   */
  const handleToggleNotify = async (next: boolean) => {
    // 스위치를 빠르게 여러 번 누르면 권한 대화상자가 겹쳐 뜬다
    if (notifyBusyRef.current) return;
    notifyBusyRef.current = true;
    try {
      const applied = await notify.setEnabled(next);
      if (next && !applied) {
        // 안드로이드는 한 번 거절당하면 앱이 다시 묻지 못한다 — 시스템 설정으로 보내는 수밖에 없다
        showToast(t('기기 설정에서 알림을 허용해 주세요'), 'info');
      }
    } catch {
      showToast(t('알림 설정을 바꾸지 못했어요'), 'error');
    } finally {
      notifyBusyRef.current = false;
    }
  };

  const handleConfirmTime = async (next: TimeOfDay) => {
    setShowTimePicker(false);
    try {
      await notify.setTime(next);
    } catch {
      showToast(t('알림 시각을 저장하지 못했어요'), 'error');
    }
  };

  const openingLegalRef = useRef(false);

  const openLegalDocument = async (url: string) => {
    if (openingLegalRef.current) return; // 연속 탭으로 브라우저가 여러 번 뜨는 것을 막는다
    openingLegalRef.current = true;
    try {
      await Linking.openURL(`${url}?lang=${language}`);
    } catch (error) {
      showToast(t('문서를 열지 못했어요. 잠시 후 다시 시도해 주세요'), 'error');
    } finally {
      openingLegalRef.current = false;
    }
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
                  style={styles.cardRow}
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

        {/* 학습 알림 — 웹에는 이 기능이 없어 섹션째 감춘다 */}
        {notify.supported && (
          <View style={styles.section}>
            {/* 🔴 제목을 t('알림') 로 쓰면 안 된다 — 그 키는 이미 퀴즈 화면의 Alert 제목이라
                영어가 "Notice" 로 나온다. 키가 곧 한국어 원문이라 한 단어를 두 뜻으로 못 쓴다 */}
            <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('학습 알림')}</Text>
            <View style={[styles.notifyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.notifyRow}>
                <View style={styles.notifyLabel}>
                  <Text style={[styles.linkTitle, { color: colors.text }]}>{t('알림 받기')}</Text>
                  <Text style={[styles.linkSubtitle, { color: colors.textTertiary }]}>
                    {t('하루 동안 앱을 열지 않으면 알려 드려요')}
                  </Text>
                </View>
                <Switch
                  value={notify.enabled}
                  onValueChange={handleToggleNotify}
                  disabled={!notify.loaded}
                  trackColor={{ false: colors.border, true: colors.primaryLight }}
                  thumbColor={notify.enabled ? colors.primary : colors.textTertiary}
                  accessibilityLabel={t('알림 받기')}
                />
              </View>

              {/* 시각은 켜져 있을 때만 보인다 — 꺼 둔 채로 시각을 고르게 하면 알림이 온다고 오해한다 */}
              {notify.enabled && (
                <TouchableOpacity
                  onPress={() => setShowTimePicker(true)}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  style={[styles.notifyTimeRow, { borderTopColor: colors.borderLight }]}
                >
                  <Text style={[styles.linkTitle, { color: colors.text }]}>{t('알림 시각')}</Text>
                  <View style={styles.linkRight}>
                    <Text style={[styles.priceText, { color: colors.primaryStrong }]}>
                      {formatTime(notify.time)}
                    </Text>
                    <MaterialIcons name="chevron-right" size={22} color={colors.textTertiary} />
                  </View>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}

        {/*
          * 계정 — 🔴 이 빌드에 구글 로그인이 없으면(Expo Go · 웹) **절 자체를 안 그린다.**
          *   눌러도 「쓸 수 없어요」만 나오는 줄을 두는 것은 알려 주는 일이 아니다.
          */}
        {authService.isAvailable() && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('계정')}</Text>
            <View style={[styles.notifyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              {auth === null ? (
                /* 🔴 확인 중. 「로그인 안 됨」으로 그리면 로그인해 둔 사람에게 깜빡인다 */
                <View style={styles.notifyRow}>
                  <View style={styles.notifyLabel}>
                    <Text style={[styles.linkSubtitle, { color: colors.textTertiary }]}>
                      {t('확인 중…')}
                    </Text>
                  </View>
                  <ActivityIndicator size="small" color={colors.primary} />
                </View>
              ) : auth.signedIn ? (
                <>
                  <View style={styles.notifyRow}>
                    <View style={styles.notifyLabel}>
                      <Text style={[styles.linkTitle, { color: colors.text }]}>
                        {t('구글 계정으로 로그인됨')}
                      </Text>
                      <Text
                        style={[styles.linkSubtitle, { color: colors.textTertiary }]}
                        numberOfLines={1}
                      >
                        {auth.email ?? t('이 계정으로 학습 내용이 보관돼요')}
                      </Text>
                    </View>
                    <MaterialIcons name="verified-user" size={22} color={colors.primary} />
                  </View>
                  <TouchableOpacity
                    onPress={() => void handleSignOut()}
                    disabled={authBusy}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    style={[styles.notifyTimeRow, { borderTopColor: colors.borderLight }]}
                  >
                    <View style={styles.notifyLabel}>
                      <Text style={[styles.linkTitle, { color: colors.text }]}>{t('로그아웃')}</Text>
                      <Text style={[styles.linkSubtitle, { color: colors.textTertiary }]}>
                        {t('이 기기의 단어와 기록은 지워지지 않아요')}
                      </Text>
                    </View>
                    {authBusy ? (
                      <ActivityIndicator size="small" color={colors.primary} />
                    ) : (
                      <MaterialIcons name="logout" size={22} color={colors.textTertiary} />
                    )}
                  </TouchableOpacity>
                </>
              ) : (
                <TouchableOpacity
                  onPress={() => void handleSignIn()}
                  disabled={authBusy}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  style={styles.notifyRow}
                >
                  <View style={styles.notifyLabel}>
                    <Text style={[styles.linkTitle, { color: colors.text }]}>
                      {t('구글로 로그인')}
                    </Text>
                    <Text style={[styles.linkSubtitle, { color: colors.textTertiary }]}>
                      {t('폰을 바꾸거나 잃어버려도 학습 내용을 돌려받을 수 있어요')}
                    </Text>
                  </View>
                  {authBusy ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : (
                    <MaterialIcons name="login" size={22} color={colors.primary} />
                  )}
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}

        {/* 데이터 — 웹에는 파일 공유·문서 선택기가 없어 섹션째 감춘다 */}
        {backupFile.isSupported() && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('데이터')}</Text>
            <View style={[styles.notifyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <TouchableOpacity
                onPress={handleExportBackup}
                activeOpacity={0.7}
                accessibilityRole="button"
                style={styles.notifyRow}
              >
                <View style={styles.notifyLabel}>
                  <Text style={[styles.linkTitle, { color: colors.text }]}>{t('백업 파일 만들기')}</Text>
                  <Text style={[styles.linkSubtitle, { color: colors.textTertiary }]}>
                    {t('단어 · 카테고리 · 퀴즈 기록을 파일 하나로 저장해요')}
                  </Text>
                </View>
                <MaterialIcons name="save-alt" size={22} color={colors.primary} />
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handlePickBackup}
                activeOpacity={0.7}
                accessibilityRole="button"
                style={[styles.notifyTimeRow, { borderTopColor: colors.borderLight }]}
              >
                <View style={styles.notifyLabel}>
                  <Text style={[styles.linkTitle, { color: colors.text }]}>{t('백업에서 복원')}</Text>
                  <Text style={[styles.linkSubtitle, { color: colors.textTertiary }]}>
                    {t('지금 기기의 데이터를 백업 시점으로 되돌려요')}
                  </Text>
                </View>
                <MaterialIcons name="settings-backup-restore" size={22} color={colors.primary} />
              </TouchableOpacity>

              {/*
                * 서버에서 복구 — 서버가 아예 설정돼 있지 않으면 줄을 띄우지 않는다.
                * 눌러도 영원히 같은 실패가 나는 줄을 두는 것은 알려 주는 일이 아니다.
                */}
              {serverCounts === 'off' || !RESTORE_READY ? null : (
                <TouchableOpacity
                  onPress={handleServerRestore}
                  disabled={serverBusy}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  style={[styles.notifyTimeRow, { borderTopColor: colors.borderLight }]}
                >
                  <View style={styles.notifyLabel}>
                    <Text style={[styles.linkTitle, { color: colors.text }]}>
                      {t('서버에서 복구')}
                    </Text>
                    <Text style={[styles.linkSubtitle, { color: colors.textTertiary }]}>
                      {serverSubtitle()}
                    </Text>
                  </View>
                  {serverBusy ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : (
                    <MaterialIcons name="cloud-download" size={22} color={colors.primary} />
                  )}
                </TouchableOpacity>
              )}

              {serverCounts === 'off' ? null : (
                <TouchableOpacity
                  onPress={() => setConfirmErase(true)}
                  disabled={eraseBusy}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  style={[styles.notifyTimeRow, { borderTopColor: colors.borderLight }]}
                >
                  <View style={styles.notifyLabel}>
                    <Text style={[styles.linkTitle, { color: colors.error }]}>
                      {t('서버에 보관된 내용 지우기')}
                    </Text>
                    <Text style={[styles.linkSubtitle, { color: colors.textTertiary }]}>
                      {t('서버의 사본만 지워요. 이 기기의 단어와 기록은 그대로 남아요')}
                    </Text>
                  </View>
                  {eraseBusy ? (
                    <ActivityIndicator size="small" color={colors.error} />
                  ) : (
                    <MaterialIcons name="delete-forever" size={22} color={colors.error} />
                  )}
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}

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
                  {t('앱 개선 의견을 보낼 수 있어요')}
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

        {/* 법적 고지 */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('법적 고지')}</Text>
          <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.border, padding: 0 }]}>
            {LEGAL_LINKS.map((link, index) => (
              <React.Fragment key={link.key}>
                {index > 0 && (
                  <View style={[styles.infoDivider, { backgroundColor: colors.borderLight, marginVertical: 0 }]} />
                )}
                <TouchableOpacity
                  onPress={() => openLegalDocument(link.url)}
                  activeOpacity={0.7}
                  style={styles.cardRow}
                >
                  <View style={styles.linkLeft}>
                    <MaterialIcons name={link.icon} size={20} color={colors.primary} />
                    <Text style={[styles.linkTitle, { color: colors.text }]}>{t(link.title)}</Text>
                  </View>
                  <MaterialIcons name="open-in-new" size={18} color={colors.textTertiary} />
                </TouchableOpacity>
              </React.Fragment>
            ))}
          </View>
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

      {/*
        * 🔴 되돌릴 수 없다. `Alert.alert` 가 아니라 앱 화풍의 시트로 묻고, 무엇을
        *   **잃는지**(지난 문의와의 연결)까지 적는다 — 그건 누른 뒤에는 되살릴 수 없다.
        */}
      <ConfirmSheet
        visible={confirmErase}
        title={t('서버에 보관된 내용을 지울까요?')}
        message={t(
          '단어 · 단어장 · 퀴즈 기록 · AI 시험 성적표의 서버 사본이 지워져요. 이 기기의 내용은 그대로 남지만, 폰을 잃으셨을 때 돌려받을 수 없게 됩니다. 지난 문의와의 연결도 끊겨서 그 문의에 대한 답변을 더는 확인하실 수 없어요. 계속 쓰시면 새 식별자로 처음부터 다시 보관됩니다',
        )}
        confirmLabel={t('지우기')}
        tone="danger"
        busy={eraseBusy}
        onConfirm={() => void handleEraseServer()}
        onCancel={() => setConfirmErase(false)}
      />

      {/*
        * 🔴 서버 복구는 **예문·태그·메모를 못 되돌린다** — 밀기가 그 셋을 안 보낸다
        *   (처리방침이 "전송되지 않습니다"라고 적는다). 되돌릴 수 없는 버튼 바로 위에서
        *   말해 주지 않으면, 사용자는 누른 뒤에야 안다.
        */}
      <RestoreConfirmSheet
        visible={serverCandidate !== null}
        current={currentSummary}
        incoming={serverCandidate ? backupService.summarize(serverCandidate) : null}
        fileName=""
        busy={restoreBusy}
        title={t('서버에서 복구')}
        incomingLabel={t('서버')}
        confirmLabel={t('복구')}
        dateLabel={null}
        note={t('예문 · 태그 · 메모는 서버에 올리지 않아서 돌아오지 않아요. 그 셋까지 되돌리려면 백업 파일을 쓰세요')}
        onCancel={() => setServerCandidate(null)}
        onConfirm={() => {
          if (serverCandidate) void runRestore(serverCandidate);
        }}
      />

      <RestoreConfirmSheet
        visible={restoreCandidate !== null}
        current={currentSummary}
        incoming={restoreCandidate ? backupService.summarize(restoreCandidate.data) : null}
        fileName={restoreCandidate?.fileName ?? ''}
        busy={restoreBusy}
        onCancel={() => setRestoreCandidate(null)}
        onConfirm={() => {
          if (restoreCandidate) void runRestore(restoreCandidate.data);
        }}
      />

      <TimePickerSheet
        visible={showTimePicker}
        value={notify.time}
        onClose={() => setShowTimePicker(false)}
        onConfirm={handleConfirmTime}
      />

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
  notifyCard: {
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 16,
  },
  notifyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    gap: 12,
  },
  notifyLabel: {
    flex: 1,
  },
  notifyTimeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderTopWidth: 1,
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
  /** 카드(infoCard) 안에 줄줄이 들어가는 행 — 언어 선택·법적 고지가 함께 쓴다 */
  cardRow: {
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
