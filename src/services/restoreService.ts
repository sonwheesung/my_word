/**
 * 서버 복구 — **서버에서 당겨 기기를 채운다**(2026-10-12 · `docs/SERVER_RESTORE_PLAN.md`).
 *
 * 🔴 **`syncService` 와 일부러 다른 파일이다.**
 *
 * ```
 * syncService     부팅마다 조용히 **민다**        실패를 화면에 안 띄운다
 * restoreService  사용자가 고른 순간에만 **당긴다**  기기를 덮어쓰는 일이다
 * ```
 *
 * 한 서비스에 섞으면 자동으로 도는 경로가 언젠가 기기를 덮어쓸 수 있고, **그 사고는 조용하다.**
 * `__tests__/syncService.test.ts` 가 미는 쪽에 당기는 호출이 없는지 기계로 본다.
 *
 * ## 🔴 덮어쓰기다. 합치는 것이 아니다
 *
 * 같은 id 가 서로 다른 단어를 가리키는 경우를 다루려면 병합 코드가 필요하고, 그 코드는
 * 틀렸을 때 **조용히 틀린다**(남의 단어가 내 단어장에 들어온다). 그래서 둘 중 하나를 고르게 한다.
 * 덮어쓰기 직전의 기기 상태는 화면이 `myword-before-restore.json` 으로 남긴다 —
 * 백업 복원이 **이미 하는 일**이고 세 릴리스에서 검증된 통로다.
 *
 * ## 🔴 이 파일은 **아무것도 쓰지 않는다. 받아서 조립만 한다**
 *
 * 기기에 쓰는 일은 설정 화면의 `runRestore` 하나가 한다 — 그 자리가 **덮어쓰기 직전에
 * 안전 사본(`myword-before-restore.json`)을 남기고 번들을 다시 올리는** 유일한 자리다.
 *
 * ⚠ 2026-10-13 에 여기 있던 `apply()`(= `backupService.restore` 한 줄)를 **지웠다.**
 *   부르는 곳이 **0건**이었고, 남겨 두면 다음 사람이 그걸 부르면서 **안전 사본과 재시작을
 *   같이 건너뛴다.** 그쪽이 더 짧아 보이기 때문이다. 그날 아침 `pushRest()` 가 같은 모양으로
 *   비어 있었다 — **「함수가 있다」와 「그 함수가 불린다」는 다른 명제다.**
 *
 * ## ⚠ 서버 복구가 되돌려 주지 못하는 것
 *
 * **예문 · 태그 · 메모.** 밀기가 그 셋을 보내지 않는다 — 게시된 처리방침이
 * *"메모·예문·태그는 전송되지 않습니다"* 라고 적고 있고, 그건 사적인 내용을 서버에 쌓지 않으려는
 * 결정이다. 그 셋까지 되살리려면 **백업 파일**을 쓴다. 두 복구 수단의 역할이 다르다:
 *
 * ```
 * 백업 파일   전부 돌아온다              🚫 파일을 잃으면 끝이다
 * 서버 복구   단어 · 뜻 · 기록이 돌아온다   ✅ 폰을 잃어도 남아 있다
 * ```
 */
import type { BackupFile } from './backupService';
import { commonServer } from './commonServer/client';
import type { SyncCounts, SyncKind } from './commonServer/types';
import type { Category, Word } from '../types/word';
import type { StoredQuizResult } from '../utils/storage';

/** 한 종류를 몇 페이지까지 당기나. 🔴 무한 루프를 코드로 막는다 — 서버가 커서를 잘못 줘도 멈춘다 */
const MAX_PAGES = 200;

export type RestoreFail =
  | 'not-configured'
  | 'offline'
  | 'not-signed-in'
  | 'unauthorized'
  | 'empty'
  | 'error';

export type RestoreResult<T> = ({ ok: true } & T) | { ok: false; reason: RestoreFail };

/** 서버가 들고 있는 개수. 복구 화면의 「서버」 칸이다 */
export async function serverCounts(): Promise<RestoreResult<{ counts: SyncCounts }>> {
  const res = await commonServer.syncCounts();
  if (!res.ok) return { ok: false, reason: toFail(res.reason) };
  return { ok: true, counts: res.counts };
}

