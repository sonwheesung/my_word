import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, BackHandler, Alert } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import i18n, { initLanguage } from './src/i18n';
import HomeScreen from './src/screens/HomeScreen';
import ManageWordsScreen from './src/screens/ManageWordsScreen';
import AddWordScreen from './src/screens/AddWordScreen';
import CategoryManageScreen from './src/screens/CategoryManageScreen';
import QuizSetupScreen from './src/screens/QuizSetupScreen';
import QuizScreen from './src/screens/QuizScreen';
import QuizResultScreen from './src/screens/QuizResultScreen';
import StatisticsScreen from './src/screens/StatisticsScreen';
import MyPageScreen from './src/screens/MyPageScreen';
import ImportWordsScreen from './src/screens/ImportWordsScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import SupportScreen from './src/screens/SupportScreen';
import NoticeScreen from './src/screens/NoticeScreen';
import UpdateModal from './src/components/UpdateModal';
import BlockingGate from './src/components/BlockingGate';
import { ThemeProvider } from './src/contexts/ThemeContext';
import { BootstrapProvider, useBootstrap } from './src/contexts/BootstrapContext';
import { PurchaseProvider } from './src/contexts/PurchaseContext';
import { versionService, isBlocking } from './src/services/versionService';
import type { GateDecision } from './src/services/versionService';
import type { QuizMode, QuizDirection, QuizAnswerType } from './src/screens/QuizSetupScreen';
import type { QuizResult } from './src/services/quizService';

// 에러 바운더리: 렌더링 에러를 화면에 표시
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  render() {
    if (this.state.hasError) {
      return (
        <ScrollView style={{ flex: 1, backgroundColor: '#FEE2E2', padding: 40, paddingTop: 80 }}>
          {/* 클래스 컴포넌트라 훅을 못 쓴다. 인스턴스에서 직접 호출한다 */}
          <Text style={{ fontSize: 20, fontWeight: 'bold', color: '#DC2626', marginBottom: 12 }}>
            {i18n.t('앱 에러 발생')}
          </Text>
          <Text style={{ fontSize: 14, color: '#991B1B' }}>
            {this.state.error?.message}
          </Text>
          <Text style={{ fontSize: 12, color: '#7F1D1D', marginTop: 8 }}>
            {this.state.error?.stack}
          </Text>
        </ScrollView>
      );
    }
    return this.props.children;
  }
}

type Screen = 'home' | 'manageWords' | 'addWord' | 'editWord' | 'manageCategories' | 'quizSetup' | 'quiz' | 'quizResult' | 'statistics' | 'myPage' | 'importWords' | 'settings' | 'support' | 'notice';

