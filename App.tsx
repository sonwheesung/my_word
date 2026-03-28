import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, BackHandler, Alert } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
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
import UpdateModal from './src/components/UpdateModal';
import { versionService } from './src/services/versionService';
import type { VersionCheckResult } from './src/services/versionService';
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
          <Text style={{ fontSize: 20, fontWeight: 'bold', color: '#DC2626', marginBottom: 12 }}>
            앱 에러 발생
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

type Screen = 'home' | 'manageWords' | 'addWord' | 'editWord' | 'manageCategories' | 'quizSetup' | 'quiz' | 'quizResult' | 'statistics' | 'myPage' | 'importWords';

function AppContent() {
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

  // 버전 업데이트 관련 상태
  const [updateInfo, setUpdateInfo] = useState<VersionCheckResult | null>(null);
  const [showUpdateModal, setShowUpdateModal] = useState(false);

  // 앱 시작 시 버전 체크
  useEffect(() => {
    const checkVersion = async () => {
      try {
        const result = await versionService.checkForUpdate();
        if (result.hasUpdate) {
          setUpdateInfo(result);
          setShowUpdateModal(true);
        }
      } catch {
        // 버전 체크 실패 시 무시
      }
    };
    checkVersion();
  }, []);

  // 홈 화면에서 뒤로가기 시 종료 확인
  useEffect(() => {
    if (currentScreen !== 'home') return;

    const backAction = () => {
      Alert.alert(
        '앱 종료',
        '종료하시겠습니까?',
        [
          { text: '취소', style: 'cancel' },
          { text: '종료', style: 'destructive', onPress: () => BackHandler.exitApp() },
        ],
        { cancelable: true },
      );
      return true;
    };

    const subscription = BackHandler.addEventListener('hardwareBackPress', backAction);
    return () => subscription.remove();
  }, [currentScreen]);

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
        onManageCategories={() => {
          setPreviousScreen('home');
          setCurrentScreen('manageCategories');
        }}
      />
      {updateInfo && (
        <UpdateModal
          visible={showUpdateModal}
          currentVersion={updateInfo.currentVersion}
          latestVersion={updateInfo.latestVersion}
          onSkip={async () => {
            await versionService.skipVersion(updateInfo.latestVersion);
            setShowUpdateModal(false);
          }}
          onClose={() => setShowUpdateModal(false)}
        />
      )}
    </>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <SafeAreaView style={{ flex: 1 }} edges={['bottom']}>
          <AppContent />
        </SafeAreaView>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
