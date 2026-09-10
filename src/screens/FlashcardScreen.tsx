import { useTranslation } from 'react-i18next';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Easing,
  PanResponder,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { MaterialIcons } from '@expo/vector-icons';

import AdBanner, { useAdBannerHeight } from '../components/AdBanner';
import FlipCard from '../components/FlipCard';
import ScreenHeader from '../components/ScreenHeader';
import Toast from '../components/Toast';
import { FONT, HIT_SLOP, RADIUS, SPACING } from '../constants/design';
import { useTheme } from '../contexts/ThemeContext';
import { useToast } from '../hooks/useToast';
import { flashcardService, type CardOrder } from '../services/flashcardService';
import type { Word } from '../types/word';
import { speak } from '../utils/speech';

/**
 * 플래시카드. 카드를 넘기며 익히는 화면이다.
 *
 * 🔴 **여기서는 채점하지 않는다.** 「안다 / 모른다」 버튼이 없고 `quizService`·`srsService` 의
 *    쓰기 함수를 부르지 않는다. 카드를 다 넘겨도 정답률과 복습 만기는 그대로다.
 *    그 대신 마지막 화면에서 **본 단어를 그대로 들고 퀴즈로 넘긴다.** 만기를 줄이는 길은 거기다.
 *    (이 규칙은 `__tests__/flashcardService.test.ts` 가 이 파일의 소스를 훑어 기계로 지킨다)
 *
 * ⚠ 제스처는 카드 영역에서만 받는다. 광고 배너 위에서 끝난다.
 *   아래쪽에서 쓸다가 광고를 누르면 무효 클릭이 되고, 그건 AdMob 정책 문제이기도 하다.
 */

/**
 * 다 본 뒤 퀴즈로 넘길 때 한 번에 내는 문제 수.
 * 🔴 자르지 않으면 150장을 훑어본 사람에게 150문제가 나간다. 홈의 복습 배너가 같은 이유로
 *    `REVIEW_SESSION_SIZE = 10` 으로 자른다. 그 자리 주석이 *"23문제를 강제하면 그게 숙제다"* 다.
 *    훑어보기는 전부 보지만 **시험은 한 세션 분량만** 낸다.
 */
const QUIZ_HANDOFF_SIZE = 10;

const SWIPE_START = 12;
const SWIPE_COMMIT = 56;
const SLIDE_MS = 170;

interface FlashcardScreenProps {
  categoryId: number;
  order: CardOrder;
  frontIsWord: boolean;
  autoSpeak: boolean;
  onBack: () => void;
  /** 본 단어를 그대로 들고 퀴즈로 넘어간다 */
  onQuiz: (wordIds: number[]) => void;
}