function AppContent() {
  const { t } = useTranslation();
  const [currentScreen, setCurrentScreen] = useState<Screen>('home');
  const [previousScreen, setPreviousScreen] = useState<Screen>('home');
  const [editingWordId, setEditingWordId] = useState<number | null>(null);

  // 퀴즈 관련 상태
  const [quizCategoryId, setQuizCategoryId] = useState<number | null>(null);
  const [quizMode, setQuizMode] = useState<QuizMode>('random');
  const [quizWordCount, setQuizWordCount] = useState(10);
  const [quizDirection, setQuizDirection] = useState<QuizDirection>('word_to_meaning');
  const [quizAnswerType, setQuizAnswerType] = useState<QuizAnswerType>('subjective');
  const [quizResults, setQuizResults] = useState<QuizResult[]>([]);
  const [retryWordIds, setRetryWordIds] = useState<number[] | undefined>(undefined);

  // 공지 화면에서 돌아갈 곳(홈 또는 설정) — 진입점이 두 개라 따로 기억한다
  const [noticeFrom, setNoticeFrom] = useState<Screen>('home');

  // 진입 게이트 — 판정 근거는 공통 서버 응답뿐이다
  const { boot, loaded } = useBootstrap();
  const [gate, setGate] = useState<GateDecision>({ kind: 'none' });
  const [updateDismissed, setUpdateDismissed] = useState(false);

  useEffect(() => {
    // 조회가 끝나기 전이거나 실패했으면(boot === null) 게이트를 적용하지 않는다.
    // 서버가 죽었다고 사용자가 앱을 못 쓰는 일은 없어야 한다.
    if (!loaded || !boot) return;

    let alive = true;
    versionService
      .resolveGate(boot)
      .then((decision) => {
        if (alive) setGate(decision);
      })
      .catch(() => {
        // resolveGate 는 throw 하지 않지만, 예기치 못한 경우에도 앱을 막지 않는다
      });

    return () => {
      alive = false;
    };
  }, [boot, loaded]);

  // 뒤로가기 핸들러: 홈이면 종료 확인, 다른 화면이면 이전 화면으로 이동
  const handleBackNavigation = useCallback(() => {
    switch (currentScreen) {
      case 'addWord':
      case 'editWord':
      case 'importWords':
      case 'manageCategories':
        setCurrentScreen(previousScreen);
        break;
      case 'manageWords':
      case 'quizSetup':
      case 'statistics':
      case 'myPage':
      case 'settings':
        setCurrentScreen('home');
        break;
      case 'support':
        // 진입점이 설정 화면뿐이라 항상 설정으로 되돌린다
        setCurrentScreen('settings');
        break;
      case 'notice':
        setCurrentScreen(noticeFrom);
        break;
      case 'quiz':
        setRetryWordIds(undefined);
        setCurrentScreen('quizSetup');
        break;
      case 'quizResult':
        setRetryWordIds(undefined);
        setCurrentScreen('home');
        break;
      default:
        break;
    }
  }, [currentScreen, previousScreen, noticeFrom]);

  useEffect(() => {
    const backAction = () => {
      // 진입 차단 중에는 뒤로가기를 삼킨다(BlockingGate 도 막지만, 등록 순서에 기대지 않는다)
      if (isBlocking(gate)) {
        return true;
      }
      if (currentScreen === 'home') {
        Alert.alert(
          t('앱 종료'),
          t('종료하시겠습니까?'),
          [
            { text: t('취소'), style: 'cancel' },
            { text: t('종료'), style: 'destructive', onPress: () => BackHandler.exitApp() },
          ],
          { cancelable: true },
        );
      } else {
        handleBackNavigation();
      }
      return true;
    };

    const subscription = BackHandler.addEventListener('hardwareBackPress', backAction);
    return () => subscription.remove();
  }, [currentScreen, handleBackNavigation, gate, t]);

  // 점검 · 강제 업데이트 — 다른 화면 대신 렌더한다(뒤에 아무것도 남기지 않기 위해)
  if (isBlocking(gate)) {
    return <BlockingGate decision={gate} />;
  }

  if (currentScreen === 'manageWords') {
    return (
      <ManageWordsScreen
        onBack={() => setCurrentScreen('home')}
        onAddWord={() => {
          setPreviousScreen('manageWords');
          setEditingWordId(null);
          setCurrentScreen('addWord');
        }}
        onEditWord={(wordId) => {
          setPreviousScreen('manageWords');
          setEditingWordId(wordId);
          setCurrentScreen('editWord');
        }}
        onManageCategories={() => {
          setPreviousScreen('manageWords');
          setCurrentScreen('manageCategories');
        }}
        onImportWords={() => {
          setPreviousScreen('manageWords');
          setCurrentScreen('importWords');
        }}
      />
    );
  }

  if (currentScreen === 'addWord' || currentScreen === 'editWord') {
    return (
      <AddWordScreen
        wordId={currentScreen === 'editWord' ? editingWordId : undefined}
        onWordAdded={() => setCurrentScreen(previousScreen)}
        onBack={() => setCurrentScreen(previousScreen)}
      />
    );
  }

  if (currentScreen === 'importWords') {
    return (
      <ImportWordsScreen
        onBack={() => setCurrentScreen(previousScreen)}
        onImportComplete={() => setCurrentScreen('manageWords')}
      />
    );
  }

  if (currentScreen === 'manageCategories') {
    return (
      <CategoryManageScreen onBack={() => setCurrentScreen(previousScreen)} />
    );
  }

  if (currentScreen === 'quizSetup') {
    return (
      <QuizSetupScreen
        onBack={() => setCurrentScreen('home')}
        onStartQuiz={(categoryId, mode, wordCount, direction, answerType) => {
          setQuizCategoryId(categoryId);
          setQuizMode(mode);
          setQuizWordCount(wordCount);
          setQuizDirection(direction);
          setQuizAnswerType(answerType);
          setCurrentScreen('quiz');
        }}
      />
    );
  }

  if (currentScreen === 'quiz' && quizCategoryId) {
    return (
      <QuizScreen
        categoryId={quizCategoryId}
        mode={quizMode}
        wordCount={retryWordIds ? retryWordIds.length : quizWordCount}
        direction={quizDirection}
        answerType={quizAnswerType}
        retryWordIds={retryWordIds}
        onComplete={(results) => {
          setQuizResults(results);
          setRetryWordIds(undefined);
          setCurrentScreen('quizResult');
        }}
        onExit={() => {
          setRetryWordIds(undefined);
          setCurrentScreen('quizSetup');
        }}
      />
    );
  }

  if (currentScreen === 'quizResult') {
    const correctCount = quizResults.filter((r) => r.isCorrect).length;
    const wrongWordIds = [...new Set(quizResults.filter(r => !r.isCorrect).map(r => r.wordId))];
    return (
      <QuizResultScreen
        correctCount={correctCount}
        totalCount={quizResults.length}
        results={quizResults}
        onRetry={() => {
          setRetryWordIds(undefined);
          setCurrentScreen('quiz');
        }}
        onRetryWrong={() => {
          setRetryWordIds(wrongWordIds);
          setCurrentScreen('quiz');
        }}
        onBackToHome={() => {
          setRetryWordIds(undefined);
          setCurrentScreen('home');
        }}
      />
    );
  }

  if (currentScreen === 'statistics') {
    return <StatisticsScreen onBack={() => setCurrentScreen('home')} />;
  }

  if (currentScreen === 'myPage') {
    return <MyPageScreen onBack={() => setCurrentScreen('home')} />;
  }

  if (currentScreen === 'settings') {
    return (
      <SettingsScreen
        onBack={() => setCurrentScreen('home')}
        onSupport={() => setCurrentScreen('support')}
        onNotices={() => {
          setNoticeFrom('settings');
          setCurrentScreen('notice');
        }}
      />
    );
  }

  if (currentScreen === 'support') {
    return <SupportScreen onBack={() => setCurrentScreen('settings')} />;
  }

  if (currentScreen === 'notice') {
    return <NoticeScreen onBack={() => setCurrentScreen(noticeFrom)} />;
  }

  return (
    <>
      <HomeScreen
        onNavigateToManageWords={() => setCurrentScreen('manageWords')}
        onAddWord={() => {
          setPreviousScreen('home');
          setEditingWordId(null);
          setCurrentScreen('addWord');
        }}
        onStartQuiz={() => setCurrentScreen('quizSetup')}
        onViewStatistics={() => setCurrentScreen('statistics')}
        onMyPage={() => setCurrentScreen('myPage')}
        onSettings={() => setCurrentScreen('settings')}
        onNotices={() => {
          setNoticeFrom('home');
          setCurrentScreen('notice');
        }}
        onManageCategories={() => {
          setPreviousScreen('home');
          setCurrentScreen('manageCategories');
        }}
      />
      {gate.kind === 'soft-update' && (
        <UpdateModal
          visible={!updateDismissed}
          currentVersion={gate.currentVersion}
          latestVersion={gate.latestVersion}
          storeUrl={gate.storeUrl}
          onSkip={async () => {
            await versionService.skipVersion(gate.latestVersion);
            setUpdateDismissed(true);
          }}
          onClose={() => setUpdateDismissed(true)}
        />
      )}
    </>
  );
}

export default function App() {
  // 저장된 언어 설정을 읽기 전에 그리면 한국어가 잠깐 보였다가 바뀐다.
  // 저장소 조회는 밀리초 단위라 그동안은 비워 둔다.
  const [languageReady, setLanguageReady] = useState(false);
  useEffect(() => {
    initLanguage().finally(() => setLanguageReady(true));
  }, []);

  if (!languageReady) {
    return <View style={{ flex: 1, backgroundColor: '#8CC5A0' }} />;
  }

  return (
    <ThemeProvider>
      <BootstrapProvider>
        <SafeAreaProvider>
          <ErrorBoundary>
            {/* 광고 노출 여부를 정하므로 화면보다 위에 둔다. 실패해도 children 은 그대로 그린다 */}
            <PurchaseProvider>
              <SafeAreaView style={{ flex: 1 }} edges={['bottom']}>
                <AppContent />
              </SafeAreaView>
            </PurchaseProvider>
          </ErrorBoundary>
        </SafeAreaProvider>
      </BootstrapProvider>
    </ThemeProvider>
  );
}