const toFail = (reason: string): RestoreFail =>
  reason === 'not-configured' ||
  reason === 'offline' ||
  reason === 'not-signed-in' ||
  reason === 'unauthorized'
    ? reason
    : 'error';

/** 한 종류를 끝까지 당긴다. 🔴 중간에 실패하면 **아무것도 쓰지 않고** 실패를 돌려준다 */
async function pullAll(kind: SyncKind): Promise<RestoreResult<{ items: unknown[] }>> {
  const items: unknown[] = [];
  let after: number | null = null;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const res = await commonServer.syncPull(kind, after);
    if (!res.ok) return { ok: false, reason: toFail(res.reason) };
    items.push(...res.items);
    if (res.nextAfter === null) return { ok: true, items };
    /*
     * ⚠ 커서가 앞으로 가지 않으면 멈춘다. 서버가 같은 값을 다시 주면 **영원히 같은 페이지**를
     *   받게 되고, 그 루프는 데이터 요금과 배터리를 쓰면서 아무것도 하지 않는다.
     */
    if (after !== null && res.nextAfter <= after) return { ok: true, items };
    after = res.nextAfter;
  }
  return { ok: true, items };
}

const arr = (raw: unknown): unknown[] => {
  if (Array.isArray(raw)) return raw;
  if (typeof raw !== 'string') return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
};

