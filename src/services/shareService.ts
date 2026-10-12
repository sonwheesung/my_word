import { wordService } from './wordService';
import { normalizeForCompare } from '../utils/text';
import type { Word, WordExample } from '../types/word';

export interface ParsedWord {
  word: string;
  meanings: string[];
  examples: WordExample[];
  tags: string[];
  memo: string;
}

export interface ParseResult {
  success: ParsedWord[];
  errors: { line: number; content: string; reason: string }[];
}

export interface DuplicateCheckResult {
  newWords: ParsedWord[];
  duplicateWords: ParsedWord[];
}

// --- CSV 언이스케이프 (읽기 전용) ---
//
// 🔴 **쓰는 쪽은 2026-10-12 에 빠졌다** — 공유(CSV 내보내기) 기능을 없앴다(사장님 결정).
//    `escapeCSVField` · `exportWordsToCSV` 는 `test-utils/csvWriter.ts` 로 옮겼다.
//    지우지 않고 옮긴 이유: 이 파서의 **왕복·퍼즈 검사**가 전부 그 생성기를 쓴다 —
//    같이 지웠으면 가져오기 파서의 보호막이 함께 무너졌을 것이다.
//    ⚠ `src/` 에는 쓰이지 않는 코드를 남기지 않는다.

/**
 * CSV 전체를 레코드 단위로 분리한다.
 * 큰따옴표로 감싸인 필드 안의 줄바꿈은 레코드 구분자로 취급하지 않는다.
 * (내보내기가 메모/예문의 줄바꿈을 따옴표로 감싸 저장하므로 필수)
 *
 * @returns 레코드 본문과, 에러 표시에 사용할 시작 물리 줄 번호
 */
function splitCSVRecords(csv: string): Array<{ text: string; line: number }> {
  const records: Array<{ text: string; line: number }> = [];
  let current = '';
  let physicalLine = 1;
  let startLine = 1;
  let inQuotes = false;
  let i = 0;

  while (i < csv.length) {
    const char = csv[i];

    if (char === '"') {
      // 따옴표 안의 "" 는 이스케이프된 큰따옴표이므로 상태를 바꾸지 않는다
      if (inQuotes && csv[i + 1] === '"') {
        current += '""';
        i += 2;
        continue;
      }
      inQuotes = !inQuotes;
      current += char;
      i++;
      continue;
    }

    // 따옴표 밖의 줄바꿈만 레코드 경계
    if (!inQuotes && (char === '\n' || char === '\r')) {
      if (char === '\r' && csv[i + 1] === '\n') i++; // CRLF 를 한 줄로 취급
      records.push({ text: current, line: startLine });
      current = '';
      physicalLine++;
      startLine = physicalLine;
      i++;
      continue;
    }

    // 따옴표 안의 줄바꿈은 본문으로 보존하되 물리 줄 번호는 증가
    if (char === '\n') physicalLine++;
    current += char;
    i++;
  }

  if (inQuotes) {
    // 따옴표가 닫히지 않은 채 입력이 끝났다면 CSV 가 깨진 것이다.
    // 손상 범위가 뒤쪽 줄 전체로 번지지 않도록 줄 단위 분리로 되돌린다.
    for (const chunk of current.split('\n')) {
      records.push({ text: chunk, line: startLine });
      startLine++;
    }
  } else {
    records.push({ text: current, line: startLine });
  }

  return records;
}

function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;
  let i = 0;

  while (i < line.length) {
    const char = line[i];

    if (inQuotes) {
      if (char === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          // 이스케이프된 큰따옴표
          current += '"';
          i += 2;
        } else {
          // 큰따옴표 종료
          inQuotes = false;
          i++;
        }
      } else {
        current += char;
        i++;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
        i++;
      } else if (char === ',') {
        fields.push(current);
        current = '';
        i++;
      } else {
        current += char;
        i++;
      }
    }
  }
  fields.push(current);
  return fields;
}


