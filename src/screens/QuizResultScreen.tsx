import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Modal } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as Speech from 'expo-speech';
import type { QuizResult } from '../services/quizService';
import { useInterstitialAd } from '../hooks/useInterstitialAd';
import AdBanner from '../components/AdBanner';

interface QuizResultScreenProps {
  correctCount: number;
  totalCount: number;
  results: QuizResult[];
  onRetry: () => void;
  onRetryWrong: () => void;
  onBackToHome: () => void;
}

export default function QuizResultScreen({
  correctCount,
  totalCount,
  results,
  onRetry,
  onRetryWrong,
  onBackToHome,
}: QuizResultScreenProps) {
  const [showWrongAnswers, setShowWrongAnswers] = useState(false);
  const { showAd } = useInterstitialAd();
  const percentage = totalCount > 0 ? Math.round((correctCount / totalCount) * 100) : 0;

  // 퀴즈 결과 화면 진입 시 전면 광고 표시
  useEffect(() => {
    const timer = setTimeout(() => {
      showAd();
    }, 500);
    return () => clearTimeout(timer);
  }, [showAd]);
  const isPerfect = correctCount === totalCount && totalCount > 0;
  const isGood = percentage >= 70;

  const wrongResults = results.filter((r) => !r.isCorrect);

  const speakEnglish = (text: string) => {
    Speech.speak(text, { language: 'en-US', rate: 0.85 });
  };

  // 퀴즈 타입에 따라 영어 텍스트 판별
  const getEnglishText = (result: QuizResult): string | null => {
    if (!result.word || !result.correctAnswer) return null;
    // word_to_meaning, example_to_meaning: 문제(word)가 영어
    if (result.quizType === 'word_to_meaning' || result.quizType === 'example_to_meaning') {
      return result.word;
    }
    // meaning_to_word, translation_to_example: 정답(correctAnswer)이 영어
    if (result.quizType === 'meaning_to_word' || result.quizType === 'translation_to_example') {
      return result.correctAnswer;
    }
    return null;
  };

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.emoji}>
          {isPerfect ? '🎉' : isGood ? '😊' : '📝'}
        </Text>

        <Text style={styles.title}>
          {isPerfect ? '완벽합니다!' : isGood ? '잘했어요!' : '다시 도전해보세요!'}
        </Text>

        <View style={styles.scoreContainer}>
          <Text style={styles.scoreLabel}>정답률</Text>
          <Text style={styles.scoreValue}>{percentage}%</Text>
          <Text style={styles.scoreDetail}>
            {correctCount} / {totalCount} 문제
          </Text>
        </View>

        <View style={styles.statsContainer}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{correctCount}</Text>
            <Text style={styles.statLabel}>정답</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={[styles.statValue, styles.wrongValue]}>
              {totalCount - correctCount}
            </Text>
            <Text style={styles.statLabel}>오답</Text>
          </View>
        </View>

        <View style={styles.buttonContainer}>
          {wrongResults.length > 0 && (
            <>
              <TouchableOpacity
                style={styles.wrongAnswerButton}
                onPress={() => setShowWrongAnswers(true)}
              >
                <Text style={styles.wrongAnswerButtonText}>틀린 정답 확인하기</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.retryWrongButton}
                onPress={onRetryWrong}
              >
                <Text style={styles.retryWrongButtonText}>틀린 문제만 다시 풀기</Text>
              </TouchableOpacity>
            </>
          )}
          <TouchableOpacity style={styles.retryButton} onPress={onRetry}>
            <Text style={styles.retryButtonText}>다시 풀기</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.homeButton} onPress={onBackToHome}>
            <Text style={styles.homeButtonText}>홈으로</Text>
          </TouchableOpacity>
        </View>

        {/* 하단 배너 광고 */}
        <AdBanner />
      </ScrollView>

      {/* 틀린 정답 확인 모달 */}
      <Modal
        visible={showWrongAnswers}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowWrongAnswers(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>틀린 문제 확인</Text>
            <TouchableOpacity onPress={() => setShowWrongAnswers(false)}>
              <Text style={styles.modalCloseText}>닫기</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalContent}>
            {wrongResults.map((result, index) => {
              const englishText = getEnglishText(result);
              return (
                <View key={index} style={styles.wrongItem}>
                  <View style={styles.wrongIndexArea}>
                    <Text style={styles.wrongIndex}>{index + 1}</Text>
                    {englishText && (
                      <TouchableOpacity
                        style={styles.wrongSpeakButton}
                        onPress={() => speakEnglish(englishText)}
                        hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                      >
                        <Text style={styles.wrongSpeakButtonText}>🔊</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                  <View style={styles.wrongDetail}>
                    <View style={styles.wrongRow}>
                      <Text style={styles.wrongLabel}>문제</Text>
                      <Text style={styles.wrongWord}>{result.word}</Text>
                    </View>
                    <View style={styles.wrongRow}>
                      <Text style={styles.wrongLabel}>정답</Text>
                      <Text style={styles.correctAnswerText}>{result.correctAnswer}</Text>
                    </View>
                    <View style={styles.wrongRow}>
                      <Text style={styles.wrongLabel}>내 답</Text>
                      <Text style={styles.userAnswerText}>{result.userAnswer}</Text>
                    </View>
                  </View>
                </View>
              );
            })}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  emoji: {
    fontSize: 80,
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1A1A1A',
    marginBottom: 40,
  },
  scoreContainer: {
    alignItems: 'center',
    marginBottom: 32,
  },
  scoreLabel: {
    fontSize: 16,
    color: '#6B7280',
    marginBottom: 8,
  },
  scoreValue: {
    fontSize: 64,
    fontWeight: 'bold',
    color: '#C4B5FD',
    marginBottom: 8,
  },
  scoreDetail: {
    fontSize: 18,
    color: '#374151',
  },
  statsContainer: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 24,
    marginBottom: 40,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statDivider: {
    width: 1,
    backgroundColor: '#E5E7EB',
    marginHorizontal: 20,
  },
  statValue: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#10B981',
    marginBottom: 4,
  },
  wrongValue: {
    color: '#EF4444',
  },
  statLabel: {
    fontSize: 14,
    color: '#6B7280',
  },
  buttonContainer: {
    width: '100%',
    gap: 12,
  },
  wrongAnswerButton: {
    backgroundColor: '#FEE2E2',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  wrongAnswerButtonText: {
    color: '#DC2626',
    fontSize: 16,
    fontWeight: 'bold',
  },
  retryWrongButton: {
    backgroundColor: '#FEF3C7',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  retryWrongButtonText: {
    color: '#92400E',
    fontSize: 16,
    fontWeight: 'bold',
  },
  retryButton: {
    backgroundColor: '#C4B5FD',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  homeButton: {
    backgroundColor: '#E5E7EB',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
  },
  homeButtonText: {
    color: '#374151',
    fontSize: 16,
    fontWeight: '600',
  },
  // 모달 스타일
  modalContainer: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    paddingTop: 52,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1A1A1A',
  },
  modalCloseText: {
    fontSize: 16,
    color: '#C4B5FD',
    fontWeight: '600',
  },
  modalContent: {
    flex: 1,
    padding: 16,
  },
  wrongItem: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  wrongIndexArea: {
    alignItems: 'center',
    marginRight: 16,
    gap: 8,
  },
  wrongIndex: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#EF4444',
    minWidth: 24,
    textAlign: 'center',
  },
  wrongSpeakButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#EDE9FE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  wrongSpeakButtonText: {
    fontSize: 14,
  },
  wrongDetail: {
    flex: 1,
    gap: 8,
  },
  wrongRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  wrongLabel: {
    fontSize: 13,
    color: '#6B7280',
    fontWeight: '600',
    minWidth: 40,
    marginRight: 8,
  },
  wrongWord: {
    fontSize: 15,
    color: '#1A1A1A',
    fontWeight: '600',
    flex: 1,
  },
  correctAnswerText: {
    fontSize: 15,
    color: '#10B981',
    fontWeight: '600',
    flex: 1,
  },
  userAnswerText: {
    fontSize: 15,
    color: '#EF4444',
    fontWeight: '600',
    flex: 1,
  },
});
