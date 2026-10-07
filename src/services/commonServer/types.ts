// 공통 서버 클라이언트 SDK — 타입.
//
// ⚠️ 원본: common_server/client/types.ts 에서 복사 (2026-10-07, SDK_VERSION 2026-10-07).
//    이 파일은 손으로 고치지 말 것 — 서버 계약이 바뀌면 원본을 갱신하고 다시 복사한다.
//    (앱 4~5개 규모엔 monorepo·npm 패키지 오버헤드가 이득보다 크다는 판단)
//
// 이 폴더는 각 앱의 `src/services/commonServer/`로 **복사해서** 쓴다(앱 4~5개 규모에선 monorepo·npm 패키지
// 오버헤드가 이득보다 크다). 복사본에는 어느 버전에서 가져왔는지 주석을 남긴다.
// 의존성 0 — react-native를 import하지 않으므로 Expo·웹·Node 어디서나 그대로 돈다.

export type SupportCategory = 'bug' | 'suggestion' | 'question' | 'etc';

export type FailReason =
  | 'not-configured' // 서버 URL이 빌드에 안 박혔거나, 서버가 로그인을 아직 못 여는 상태(503)
  | 'offline' // 네트워크 불가 / 타임아웃
  | 'too-short' // 본문이 최소 길이 미만
  | 'rate-limited' // 접수 한도 초과
  | 'not-found' // 앱 미등록/비활성 (서버에 app_code가 없음)
  | 'unauthorized' // 로그인 실패 / 세션 만료·무효 (세션은 이 시점에 폐기된다)
  | 'not-signed-in' // 로컬에 세션이 없음 — 서버에 물어보지도 않은 상태
  // ── AI 시험 (SDK 2026-10-07) ──
  // 🔴 둘을 'rate-limited' 로 접지 않는다. 사용자가 할 일이 서로 다르다:
  //    quota-exhausted → 기다려도 안 풀린다. 구독해야 한다
  //    unavailable     → 기다리면 풀린다. 재시도가 의미 있다
  | 'quota-exhausted' // 무료 시험 횟수를 다 썼다 (403)
  | 'unavailable' // 창고도 비고 모델도 못 불렀다 (503). **무료 횟수는 소모되지 않았다**
  | 'error'; // 서버 오류

export type Result<T> = ({ ok: true } & T) | { ok: false; reason: FailReason };

export interface AnnouncementItem {
  id: string;
  kind: string; // notice | event | update
  title: string;
  body: string;
  pinned: boolean;
  startsAt: string; // ISO — 앱에서 "등록일"로 표시
  // 영어 제목·본문(SDK 2026-09-14). 서버에서 영어 공지를 켠 앱만 온다. 끈 앱은 키 자체가 없다.
  // 직접 고르지 말고 localizeAnnouncement() 를 쓴다(제목만 영어인 공지를 막는 규칙이 거기 있다).
  titleEn?: string | null;
  bodyEn?: string | null;
}

export interface Bootstrap {
  maintenance: { active: false } | { active: true; title: string; body: string };
  version: {
    min: string | null; // 이 미만 = 강제 업데이트(진입 차단)
    latest: string | null; // 이 미만 = 소프트 안내
    androidUrl: string | null;
    iosUrl: string | null;
  };
  announcements: AnnouncementItem[];
}

// ───────────────────────── 로그인 ─────────────────────────

/** 지금 서버가 검증할 수 있는 공급자. kakao·apple은 서버에 검증기가 붙는 시점에 열린다. */
export type AuthProviderId = 'google' | 'kakao' | 'apple';

/** 우리 서버가 아는 "나". providerId(구글 sub 등)는 앱에 내려주지 않는다. */
export interface Subject {
  id: string;
  email: string | null; // 공급자가 email_verified로 확인해 준 주소만 채워진다
  provider?: string;
  createdAt?: string;
}

export interface MyInquiry {
  id: string;
  category: SupportCategory;
  content: string;
  /** 대기 → 확인 중 → 답변함 / 완료.
   *  `reviewing`은 "접수됐고 보고 있는데 아직 답이 없다"는 뜻이다 — 사용자에게 그대로 보여줄 만한 상태다.
   *  ⚠ 여기 없는 값이 올 수도 있다고 가정하고 분기할 것(서버가 상태를 늘려도 앱이 안 깨지게). */
  status: 'open' | 'reviewing' | 'replied' | 'resolved';
  /** 운영자 답변. 이게 로그인의 존재 이유다(익명 문의는 돌려줄 경로가 없다). */
  reply: string | null;
  createdAt: string;
  repliedAt: string | null;
}