export default function FlashcardScreen({
  categoryId,
  order,
  frontIsWord,
  autoSpeak,
  onBack,
  onQuiz,
}: FlashcardScreenProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { toast, showToast, hideToast } = useToast();
  const adHeight = useAdBannerHeight();

  const [cards, setCards] = useState<Word[]>([]);
  const [loading, setLoading] = useState(true);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [done, setDone] = useState(false);

  /**
   * 카드의 가로 이동. 🔴 **이 값은 JS 드라이버로만 쓴다**(`useNativeDriver: false`).
   * 손가락을 따라가려면 `setValue` 가 즉시 화면에 반영돼야 하는데, 네이티브 드라이버에서는
   * `setValue` 가 네이티브 뷰에 닿지 않아 드래그가 아예 안 움직였다(2026-09-10 실측).
   * 변환 하나짜리 뷰 한 개라 JS 드라이버로도 부담이 없다.
   * ⚠ 같은 값을 두 드라이버로 섞어 쓰면 RN 이 경고하고 한쪽이 조용히 안 먹는다.
   */
  const drag = useRef(new Animated.Value(0)).current;
  const sliding = useRef(false);
  const screenWidth = Dimensions.get('window').width;

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const list = await flashcardService.getCards(categoryId, order);
        if (alive) setCards(list);
      } catch (error: any) {
        console.warn('카드 조회 실패:', error);
        if (alive) showToast(t('단어를 불러오는데 실패했습니다'), 'error');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [categoryId, order, showToast, t]);

  const current = cards[index];

  const speakCurrent = useCallback(
    async (word: Word) => {
      // 예문을 함께 넘긴다. 한자만 있는 단어의 일본어/중국어 판별 근거가 된다
      const result = await speak(word.word, (word.examples ?? []).map((e) => e.example));
      if (result.outcome === 'unsupported') {
        showToast(
          t('{{language}} 음성이 기기에 설치되어 있지 않습니다', { language: t(result.label) }),
          'info',
        );
      } else if (result.outcome === 'error') {
        showToast(t('음성 재생에 실패했습니다'), 'error');
      }
    },
    [showToast, t],
  );

  // 새 카드가 뜰 때 자동 재생. 🔴 실패해도 넘기기는 막지 않는다
  useEffect(() => {
    if (!autoSpeak || !current || done) return;
    void speakCurrent(current);
  }, [autoSpeak, current, done, speakCurrent]);

  /**
   * 카드를 옮긴다. 마지막에서 다음을 누르면 마무리 화면으로 간다.
   *
   * 🔴 **카드를 화면 밖으로 내보내고 거기서 멈추지 않는다. 들어오는 쪽만 애니메이션한다.**
   *    처음에는 "내보낸 뒤 `drag.setValue(0)` 으로 되돌리기"로 썼는데 에뮬레이터에서
   *    카드가 통째로 사라졌다(2026-09-10 실측. 카운터는 2/12 로 넘어가는데 카드가 안 보였다).
   *    `useNativeDriver` 로 돌린 변환은 네이티브 뷰가 값을 들고 있어서 `setValue` 로 되돌린
   *    JS 값이 반영되지 않는다. 그래서 카드가 -screenWidth 에 주차된 채로 남았다.
   *    지금 구조는 **모든 이동이 0 에서 끝나는 애니메이션**이라, 어긋나도 카드가 사라질 수 없다.
   *
   * ⚠ 단위 테스트로는 잡히지 않는다. 순서 계산은 옳았고 화면에 그리는 일이 틀렸다.
   */
  const move = useCallback(
    (step: 1 | -1) => {
      if (sliding.current || cards.length === 0) return;
      const next = index + step;
      if (next < 0) return;
      if (next >= cards.length) {
        setDone(true);
        return;
      }
      sliding.current = true;
      setFlipped(false);
      setIndex(next);
      // 새 카드를 반대편에 세워 두고 제자리로 끌어온다
      drag.setValue(step === 1 ? screenWidth : -screenWidth);
      Animated.timing(drag, {
        toValue: 0,
        duration: SLIDE_MS,
        easing: Easing.out(Easing.quad),
        useNativeDriver: false,
      }).start(() => {
        sliding.current = false;
      });
    },
    [cards.length, drag, index, screenWidth],
  );

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        // 세로로 긋는 동작은 카드 안 스크롤에 양보한다
        onMoveShouldSetPanResponder: (_evt, gesture) =>
          Math.abs(gesture.dx) > SWIPE_START && Math.abs(gesture.dx) > Math.abs(gesture.dy),
        onPanResponderMove: (_evt, gesture) => {
          if (!sliding.current) drag.setValue(gesture.dx);
        },
        onPanResponderRelease: (_evt, gesture) => {
          if (sliding.current) return;
          if (gesture.dx <= -SWIPE_COMMIT) {
            move(1);
          } else if (gesture.dx >= SWIPE_COMMIT) {
            move(-1);
          } else {
            Animated.spring(drag, { toValue: 0, useNativeDriver: false, bounciness: 0 }).start();
          }
        },
        onPanResponderTerminate: () => {
          Animated.spring(drag, { toValue: 0, useNativeDriver: false, bounciness: 0 }).start();
        },
      }),
    [drag, move],
  );

  const restart = useCallback(() => {
    setDone(false);
    setFlipped(false);
    setIndex(0);
    drag.setValue(0);
  }, [drag]);

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <StatusBar style={colors.isDark ? 'light' : 'dark'} />
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.centerText, { color: colors.textSecondary }]}>{t('로딩 중...')}</Text>
      </View>
    );
  }

  if (cards.length === 0) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <StatusBar style={colors.isDark ? 'light' : 'dark'} />
        <ScreenHeader title={t('플래시카드')} onBack={onBack} />
        <View style={styles.center}>
          <MaterialIcons name="style" size={64} color={colors.textTertiary} />
          <Text style={[styles.doneTitle, { color: colors.text }]}>{t('등록된 단어가 없습니다')}</Text>
        </View>
        <AdBanner />
      </View>
    );
  }

  // 넘길 단어. 카드 순서 그대로 앞에서 자른다. 방금 본 순서가 사용자의 기억 순서다
  const quizIds = cards.slice(0, QUIZ_HANDOFF_SIZE).map((c) => c.wordId);

  if (done) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <StatusBar style={colors.isDark ? 'light' : 'dark'} />
        <ScreenHeader title={t('플래시카드')} onBack={onBack} />
        <View style={styles.doneBox}>
          <View style={[styles.doneRing, { backgroundColor: colors.primaryLight }]}>
            <MaterialIcons name="check" size={34} color={colors.primaryStrong} />
          </View>
          <Text style={[styles.doneTitle, { color: colors.text }]}>
            {t('{{count}}장 다 봤어요', { count: cards.length })}
          </Text>
          <Text style={[styles.doneSub, { color: colors.textSecondary }]}>
            {t('이제 얼마나 남았는지 확인해 볼까요?')}
          </Text>

          <TouchableOpacity
            style={[styles.primaryButton, { backgroundColor: colors.primaryStrong }]}
            onPress={() => onQuiz(quizIds)}
            accessibilityRole="button"
          >
            <Text style={styles.primaryButtonText}>
              {t('이 {{count}}개로 퀴즈 풀기', { count: quizIds.length })}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.ghostButton} onPress={restart} accessibilityRole="button">
            <Text style={[styles.ghostButtonText, { color: colors.textSecondary }]}>
              {t('처음부터 다시 보기')}
            </Text>
          </TouchableOpacity>
        </View>
        <AdBanner />
      </View>
    );
  }

  const meaningText = (current.meanings ?? []).join(', ');
  const faceMain = frontIsWord ? current.word : meaningText;
  const backMain = frontIsWord ? meaningText : current.word;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style={colors.isDark ? 'light' : 'dark'} />
      <ScreenHeader title={t('플래시카드')} onBack={onBack} />

      {/* 🔴 제스처와 카드는 이 영역 안에서만 산다. 아래 광고 배너를 침범하지 않는다 */}
      <View style={[styles.stage, { paddingBottom: adHeight > 0 ? SPACING.sm : SPACING.lg }]}>
        <View style={styles.progressRow}>
          <Text style={[styles.progressText, { color: colors.textSecondary }]}>
            {index + 1} / {cards.length}
          </Text>
          <View style={[styles.track, { backgroundColor: colors.border }]}>
            <View
              style={[
                styles.trackFill,
                { backgroundColor: colors.primary, width: `${((index + 1) / cards.length) * 100}%` },
              ]}
            />
          </View>
        </View>

        <Animated.View
          style={[styles.cardArea, { transform: [{ translateX: drag }] }]}
          {...panResponder.panHandlers}
        >
          <TouchableOpacity
            style={styles.flex}
            activeOpacity={1}
            onPress={() => setFlipped((prev) => !prev)}
            accessibilityRole="button"
            accessibilityLabel={
              flipped ? t('카드 앞면 보기') : t('카드 뒤집어 뜻 보기')
            }
          >
            <FlipCard
              flipped={flipped}
              front={
                <View style={styles.faceFront}>
                  <Text style={[styles.faceWord, { color: colors.text }]}>{faceMain}</Text>
                  {/* 단어가 보이는 면에만 둔다. 뜻을 읽어 주는 것은 발음 연습이 아니다 */}
                  {frontIsWord && (
                    <TouchableOpacity
                      style={[styles.speakButton, { backgroundColor: colors.primaryLight }]}
                      onPress={() => void speakCurrent(current)}
                      hitSlop={HIT_SLOP}
                      accessibilityRole="button"
                      accessibilityLabel={t('{{word}} 발음 듣기', { word: current.word })}
                    >
                      <MaterialIcons name="volume-up" size={22} color={colors.primary} />
                    </TouchableOpacity>
                  )}
                  <Text style={[styles.hint, { color: colors.textTertiary }]}>
                    {t('탭하면 뜻이 보여요')}
                  </Text>
                </View>
              }
              back={
                <ScrollView
                  style={styles.flex}
                  contentContainerStyle={styles.faceBack}
                  // 카드 안에서 굴린다. 뜻이 여럿이면 한 장에 안 들어간다
                  showsVerticalScrollIndicator={false}
                >
                  <Text style={[styles.backCounter, { color: colors.textSecondary }]}>
                    {frontIsWord ? current.word : meaningText}
                  </Text>
                  <Text style={[styles.backMain, { color: colors.text }]}>{backMain}</Text>

                  {/* 앞면이 「뜻」이면 단어가 이쪽에 있다. 버튼도 따라와야 발음을 들을 수 있다 */}
                  {!frontIsWord && (
                    <TouchableOpacity
                      style={[styles.speakButtonBack, { backgroundColor: colors.primaryLight }]}
                      onPress={() => void speakCurrent(current)}
                      hitSlop={HIT_SLOP}
                      accessibilityRole="button"
                      accessibilityLabel={t('{{word}} 발음 듣기', { word: current.word })}
                    >
                      <MaterialIcons name="volume-up" size={20} color={colors.primary} />
                    </TouchableOpacity>
                  )}

                  {(current.examples ?? []).length > 0 && (
                    <View style={[styles.block, { borderTopColor: colors.borderLight }]}>
                      {(current.examples ?? []).map((example, i) => (
                        <View key={i} style={i > 0 ? styles.exampleGap : undefined}>
                          <Text style={[styles.example, { color: colors.text }]}>
                            {example.example}
                          </Text>
                          {!!example.translation && (
                            <Text style={[styles.exampleTr, { color: colors.textSecondary }]}>
                              {example.translation}
                            </Text>
                          )}
                        </View>
                      ))}
                    </View>
                  )}

                  {!!current.memo && (
                    <View style={[styles.memo, { backgroundColor: colors.surface }]}>
                      <Text style={[styles.memoText, { color: colors.textSecondary }]}>
                        {current.memo}
                      </Text>
                    </View>
                  )}
                </ScrollView>
              }
            />
          </TouchableOpacity>
        </Animated.View>

        {/* 🔴 스와이프만 두지 않는다. 제스처만 아는 사용자는 없다 */}
        <View style={styles.navRow}>
          <TouchableOpacity
            style={[
              styles.navButton,
              { backgroundColor: colors.card, borderColor: colors.border },
              index === 0 && styles.navButtonOff,
            ]}
            onPress={() => move(-1)}
            disabled={index === 0}
            accessibilityRole="button"
          >
            <Text style={[styles.navButtonText, { color: colors.textSecondary }]}>{t('이전')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.navButton,
              flipped
                ? { backgroundColor: colors.primaryStrong, borderColor: colors.primaryStrong }
                : { backgroundColor: colors.card, borderColor: colors.border },
            ]}
            onPress={() => move(1)}
            accessibilityRole="button"
          >
            <Text
              style={[
                styles.navButtonText,
                { color: flipped ? '#FFFFFF' : colors.textSecondary },
              ]}
            >
              {index + 1 === cards.length ? t('마치기') : t('다음')}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <AdBanner />
      <Toast message={toast.message} type={toast.type} visible={toast.visible} onHide={hideToast} />
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
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.xl,
  },
  centerText: {
    marginTop: SPACING.md,
    fontSize: 14,
  },
  stage: {
    flex: 1,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  progressText: {
    fontSize: FONT.caption,
    fontVariant: ['tabular-nums'],
  },
  track: {
    flex: 1,
    height: 3,
    borderRadius: 2,
    overflow: 'hidden',
  },
  trackFill: {
    height: '100%',
    borderRadius: 2,
  },
  cardArea: {
    flex: 1,
    marginTop: SPACING.md,
  },
  faceFront: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.xl,
  },
  faceWord: {
    fontSize: 30,
    fontWeight: '700',
    letterSpacing: -0.5,
    textAlign: 'center',
  },
  speakButton: {
    marginTop: SPACING.lg,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  speakButtonBack: {
    marginTop: SPACING.md,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hint: {
    position: 'absolute',
    bottom: SPACING.lg,
    fontSize: FONT.caption,
  },
  faceBack: {
    padding: SPACING.xl,
  },
  backCounter: {
    fontSize: FONT.label,
    fontWeight: '500',
  },
  backMain: {
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.3,
    marginTop: SPACING.sm,
  },
  block: {
    marginTop: SPACING.lg,
    paddingTop: SPACING.lg,
    borderTopWidth: 1,
  },
  exampleGap: {
    marginTop: SPACING.md,
  },
  example: {
    fontSize: 14,
    lineHeight: 21,
  },
  exampleTr: {
    fontSize: FONT.label,
    lineHeight: 20,
    marginTop: 2,
  },
  memo: {
    marginTop: SPACING.lg,
    borderRadius: RADIUS.sm,
    padding: SPACING.md,
  },
  memoText: {
    fontSize: FONT.label,
    lineHeight: 20,
  },
  navRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    paddingTop: SPACING.md,
  },
  navButton: {
    flex: 1,
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: RADIUS.lg,
    paddingVertical: 13,
  },
  navButtonOff: {
    opacity: 0.45,
  },
  navButtonText: {
    fontSize: FONT.body,
    fontWeight: '600',
  },
  doneBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.xl,
  },
  doneRing: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.lg,
  },
  doneTitle: {
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.3,
    textAlign: 'center',
  },
  doneSub: {
    fontSize: 14,
    marginTop: SPACING.xs,
    textAlign: 'center',
  },
  primaryButton: {
    alignSelf: 'stretch',
    borderRadius: RADIUS.xl,
    padding: SPACING.lg,
    alignItems: 'center',
    marginTop: SPACING.xxl,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  ghostButton: {
    alignSelf: 'stretch',
    alignItems: 'center',
    paddingVertical: SPACING.md,
    marginTop: SPACING.sm,
  },
  ghostButtonText: {
    fontSize: 14,
    fontWeight: '500',
  },
});
