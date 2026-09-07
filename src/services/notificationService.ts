import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import i18n from '../i18n';
import { NOTIFY_CHANNEL_ID, NOTIFY_DAYS_AHEAD } from '../constants/appConfig';
import { quizService } from './quizService';
import { computeSlots, type TimeOfDay } from '../utils/notificationSchedule';

/**
 * 학습 리마인더 — **기기 안에서만** 예약되는 로컬 알림.
 *
 * 서버·FCM·푸시토큰을 쓰지 않는다. 앱이 "백엔드 없음"인 이유가 여기서도 유지되고,
 * 알림 문구에 들어가는 단어도 기기 밖으로 나가지 않는다.
 *
 * 🔴 **이 모듈의 함수는 어떤 이유로도 reject 하지 않는다.**
 *    포그라운드 복귀(AppState) 리스너에서 불리는데 그 콜백은 동기라, 새어 나간 rejection 을
 *    잡을 곳이 없어 그대로 ErrorBoundary 까지 올라간다. 알림을 못 걸었다고 **앱에 오류 화면이
 *    뜨면 안 된다** — 하트비트와 같은 계약이다.
 */

export type PermissionState = 'granted' | 'denied' | 'undetermined';

/** 웹에는 이 기능이 없다. import 는 되지만 호출이 깨지므로 진입점에서 막는다 */
const isSupported = Platform.OS === 'ios' || Platform.OS === 'android';

let handlerInstalled = false;

/**
 * 앱이 **떠 있는 동안** 도착한 알림은 띄우지 않는다.
 * 지금 앱을 쓰고 있는 사람에게 "앱을 쓰라"고 알리는 것은 성가시기만 하다.
 */
function installHandler(): void {
  if (handlerInstalled || !isSupported) return;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: false,
      shouldShowList: false,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
  handlerInstalled = true;
}

/**
 * 안드로이드 8+ 는 채널이 없으면 알림이 **조용히 안 뜬다**(오류도 안 난다).
 * ⚠ 채널은 한 번 만들어지면 이름·중요도를 코드로 바꿔도 OS 가 무시한다. 사용자가 직접
 *   시스템 설정에서 바꾼 것을 앱이 되돌리지 못하게 하는 안드로이드의 의도된 동작이다.
 */
async function ensureChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(NOTIFY_CHANNEL_ID, {
    name: i18n.t('학습 알림'),
    // HIGH 로 두면 화면 위로 튀어나온다(헤드업). 복습 권유에 그 정도 방해는 과하다.
    importance: Notifications.AndroidImportance.DEFAULT,
    // 🔴 PUBLIC 이 아니라 PRIVATE 로 둔다. 알림 본문에 **사용자가 저장한 단어**가 들어가는데,
    //    기기 설정에서 "잠금화면에 민감한 내용 숨김"을 켠 사용자는 그 선택이 지켜져야 한다.
    //    PUBLIC 이면 그 설정을 무시하고 잠금화면에 단어가 그대로 뜬다.
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
  });
}

function buildBody(word: string, meaning: string): string {
  // 뜻이 비어 있는 단어도 저장될 수 있다(가져오기 경로).
  return meaning
    ? i18n.t('{{word}} — {{meaning}}, 기억나세요?', { word, meaning })
    : i18n.t('{{word}}, 기억나세요?', { word });
}

export const notificationService = {
  isSupported(): boolean {
    return isSupported;
  },

  /** 지금 권한 상태. 물어보지 않는다 */
  async getPermission(): Promise<PermissionState> {
    if (!isSupported) return 'denied';
    try {
      const { status } = await Notifications.getPermissionsAsync();
      if (status === 'granted') return 'granted';
      if (status === 'denied') return 'denied';
      return 'undetermined';
    } catch {
      return 'denied';
    }
  },

  /**
   * 권한을 요청한다. **사용자가 알림을 켜려고 한 순간에만** 부른다 —
   * 맥락 없이 물으면 거절률이 높고, 안드로이드는 한 번 거절당하면 다시 묻지 못하게 막는다.
   */
  async requestPermission(): Promise<PermissionState> {
    if (!isSupported) return 'denied';
    try {
      const { status } = await Notifications.requestPermissionsAsync();
      return status === 'granted' ? 'granted' : 'denied';
    } catch {
      return 'denied';
    }
  },

  async cancelAll(): Promise<void> {
    if (!isSupported) return;
    try {
      await Notifications.cancelAllScheduledNotificationsAsync();
    } catch {
      // 예약을 못 지웠다고 사용자에게 보여 줄 것은 없다. 다음 재예약이 다시 시도한다.
    }
  },

  /** 지금 걸려 있는 예약 개수. 검증·디버깅용이며 화면에서는 쓰지 않는다 */
  async scheduledCount(): Promise<number> {
    if (!isSupported) return 0;
    try {
      const scheduled = await Notifications.getAllScheduledNotificationsAsync();
      return scheduled.length;
    } catch {
      return 0;
    }
  },

  /**
   * 예약을 **통째로 다시 건다** — 앱이 포그라운드로 올라올 때마다 불린다.
   *
   * 취소 후 다시 거는 것이 이 기능의 전부다. 열 때마다 첫 알림이 내일로 밀리므로
   * "하루 안 쓰면 온다"가 성립한다. 부분 갱신을 하지 않는 이유는, 어떤 예약이 남아 있는지를
   * 상태로 들고 있으면 앱이 죽었다 살아난 뒤 그 상태와 OS 의 실제 예약이 어긋나기 때문이다.
   *
   * @returns 실제로 건 개수. 0이면 알림이 안 온다(권한 없음·단어 없음 등)
   */
  async reschedule(time: TimeOfDay): Promise<number> {
    if (!isSupported) return 0;

    try {
      installHandler();

      // 권한이 없으면 예약해도 뜨지 않는다. 남아 있을지 모르는 예약만 정리하고 끝낸다.
      const permission = await this.getPermission();
      if (permission !== 'granted') {
        await this.cancelAll();
        return 0;
      }

      const words = await quizService.getReminderWords(NOTIFY_DAYS_AHEAD);
      // 단어가 하나도 없으면 알릴 내용이 없다. 빈 앱에 오는 "복습하세요"는 알림을 끄게 만든다.
      if (words.length === 0) {
        await this.cancelAll();
        return 0;
      }

      await ensureChannel();
      await this.cancelAll();

      const slots = computeSlots(new Date(), time, NOTIFY_DAYS_AHEAD);
      const title = i18n.t('오늘 단어 복습할까요?');

      let scheduled = 0;
      for (let i = 0; i < slots.length; i++) {
        // 단어가 예약 일수보다 적으면 돌려 쓴다. 2개뿐이라고 알림을 2번만 보내는 것보다 낫다.
        const pick = words[i % words.length];
        await Notifications.scheduleNotificationAsync({
          content: {
            title,
            body: buildBody(pick.word, pick.meaning),
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: slots[i],
            channelId: NOTIFY_CHANNEL_ID,
          },
        });
        scheduled++;
      }
      return scheduled;
    } catch {
      // 여기서 실패해도 앱은 평소대로 동작해야 한다. 알림이 안 올 뿐이고,
      // 다음에 앱을 열 때 다시 시도한다.
      return 0;
    }
  },
};
