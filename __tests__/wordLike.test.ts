import { collectNewWords, isWordLike } from '../src/services/examService';
import type { ExamQuestion } from '../src/services/commonServer/types';

/**
 * 🔴 **결과 화면의 「시험에 나온 새 단어」에 문장이 섞여 있었다**(2026-10-12 사장님 제보).
 *
 * `axis: 'usage'` 문제는 *"어느 문장이 이 단어를 바르게 썼나"* 를 묻기 때문에 **보기가 문장**인데,
 * 오답 보기를 그대로 단어 후보로 담고 있었다. 실제 화면에 이런 것이 칩으로 떴다:
 *
 * ```
 * ⊕ We had lunch at a branch of the restaurant.
 * ⊕ The two teams reached a conflict-free agreement immediately.
 * ```
 */

const q = (over: Partial<ExamQuestion> = {}): ExamQuestion => ({
  id: 'q1',
  word: 'branch',
  axis: 'meaning',
  format: 'choice',
  prompt: '...',
  choices: ['a', 'b', 'c', 'd'],
  answerIndex: 0,
  meaning: null,
  explanation: null,
  ...over,
});

describe('isWordLike — 담을 만한 것인가', () => {
  it.each([
    ['branch', true],
    ['agreement', true],
    ['conflict-free agreement', true],
    ['機会', true],
    ['提案する', true],
    ['get along with', true],
    ['  spaced  ', true],
  ])('단어·구는 담는다: %p', (text, expected) => {
    expect(isWordLike(text as string)).toBe(expected);
  });

  it.each([
    ['We had lunch at a branch of the restaurant.', false],
    ['The tree branch fell during the storm.', false],
    ['She branched the report into two sections.', false],
    ['The two teams reached a conflict-free agreement immediately.', false],
    ['これは文です。', false],
    ['정말인가요?', false],
    ['Really!', false],
    ['First. Second', false],
    ['', false],
    ['   ', false],
    ['two\nlines', false],
  ])('문장은 안 담는다: %p', (text, expected) => {
    expect(isWordLike(text as string)).toBe(expected);
  });

  it('🔴 아주 긴 구도 안 담는다 — 문장 부호가 없어도 문장일 수 있다', () => {
    expect(isWordLike('a b c d e f g')).toBe(false);
    expect(isWordLike('x'.repeat(40))).toBe(false);
  });
});

describe('collectNewWords — 문장 보기를 거른다', () => {
  it('🔴 usage 문제의 문장 보기가 후보에 안 들어온다', () => {
    const questions = [
      q({
        axis: 'usage',
        choices: [
          'He opened a new branch in Busan.',
          'We had lunch at a branch of the restaurant.',
          'The tree branch fell during the storm.',
          'She branched the report into two sections.',
        ],
        answerIndex: 0,
      }),
    ];
    expect(collectNewWords(questions, [])).toEqual([]);
  });

  it('뜻 문제의 단어 보기는 그대로 담는다', () => {
    const questions = [
      q({ choices: ['지점', 'agreement', 'sequence', 'permission'], answerIndex: 0 }),
    ];
    expect(collectNewWords(questions, [])).toEqual(['agreement', 'sequence', 'permission']);
  });

  it('이미 가진 단어와 문제가 물은 단어는 빠진다', () => {
    const questions = [
      q({ word: 'branch', choices: ['지점', 'agreement', 'branch', 'owned'], answerIndex: 0 }),
    ];
    expect(collectNewWords(questions, ['owned'])).toEqual(['agreement']);
  });

  it('섞여 있어도 단어만 남는다', () => {
    const questions = [
      q({ id: 'a', choices: ['뜻', 'agreement', 'The cat sat on the mat.', 'sequence'], answerIndex: 0 }),
      q({ id: 'b', choices: ['뜻2', 'agreement', 'permission', 'He ran away quickly.'], answerIndex: 0 }),
    ];
    // 중복(agreement)은 한 번만
    expect(collectNewWords(questions, [])).toEqual(['agreement', 'sequence', 'permission']);
  });
});

describe('🔴 철자(form) 문제의 오답은 단어가 아니다', () => {
  it('일부러 틀린 철자를 후보로 담지 않는다', () => {
    const questions = [
      q({
        word: 'branch',
        axis: 'form',
        choices: ['brunch', 'branched', 'branch', 'brench'],
        answerIndex: 2,
      }),
      q({
        id: 'b',
        word: 'bottleneck',
        axis: 'form',
        choices: ['bottlecap', 'bottleneck', 'bottlenose', 'bottlework'],
        answerIndex: 1,
      }),
    ];
    // brench · bottlework 는 없는 말이고, brunch · branched 도 이 문맥에서는 **오답으로 고른 것**이다
    expect(collectNewWords(questions, [])).toEqual([]);
  });

  it('⚠ meaning · usage 의 오답은 실제 단어라 그대로 담는다', () => {
    const questions = [
      q({ axis: 'meaning', word: 'migration', choices: ['replication', 'rollback', 'migration', 'backup'], answerIndex: 2 }),
    ];
    expect(collectNewWords(questions, [])).toEqual(['replication', 'rollback', 'backup']);
  });
});
