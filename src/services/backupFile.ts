import { Platform } from 'react-native';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';

import { backupService, type BackupFile, type BackupError } from './backupService';

/**
 * 백업 파일의 **입출력**만 담당한다 — 내용에 대한 판단은 `backupService` 가 한다.
 *
 * 🔴 왜 갈라 놓았나. `backupService` 는 네이티브 모듈을 하나도 import 하지 않는다.
 *    그래야 "복원 후 통계가 같은가"라는 핵심 검증이 expo-file-system 목에 딸려 죽지 않는다.
 *    (2026-09-01 에 목이 빠져 스위트 7개가 통째로 죽고도 "26/26 통과"로 보인 적이 있다)
 *    파일을 만지는 것은 전부 여기에 모으고, 여기는 화면에서만 부른다.
 */

/** 웹에는 공유 시트도 문서 선택기도 없다. 화면이 이 값으로 섹션째 감춘다 */
const isSupported = Platform.OS === 'ios' || Platform.OS === 'android';

export type ExportOutcome =
  | { status: 'shared'; fileName: string }
  | { status: 'unsupported' }
  | { status: 'error' };

export type ImportOutcome =
  | { status: 'picked'; data: BackupFile; fileName: string }
  | { status: 'canceled' }
  | { status: 'unsupported' }
  | { status: 'invalid'; reason: BackupError }
  | { status: 'error' };

/** `myword-backup-2026-09-07.json` — 파일명만 보고 언제 것인지 알 수 있어야 한다 */
function buildFileName(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  return `myword-backup-${stamp}.json`;
}

/**
 * 캐시에 파일을 쓴다.
 *
 * ⚠ `Paths.document` 가 아니라 `Paths.cache` 다. 공유 시트로 넘기고 나면 사용자가 고른 곳에
 *   사본이 생기므로, 앱 안에 원본을 계속 들고 있을 이유가 없다. document 에 쌓으면 백업할
 *   때마다 앱 용량이 늘고 사용자는 그것을 지울 방법이 없다.
 */
function writeToCache(fileName: string, text: string): File {
  const file = new File(Paths.cache, fileName);
  // 같은 날 두 번 내보내면 이름이 겹친다. 덮어쓴다 — 캐시라 잃을 것이 없다.
  file.create({ overwrite: true });
  file.write(text);
  return file;
}

export const backupFile = {
  isSupported(): boolean {
    return isSupported;
  },

  buildFileName,

  /**
   * 지금 상태를 파일로 만들어 **공유 시트**로 넘긴다.
   *
   * 저장 위치를 앱이 정하지 않는 것이 핵심이다 — 사용자가 드라이브·메일·파일앱 중
   * 원하는 곳을 고른다. 앱이 특정 폴더에 쓰면 그 폴더를 사용자가 찾지 못한다.
   */
  async exportToFile(): Promise<ExportOutcome> {
    if (!isSupported) return { status: 'unsupported' };
    try {
      if (!(await Sharing.isAvailableAsync())) return { status: 'unsupported' };

      const backup = await backupService.create();
      const fileName = buildFileName();
      const file = writeToCache(fileName, backupService.serialize(backup));

      await Sharing.shareAsync(file.uri, {
        mimeType: 'application/json',
        dialogTitle: fileName,
        UTI: 'public.json',
      });
      return { status: 'shared', fileName };
    } catch {
      // 사용자가 공유 시트를 닫는 것도 여기로 올 수 있다. 화면에서는 조용히 끝낸다.
      return { status: 'error' };
    }
  },

  /**
   * 복원 **직전**에 현재 상태를 자동으로 한 벌 내보낸다.
   *
   * 🔴 잘못 눌렀을 때의 유일한 방어선이다. 복원은 되돌릴 수 없으므로, 사용자가 확인을
   *    누른 뒤에도 이 파일이 남아 있어야 한다. 공유 시트를 띄우지 않고 조용히 캐시에만 쓴다
   *    — 이 순간에 시트를 띄우면 복원 흐름이 끊긴다.
   *
   * @returns 만든 파일 경로. 실패하면 null (실패해도 복원 자체는 막지 않는다)
   */
  async writeSafetyCopy(): Promise<string | null> {
    if (!isSupported) return null;
    try {
      const backup = await backupService.create();
      const file = writeToCache(`myword-before-restore.json`, backupService.serialize(backup));
      return file.uri;
    } catch {
      return null;
    }
  },

  /**
   * 파일을 고르게 하고 **검사까지 마친** 결과를 준다. 복원은 아직 하지 않는다 —
   * 화면이 사용자에게 양쪽 숫자를 보여 주고 확인을 받은 뒤에 `backupService.restore` 를 부른다.
   */
  async pickAndParse(): Promise<ImportOutcome> {
    if (!isSupported) return { status: 'unsupported' };
    try {
      const picked = await DocumentPicker.getDocumentAsync({
        // 🔴 안드로이드는 content:// URI 를 준다. copyToCacheDirectory 로 file:// 사본을
        //    받아야 File 로 읽을 수 있다.
        copyToCacheDirectory: true,
        // JSON 만 걸러도 파일 관리자에 따라 확장자 없는 사본이 보인다. 그래서 타입은
        // 좁게 걸되, 실제 판정은 내용(parse)으로 한다.
        type: ['application/json', 'text/plain', '*/*'],
        multiple: false,
      });

      if (picked.canceled) return { status: 'canceled' };
      const asset = picked.assets.length > 0 ? picked.assets[0] : null;
      if (!asset) return { status: 'error' };

      const text = await new File(asset.uri).text();
      const parsed = backupService.parse(text);
      if (!parsed.ok) return { status: 'invalid', reason: parsed.reason };

      return { status: 'picked', data: parsed.data, fileName: asset.name };
    } catch {
      return { status: 'error' };
    }
  },
};