const obj = (raw: unknown): Record<string, unknown> => {
  if (typeof raw === 'object' && raw !== null && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  if (typeof raw !== 'string') return {};
  try {
    const v = JSON.parse(raw);
    return typeof v === 'object' && v !== null && !Array.isArray(v)
      ? (v as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
};

const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback);
const int = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? Math.floor(v) : null;

/**
 * 서버가 준 줄을 기기 모양으로 옮긴다. **순수 함수다** — 네트워크도 저장소도 안 건드린다.
 *
 * 🔴 쓸 수 없는 줄은 **버린다**(id 가 없는 것). 반쯤 복원된 단어를 만들면 화면이 깨지고,
 *    그 깨짐은 복구가 끝난 뒤에야 보인다.
 */
export function toWords(items: readonly unknown[]): Word[] {
  const out: Word[] = [];
  for (const raw of items) {
    const o = obj(raw);
    const wordId = int(o.wordId);
    const categoryId = int(o.categoryId);
    if (wordId === null || categoryId === null) continue;
    const updatedAt = str(o.updatedAt, str(o.createdAt));
    out.push({
      wordId,
      categoryId,
      word: str(o.word),
      meanings: arr(o.meanings).map((m) => String(m)),
      /*
       * ⚠ **빈 배열이다. 서버에 없기 때문이다**(머리 주석의 "되돌려 주지 못하는 것").
       *   `undefined` 로 두지 않는 이유: `Word` 가 `examples` 를 필수로 요구하고,
       *   화면 여러 곳이 `word.examples.length` 를 바로 읽는다.
       */
      examples: [],
      tags: [],
      memo: '',
      ...(typeof o.language === 'string' && o.language !== '' ? { language: o.language } : {}),
      createdAt: str(o.createdAt, updatedAt),
      updatedAt,
    });
  }
  return out;
}

export function toCategories(items: readonly unknown[]): Category[] {
  const out: Category[] = [];
  for (const raw of items) {
    const o = obj(raw);
    const categoryId = int(o.categoryId);
    if (categoryId === null) continue;
    const updatedAt = str(o.updatedAt, str(o.createdAt));
    out.push({
      categoryId,
      categoryName: str(o.categoryName),
      ...(typeof o.description === 'string' && o.description !== ''
        ? { description: o.description }
        : {}),
      displayOrder: int(o.displayOrder) ?? 0,
      createdAt: str(o.createdAt, updatedAt),
      updatedAt,
    });
  }
  return out;
}

export function toResults(items: readonly unknown[]): StoredQuizResult[] {
  const out: StoredQuizResult[] = [];
  for (const raw of items) {
    const o = obj(raw);
    const resultId = int(o.resultId);
    const wordId = int(o.wordId);
    if (resultId === null || wordId === null) continue;
    out.push({
      resultId,
      wordId,
      isCorrect: o.isCorrect === true,
      quizType: str(o.quizType, 'unknown'),
      ...(typeof o.answerType === 'string' && o.answerType !== ''
        ? { answerType: o.answerType }
        : {}),
      /*
       * ⚠ `word` · `correctAnswer` · `userAnswer` 는 서버에 없다(사적인 내용이라 안 보낸다).
       *   통계·스트릭·복습 만기는 이 셋을 쓰지 않는다 — `isCorrect` 와 `takenAt` 만 본다.
       *   오답노트의 "그때 내가 뭐라고 썼나"만 비게 된다.
       */
      takenAt: str(o.takenAt),
    });
  }
  return out;
}

export function toExams(items: readonly unknown[]): unknown[] {
  const out: unknown[] = [];
  for (const raw of items) {
    const o = obj(raw);
    const examId = str(o.examId);
    if (examId === '') continue;
    out.push({
      examId,
      language: str(o.language),
      ...(int(o.categoryId) === null ? {} : { categoryId: int(o.categoryId) }),
      takenAt: str(o.takenAt),
      questions: arr(o.questions),
      attempts: arr(o.attempts),
      score: obj(o.score),
    });
  }
  return out;
}

/**
 * 🔴 **다음 id 를 정한다. 이 한 줄을 틀리면 조용히 망가진다.**
 *
 * 카운터 하나를 단어 · 카테고리 · 퀴즈결과가 **함께** 쓴다. 복구한 뒤 카운터가 낮으면 다음에
 * 추가하는 단어가 이미 쓰인 id 를 받고, **기존 퀴즈 결과가 그 새 단어에 붙는다** —
 * 정답률이 엉뚱한 단어에 표시되고 오류는 안 난다(`backupService` 의 같은 주석).
 */
export function nextIdFor(
  words: readonly Word[],
  categories: readonly Category[],
  results: readonly StoredQuizResult[],
): number {
  let max = 0;
  for (const w of words) max = Math.max(max, w.wordId);
  for (const c of categories) max = Math.max(max, c.categoryId);
  for (const r of results) max = Math.max(max, r.resultId);
  return max + 1;
}

export const restoreService = {
  serverCounts,

  /**
   * 서버에서 전부 당겨 **복원 파일 모양**으로 조립한다. 아직 아무것도 쓰지 않는다.
   *
   * ⚠ 조립까지만 하고 쓰기를 분리한 이유: 다 받은 뒤에야 "몇 개 받았다"를 화면이 말할 수 있고,
   *   받는 중에 실패하면 **기기를 건드리지 않은 채** 물러날 수 있다.
   */
  async fetchAll(): Promise<RestoreResult<{ backup: BackupFile; counts: SyncCounts }>> {
    try {
      const kinds: SyncKind[] = ['categories', 'words', 'results', 'exams'];
      const pages: Partial<Record<SyncKind, unknown[]>> = {};
      for (const kind of kinds) {
        const page = await pullAll(kind);
        if (!page.ok) return page;
        pages[kind] = page.items;
      }

      const categories = toCategories(pages.categories ?? []);
      const words = toWords(pages.words ?? []);
      const quizResults = toResults(pages.results ?? []);
      const exams = toExams(pages.exams ?? []);

      // 🔴 아무것도 없으면 복구가 아니다. 빈 것으로 기기를 덮으면 그게 삭제다
      if (categories.length === 0 && words.length === 0 && quizResults.length === 0) {
        return { ok: false, reason: 'empty' };
      }

      return {
        ok: true,
        backup: {
          schemaVersion: 1,
          appVersion: 'server',
          exportedAt: new Date().toISOString(),
          categories,
          words,
          quizResults,
          nextId: nextIdFor(words, categories, quizResults),
          /*
           * ⚠ **설정을 비워 둔다.** 서버에 테마·언어·알림 시각이 없고, `backupService.restore` 는
           *   *"없으면 건드리지 않는다"* 로 다룬다. 그래서 이 기기의 설정이 그대로 남는다.
           */
          settings: {},
          exams,
        },
        counts: {
          words: words.length,
          categories: categories.length,
          results: quizResults.length,
          exams: exams.length,
        },
      };
    } catch (error: any) {
      console.warn('서버 복구 받기 실패:', error);
      return { ok: false, reason: 'error' };
    }
  },

};
