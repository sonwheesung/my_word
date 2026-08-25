import { useTranslation } from 'react-i18next';
import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { HIT_SLOP, SPACING } from '../constants/design';
import { MaterialIcons } from '@expo/vector-icons';
import type { QuizResult } from '../services/quizService';
import { useInterstitialAd } from '../hooks/useInterstitialAd';
import AdBanner, { useAdBannerHeight } from '../components/AdBanner';
import { useTheme } from '../contexts/ThemeContext';
import { speak } from '../utils/speech';
import Toast from '../components/Toast';
import { useToast } from '../hooks/useToast';

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
  const { t } = useTranslation();
  const { colors } = useTheme();
  // 토스트가 배너 광고를 덮지 않게 그 높이만큼 띄운다(AdMob 정책)
  const adBannerHeight = useAdBannerHeight();
  const insets = useSafeAreaInsets();
  const { showAd } = useInterstitialAd();
  const { toast, showToast, hideToast } = useToast();
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

  // 이 화면에는 Word 객체가 없어 예문 힌트를 넘길 수 없다.
  // 한자만 있는 단어는 중국어로 추정된다(단어 목록·퀴즈 화면에서는 예문으로 보정된다)
  const speakWord = async (text: string) => {
    const result = await speak(text);
    if (result.outcome === 'unsupported') {
      showToast(t('{{language}} 음성이 기기에 설치되어 있지 않습니다', { language: t(result.label) }), 'info');
    } else if (result.outcome === 'error') {
      showToast(t('음성 재생에 실패했습니다'), 'error');
    }
  };

  // 퀴즈 타입에 따라 '학습 대상 언어' 쪽 텍스트 판별 (반대쪽은 사용자가 쓰는 뜻)
  const getSpeakableText = (result: QuizResult): string | null => {
    if (!result.word || !result.correctAnswer) return null;
    // word_to_meaning, example_to_meaning: 문제(word)가 학습 대상
    if (result.quizType === 'word_to_meaning' || result.quizType === 'example_to_meaning') {
      return result.word;
    }
    // meaning_to_word, translation_to_example: 정답(correctAnswer)이 학습 대상
    if (result.quizType === 'meaning_to_word' || result.quizType === 'translation_to_example') {
      return result.correctAnswer;
    }
    return null;
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style={colors.isDark ? 'light' : 'dark'} />

      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + SPACING.xxl }]}>
        <View style={styles.emoji}>
          {isPerfect ? (
            <MaterialIcons name="emoji-events" size={80} color="#F59E0B" />
          ) : isGood ? (
            <MaterialIcons name="sentiment-satisfied-alt" size={80} color={colors.primary} />
          ) : (
            <MaterialIcons name="refresh" size={80} color={colors.textTertiary} />
          )}
        </View>

        <Text style={[styles.title, { color: colors.text }]}>
          {isPerfect ? t('완벽합니다!') : isGood ? t('잘했어요!') : t('다시 도전해보세요!')}
        </Text>

        <View style={styles.scoreContainer}>
          <Text style={[styles.scoreLabel, { color: colors.textSecondary }]}>{t('정답률')}</Text>
          <Text style={[styles.scoreValue, { color: colors.primaryStrong }]}>{percentage}%</Text>
          <Text style={[styles.scoreDetail, { color: colors.textSecondary }]}>
            {t('{{correct}} / {{total}} 문제', { correct: correctCount, total: totalCount })}
          </Text>
        </View>

        <View style={[styles.statsContainer, { backgroundColor: colors.card }]}>
          <View style={styles.statItem}>
            <Text style={[styles.statValue, { color: colors.successText }]}>{correctCount}</Text>
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{t('정답')}</Text>
          </View>
          <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
          <View style={styles.statItem}>
            <Text style={[styles.statValue, { color: colors.dangerText }]}>
              {totalCount - correctCount}
            </Text>
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{t('오답')}</Text>
          </View>
        </View>

        {/*
          틀린 단어를 모달 없이 여기에 바로 펼친다. 예전에는 `틀린 정답 확인하기` 를
          눌러 전체화면 모달을 열어야 볼 수 있었다.
        */}
        {wrongResults.length > 0 && (
          <View style={styles.wrongSection}>
            <Text style={[styles.wrongSectionTitle, { color: colors.textSecondary }]}>
              {t('틀린 단어')}
            </Text>
            <View style={[styles.wrongList, { backgroundColor: colors.card, borderColor: colors.border }]}>
              {wrongResults.map((result, index) => {
                const speakableText = getSpeakableText(result);
                return (
                  <View
                    key={index}
                    style={[
                      styles.wrongRowItem,
                      index < wrongResults.length - 1 && {
                        borderBottomWidth: 1,
                        borderBottomColor: colors.borderLight,
                      },
                    ]}
                  >
                    <View style={styles.wrongRowHead}>
                      <Text style={[styles.wrongRowWord, { color: colors.text }]} numberOfLines={1}>
                        {result.word}
                      </Text>
                      {speakableText && (
                        <TouchableOpacity
                          onPress={() => speakWord(speakableText)}
                          hitSlop={HIT_SLOP}
                          accessibilityRole="button"
                          accessibilityLabel={t('{{word}} 발음 듣기', { word: result.word })}
                        >
                          <MaterialIcons name="volume-up" size={18} color={colors.primary} />
                        </TouchableOpacity>
                      )}
                    </View>
                    <View style={styles.wrongRowLine}>
                      <Text style={[styles.wrongRowLabel, { color: colors.textTertiary }]}>{t('정답')}</Text>
                      <Text style={[styles.wrongRowValue, { color: colors.successText }]}>
                        {result.correctAnswer}
                      </Text>
                    </View>
                    {result.userAnswer ? (
                      <View style={styles.wrongRowLine}>
                        <Text style={[styles.wrongRowLabel, { color: colors.textTertiary }]}>{t('내 답')}</Text>
                        <Text style={[styles.wrongRowValue, { color: colors.dangerText }]}>
                          {result.userAnswer}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {/* 주 액션 하나 + 보조 하나. 예전에는 비슷한 무게의 버튼이 넷이었다 */}
        <View style={styles.buttonContainer}>
          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={[styles.homeButton, { backgroundColor: colors.surface, borderColor: colors.border }]}
              onPress={onBackToHome}
              accessibilityRole="button"
            >
              <Text style={[styles.homeButtonText, { color: colors.textSecondary }]}>{t('홈으로')}</Text>
            </TouchableOpacity>
            {wrongResults.length > 0 ? (
              <TouchableOpacity
                style={[styles.retryButton, { backgroundColor: colors.primaryStrong }]}
                onPress={onRetryWrong}
                accessibilityRole="button"
              >
                <Text style={styles.retryButtonText}>
                  {t('틀린 {{count}}개 다시 풀기', { count: wrongResults.length })}
                </Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[styles.retryButton, { backgroundColor: colors.primaryStrong }]}
                onPress={onRetry}
                accessibilityRole="button"
              >
                <Text style={styles.retryButtonText}>{t('다시 풀기')}</Text>
              </TouchableOpacity>
            )}
          </View>
          {wrongResults.length > 0 && (
            <TouchableOpacity style={styles.retryAllButton} onPress={onRetry} accessibilityRole="button">
              <Text style={[styles.retryAllButtonText, { color: colors.primary }]}>
                {t('전체 다시 풀기')}
              </Text>
            </TouchableOpacity>
          )}
        </View>

      </ScrollView>

      {/* 하단 배너 광고 — ScrollView **밖**에 둔다. 안에 두면 콘텐츠 끝에 붙어 함께
          스크롤되고 화면 하단에 고정되지 않는다(HomeScreen 과 같은 이유) */}
      <AdBanner />


      <Toast
        message={toast.message}
        type={toast.type}
        visible={toast.visible}
        onHide={hideToast}
        offsetBottom={adBannerHeight}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrongSection: {
    width: '100%',
    marginBottom: 20,
  },
  wrongSectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
  },
  wrongList: {
    borderWidth: 1,
    borderRadius: 12,
    overflow: 'hidden',
  },
  wrongRowItem: {
    paddingHorizontal: 14,
    paddingVertical: 11,
    gap: 3,
  },
  wrongRowHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  wrongRowWord: {
    fontSize: 15,
    fontWeight: '700',
    flex: 1,
  },
  wrongRowLine: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
  },
  wrongRowLabel: {
    fontSize: 11,
    width: 30,
  },
  wrongRowValue: {
    fontSize: 13,
    fontWeight: '500',
    flex: 1,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
  },
  retryAllButton: {
    alignItems: 'center',
    paddingVertical: 12,
    marginTop: 4,
  },
  retryAllButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
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
    borderRadius: 20,
    padding: 24,
    marginBottom: 40,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 5,
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
  // 색은 화면에서 colors.successText / colors.dangerText 로 넣는다
  statValue: {
    fontSize: 32,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 14,
    color: '#6B7280',
  },
  buttonContainer: {
    width: '100%',
    gap: 12,
  },
  // 틀린 문제를 '보는' 동작이라 파괴적이지 않다. 빨강을 걷고 보조 버튼 스타일로 맞춘다
  retryButton: {
    flex: 1.4,
    backgroundColor: '#C4B5FD',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  homeButton: {
    flex: 1,
    borderWidth: 1,
    backgroundColor: '#E5E7EB',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
  },
  homeButtonText: {
    color: '#374151',
    fontSize: 16,
    fontWeight: '600',
  },
  // 모달 스타일
  wrongSpeakButtonText: {
    fontSize: 14,
  },
});
