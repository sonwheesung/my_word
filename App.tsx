import React, { useState } from 'react';
import { View, Text, ScrollView } from 'react-native';
import HomeScreen from './src/screens/HomeScreen';
import ManageWordsScreen from './src/screens/ManageWordsScreen';
import AddWordScreen from './src/screens/AddWordScreen';
import CategoryManageScreen from './src/screens/CategoryManageScreen';
import QuizSetupScreen from './src/screens/QuizSetupScreen';
import QuizScreen from './src/screens/QuizScreen';
import QuizResultScreen from './src/screens/QuizResultScreen';
import StatisticsScreen from './src/screens/StatisticsScreen';
import MyPageScreen from './src/screens/MyPageScreen';
import type { QuizMode } from './src/screens/QuizSetupScreen';
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

type Screen = 'home' | 'manageWords' | 'addWord' | 'editWord' | 'manageCategories' | 'quizSetup' | 'quiz' | 'quizResult' | 'statistics' | 'myPage';

function AppContent() {
  const [currentScreen, setCurrentScreen] = useState<Screen>('home');
  const [previousScreen, setPreviousScreen] = useState<Screen>('home');
  const [editingWordId, setEditingWordId] = useState<number | null>(null);

  // 퀴즈 관련 상태
  const [quizCategoryId, setQuizCategoryId] = useState<number | null>(null);
  const [quizMode, setQuizMode] = useState<QuizMode>('random');
  const [quizWordCount, setQuizWordCount] = useState(10);
  const [quizResults, setQuizResults] = useState<QuizResult[]>([]);
  const [retryWordIds, setRetryWordIds] = useState<number[] | undefined>(undefined);

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

  if (currentScreen === 'manageCategories') {
    return (
      <CategoryManageScreen onBack={() => setCurrentScreen(previousScreen)} />
    );
  }

  if (currentScreen === 'quizSetup') {
    return (
      <QuizSetupScreen
        onBack={() => setCurrentScreen('home')}
        onStartQuiz={(categoryId, mode, wordCount) => {
          setQuizCategoryId(categoryId);
          setQuizMode(mode);
          setQuizWordCount(wordCount);
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
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppContent />
    </ErrorBoundary>
  );
}
