import type { Word } from '../src/types/word';

/**
 * CSV **생성기 — 테스트 전용이다.**
 *
 * 🔴 2026-10-12 에 공유(CSV 내보내기) 기능을 앱에서 **없앴다**(사장님 결정).
 *    그때 `shareService.exportWordsToCSV` 도 같이 지우면 **가져오기 파서의 보호막이 함께 무너진다** —
 *    `shareService.test.ts` 의 왕복·퍼즈 검사가 전부 `parseCSV(exportWordsToCSV(words))` 모양이다.
 *    그래서 **앱에서는 빼고, 테스트의 생성기로만 남긴다.** `src/` 에 쓰이지 않는 코드를 두지 않는다.
 *
 * ⚠ **이 파일이 지키는 것이 달라졌다는 것을 알고 써라.**
 *   전에는 *"우리가 내보낸 것을 우리가 다시 읽을 수 있다"* 는 제품 보증이었다.
 *   이제 내보내지 않으므로, 남은 값은 *"파서가 따옴표·콤마·줄바꿈을 제대로 푼다"* 뿐이다.
 *   사용자가 실제로 붙여 넣는 CSV(엑셀 등)는 이 생성기와 모양이 다를 수 있다.
 *
 * ⚠ `__tests__/` 밖에 둔다 — 안에 두면 jest 가 **테스트 파일로 보고** "테스트가 없다"로 실패한다.
 */

function escapeCSVField(field: string): string {
  // 콤마, 큰따옴표, 줄바꿈 포함 시 큰따옴표로 감싸기
  if (field.includes(',') || field.includes('"') || field.includes('\n') || field.includes('\r')) {
    return '"' + field.replace(/"/g, '""') + '"';
  }
  return field;
}

/** 형식: `단어,뜻1|뜻2,예문1::번역1|예문2::번역2,태그1|태그2,메모` */
export function exportWordsToCSV(words: Word[]): string {
  const header = '단어,뜻,예문,태그,메모';
  const rows = words.map((word) => {
    const meaningsStr = word.meanings.join('|');

    const examplesStr = word.examples
      .map((ex) => {
        const translation = ex.translation ? `::${ex.translation}` : '';
        return `${ex.example}${translation}`;
      })
      .join('|');

    const tagsStr = (word.tags ?? []).join('|');
    const memoStr = word.memo ?? '';

    return [
      escapeCSVField(word.word),
      escapeCSVField(meaningsStr),
      escapeCSVField(examplesStr),
      escapeCSVField(tagsStr),
      escapeCSVField(memoStr),
    ].join(',');
  });

  return [header, ...rows].join('\n');
}
