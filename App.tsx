import React, { useState } from 'react';
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
        onManageCategories={() => setCurrentScreen('manageCategories')}
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
      <CategoryManageScreen onBack={() => setCurrentScreen('manageWords')} />
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
        wordCount={quizWordCount}
        onComplete={(results) => {
          setQuizResults(results);
          setCurrentScreen('quizResult');
        }}
      />
    );
  }

  if (currentScreen === 'quizResult') {
    const correctCount = quizResults.filter((r) => r.isCorrect).length;
    return (
      <QuizResultScreen
        correctCount={correctCount}
        totalCount={quizResults.length}
        results={quizResults}
        onRetry={() => setCurrentScreen('quiz')}
        onBackToHome={() => setCurrentScreen('home')}
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
    />
  );
}

export default function App() {
  return <AppContent />;
}