export const shareService = {
  /**
   * CSV 문자열을 파싱하여 ParsedWord 배열로 변환
   */
  parseCSV(csv: string): ParseResult {
    const success: ParsedWord[] = [];
    const errors: ParseResult['errors'] = [];

    const records = splitCSVRecords(csv).filter((r) => r.text.trim().length > 0);

    if (records.length === 0) {
      return { success, errors };
    }

    // 첫 줄이 헤더인지 확인 (한글 '단어' 포함 시 스킵)
    let startIndex = 0;
    if (records[0].text.includes('단어') && records[0].text.includes('뜻')) {
      startIndex = 1;
    }

    for (let i = startIndex; i < records.length; i++) {
      const line = records[i].text.trim();
      const lineNumber = records[i].line;

      try {
        const fields = parseCSVLine(line);

        const wordText = (fields[0] ?? '').trim();
        const meaningsRaw = (fields[1] ?? '').trim();

        // 필수 필드 검증
        if (!wordText) {
          errors.push({ line: lineNumber, content: line, reason: '단어가 비어있습니다' });
          continue;
        }
        if (!meaningsRaw) {
          errors.push({ line: lineNumber, content: line, reason: '뜻이 비어있습니다' });
          continue;
        }

        const meanings = meaningsRaw.split('|').map((m) => m.trim()).filter((m) => m.length > 0);
        if (meanings.length === 0) {
          errors.push({ line: lineNumber, content: line, reason: '뜻이 비어있습니다' });
          continue;
        }

        // 예문 파싱
        const examplesRaw = (fields[2] ?? '').trim();
        const examples: WordExample[] = [];
        if (examplesRaw.length > 0) {
          const exampleParts = examplesRaw.split('|');
          for (const part of exampleParts) {
            const trimmed = part.trim();
            if (trimmed.length === 0) continue;
            // 첫 '::' 만 구분자로 쓰고 나머지는 전부 번역으로 보존한다.
            // (split('::') 은 본문에 '::' 가 있으면 세 번째 조각부터 통째로 버린다)
            const separatorIndex = trimmed.indexOf('::');
            const example = separatorIndex === -1 ? trimmed : trimmed.slice(0, separatorIndex);
            const translation = separatorIndex === -1 ? '' : trimmed.slice(separatorIndex + 2);
            examples.push({
              example: example.trim(),
              translation: translation.trim() || undefined,
            });
          }
        }

        // 태그 파싱
        const tagsRaw = (fields[3] ?? '').trim();
        const tags = tagsRaw.length > 0
          ? tagsRaw.split('|').map((t) => t.trim()).filter((t) => t.length > 0)
          : [];

        // 메모
        const memo = (fields[4] ?? '').trim();

        success.push({ word: wordText, meanings, examples, tags, memo });
      } catch {
        errors.push({ line: lineNumber, content: line, reason: '파싱 오류' });
      }
    }

    return { success, errors };
  },

  /**
   * 파싱된 단어 목록과 기존 단어를 대조하여 중복 분류
   */
  async checkDuplicates(
    parsed: ParsedWord[],
    categoryId: number,
  ): Promise<DuplicateCheckResult> {
    const existingWords = await wordService.getWords(categoryId);
    // 다른 기기·OS 에서 만든 CSV 는 같은 글자를 NFD 로 담고 있을 수 있다.
    // 정규화하지 않으면 눈에 같은 단어가 중복으로 걸리지 않고 그대로 또 들어온다
    const existingSet = new Set(
      existingWords.map((w) => normalizeForCompare(w.word)),
    );

    const newWords: ParsedWord[] = [];
    const duplicateWords: ParsedWord[] = [];

    for (const pw of parsed) {
      if (existingSet.has(normalizeForCompare(pw.word))) {
        duplicateWords.push(pw);
      } else {
        newWords.push(pw);
      }
    }

    return { newWords, duplicateWords };
  },
};