/** 엔타이틀먼트(구독) 상태. 서버가 계산해서 내려준다 — 앱이 만료를 다시 판정하지 않는다. */
export interface EntitlementView {
  active: boolean;
  /** ISO. 오프라인 캐시의 유효기한이다. 유예 중이면 유예 종료 시각이 온다. */
  expiresAt: string | null;
  willRenew: boolean;
  /** 결제 실패 유예 중. 활성이지만 곧 끊길 수 있어 안내를 띄울 수 있다. */
  inGracePeriod: boolean;
}

/**
 * 세션 토큰을 앱 재실행 후에도 유지하려면 저장소를 넘긴다.
 * SDK는 의존성 0을 지켜야 해서 AsyncStorage를 직접 import하지 않는다 — 앱이 주입한다.
 *
 *   import AsyncStorage from '@react-native-async-storage/async-storage';
 *   createCommonServer({ ..., storage: AsyncStorage })
 *
 * 넘기지 않으면 세션은 **메모리에만** 산다(앱을 껐다 켜면 다시 로그인해야 한다).
 */
export interface SessionStorage {
  getItem(key: string): Promise<string | null> | string | null;
  setItem(key: string, value: string): Promise<void> | void;
  removeItem(key: string): Promise<void> | void;
}

export interface CommonServerConfig {
  /** EXPO_PUBLIC_SERVER_URL 등. 빈 문자열이면 모든 호출이 'not-configured'로 떨어진다. */
  baseUrl: string;
  /** 서버 `apps` 테이블에 등록된 코드. */
  appCode: string;
  /** 앱 버전 — 진단·버전 게이트 비교용. */
  appVersion: string;
  /** 'ios' | 'android' | 'web' — RN이면 Platform.OS를 넘긴다(SDK는 RN에 의존하지 않는다). */
  platform: string;
  /** 기본 10초. */
  timeoutMs?: number;
  /** 세션 영속화. 없으면 메모리 전용 — 로그인 없는 앱은 넘기지 않아도 된다. */
  storage?: SessionStorage;
}

// ── AI 시험 (SDK 2026-10-07) ──────────────────────────────────────────────
//
// 🔴 **객관식 정답을 앱이 받는다.** 숨기면 채점마다 서버를 불러야 하고, 그러면 구독을 끊은
//    사람이 재시험조차 못 치고 오프라인에서 이어 풀 수도 없다. 잃는 것은 "앱을 뜯으면 정답을
//    알 수 있다"인데 그건 자기 학습을 자기가 망치는 것이라 막을 가치가 없다.

export interface ExamQuestion {
  id: string;
  /** 이 문제가 묻는 단어. 사용자 단어장의 단어와 같은 문자열이다(정규화된 형태) */
  word: string;
  /** `meaning` | `form` | `usage` — 같은 단어의 문제가 서로 다른 축을 묻는다 */
  axis: string;
  /** `choice` | `blank`. 지금은 전부 choice 다(blank 는 다음 단계) */
  format: string;
  /** 문제 본문. **대상 언어로 쓰여 있다**(일본어 시험이면 일본어) */
  prompt: string;
  /** 보기 4개. **전부 대상 언어다** — 창고를 여러 언어 사용자가 나눠 쓰기 때문이다 */
  choices: string[];
  /** `choices` 의 인덱스 */
  answerIndex: number;
  /**
   * 요청한 UI 언어의 뜻과 해설.
   * 🔴 **`null` 일 수 있다.** 그 언어의 해설이 아직 만들어지지 않은 문제다 —
   *    화면이 이 칸을 비워 둔 채로 그릴 수 있어야 한다. 에러가 아니다.
   */
  meaning: string | null;
  explanation: string | null;
}

export interface ExamResponse {
  ok: true;
  examId: string | null;
  language: string;
  questions: ExamQuestion[];
  /** 남은 무료 판수. **구독자는 `null`**(무제한) — 0 과 구별해서 다룬다 */
  remaining: number | null;
  subscribed: boolean;
  /** 이번에 새로 만든 문제 수. 0 이면 전부 창고에서 나왔다(= 빨랐다) */
  created: number;
  /**
   * 새 문제를 못 만든 사유. `null` 이면 정상.
   * `daily` · `budget` · `cooldown` · `word-cap` · `not-configured` · 모델 실패 코드.
   * ⚠ **에러가 아니다.** 시험은 정상으로 나왔고 창고에서만 낸 것이다.
   */
  degraded: string | null;
}
