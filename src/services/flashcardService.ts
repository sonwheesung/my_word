import { FLASHCARD_PREFS_KEY } from '../constants/appConfig';
import { readRaw, writeRaw } from '../utils/storage';
import { srsService } from './srsService';
import { wordService } from './wordService';
import type { Word } from '../types/word';

/**
 * 플래시카드. 채점하지 않고 카드를 넘겨보는 모드다.
 *
 * 🔴 **이 파일에는 쓰기가 하나뿐이고 그것은 취향 저장이다.**
 *    `quizResultStorage.saveResults` 도 `srsService.recordAnswers` 도 부르지 않는다.
 *    카드를 몇 장 넘겼든 정답률과 복습 만기는 움직이지 않는다. 그게 이 모드의 정체다
 *    (퀴즈는 "재는 것"이고 플래시카드는 "익히는 것"이다. 둘을 한 통에 담으면 정답률이 오염된다.)
 *    `__tests__/flashcardService.test.ts` 가 화면 소스까지 훑어 이 규칙을 기계로 지킨다.
 *
 * ⚠ 만기순 정렬만 `srsService` 를 **읽는다.** 읽기라서 위 규칙과 어긋나지 않는다
 *   (퀴즈 설정 화면도 만기 수를 같은 방식으로 읽는다).
 *
 * 순서 계산을 화면에 두지 않고 여기 둔 이유: 1.6.0 의 SRS 버그가 **순수 함수는 각각
 * 옳았고 조합이 틀렸던** 것이었다. 조합을 화면 밖에 둬야 단위 테스트가 붙는다.
 */

/** 카드를 낼 순서. `due` 는 "복습할 때가 된 것부터"다 */
export type CardOrder = 'created' | 'shuffle' | 'due';

export interface FlashcardPrefs {
  order: CardOrder;
  /** true 면 앞면이 단어, false 면 앞면이 뜻 */
  frontIsWord: boolean;
  /** 앞면이 뜰 때 발음을 자동으로 읽어 줄지 */
  autoSpeak: boolean;
  /** 마지막에 본 카테고리. 다음에 열면 여기서 시작한다 */
  lastCategoryId: number | null;
}

export const DEFAULT_PREFS: FlashcardPrefs = {
  order: 'created',
  frontIsWord: true,
  autoSpeak: false,
  lastCategoryId: null,
};

const VALID_ORDERS: readonly CardOrder[] = ['created', 'shuffle', 'due'];

export function isCardOrder(value: unknown): value is CardOrder {
  return typeof value === 'string' && (VALID_ORDERS as readonly string[]).includes(value);
}

/**
 * 저장된 취향을 읽는다. 🔴 **어떤 입력에도 던지지 않는다.**
 * 취향 하나가 깨졌다고 카드를 못 보는 일은 없어야 하므로, 이해할 수 없는 값은 기본값으로 돌린다.
 */
export function parsePrefs(raw: string | null): FlashcardPrefs {
  if (!raw) return { ...DEFAULT_PREFS };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ...DEFAULT_PREFS };
  }
  if (typeof parsed !== 'object' || parsed === null) return { ...DEFAULT_PREFS };
  const obj = parsed as Record<string, unknown>;
  const lastCategoryId = obj.lastCategoryId;
  return {
    order: isCardOrder(obj.order) ? obj.order : DEFAULT_PREFS.order,
    frontIsWord: typeof obj.frontIsWord === 'boolean' ? obj.frontIsWord : DEFAULT_PREFS.frontIsWord,
    autoSpeak: typeof obj.autoSpeak === 'boolean' ? obj.autoSpeak : DEFAULT_PREFS.autoSpeak,
    lastCategoryId:
      typeof lastCategoryId === 'number' && Number.isFinite(lastCategoryId) ? lastCategoryId : null,
  };
}

/** 등록순. 같은 시각이면 wordId 로 갈라 **같은 입력에 항상 같은 순서**가 나오게 한다 */
function byCreated(words: Word[]): Word[] {
  return [...words].sort(
    (a, b) => a.createdAt.localeCompare(b.createdAt) || a.wordId - b.wordId,
  );
}

/** Fisher-Yates. rng 를 받는 이유는 테스트에서 순서를 고정해 재기 위함이다 */
function shuffled(words: Word[], rng: () => number): Word[] {
  const out = [...words];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * 카드 순서를 정한다. 순수 함수다.
 *
 * `due` 는 만기 단어를 `dueIds` 가 준 우선순위대로 앞에 놓고, 나머지를 등록순으로 뒤에 붙인다.
 * 🔴 **만기가 아닌 단어를 빼지 않는다.** 훑어보기는 전부 보는 것이고, 자르면 퀴즈가 된다.
 */
export function buildSequence(
  words: Word[],
  order: CardOrder,
  dueIds: readonly number[] = [],
  rng: () => number = Math.random,
): Word[] {
  if (words.length === 0) return [];
  if (order === 'shuffle') return shuffled(words, rng);
  if (order !== 'due') return byCreated(words);

  const rank = new Map<number, number>();
  dueIds.forEach((id, index) => {
    if (!rank.has(id)) rank.set(id, index);
  });

  const due: Word[] = [];
  const rest: Word[] = [];
  for (const word of byCreated(words)) {
    (rank.has(word.wordId) ? due : rest).push(word);
  }
  due.sort((a, b) => (rank.get(a.wordId) ?? 0) - (rank.get(b.wordId) ?? 0));
  return [...due, ...rest];
}

export const flashcardService = {
  async loadPrefs(): Promise<FlashcardPrefs> {
    return parsePrefs(await readRaw(FLASHCARD_PREFS_KEY));
  },

  /** 취향 저장이 실패해도 화면은 그대로 굴러가야 하므로 삼킨다 */
  async savePrefs(prefs: FlashcardPrefs): Promise<void> {
    try {
      await writeRaw(FLASHCARD_PREFS_KEY, JSON.stringify(prefs));
    } catch (error: any) {
      console.warn('플래시카드 설정 저장 실패:', error);
    }
  },

  /**
   * 카드 묶음을 만든다.
   * ⚠ 만기를 못 읽어도 카드는 나와야 한다. 실패하면 등록순으로 조용히 내려앉는다.
   */
  async getCards(categoryId: number, order: CardOrder): Promise<Word[]> {
    const words = await wordService.getWords(categoryId);
    if (words.length === 0) return [];

    let dueIds: number[] = [];
    if (order === 'due') {
      try {
        dueIds = await srsService.getDueWordIds(words.length, categoryId);
      } catch (error: any) {
        console.warn('만기 조회 실패, 등록순으로 낸다:', error);
      }
    }
    return buildSequence(words, order, dueIds);
  },
};
