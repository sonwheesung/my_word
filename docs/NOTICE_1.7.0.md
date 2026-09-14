# 1.7.0 공지사항 초안

공통 서버 관리 콘솔 `공지` 탭에 넣는다. 🔴 **사장님 검수 전 초안이다**(`common/KOREAN_WRITING.md` §2).

- 종류: `update` · 고정: 하지 않음(제안)
- 🔴 **발행은 사장님이 콘솔에서 한다.** 공지는 올리는 즉시 모든 사용자에게 보인다. 관리자 토큰도 사장님이 넣는다
- 본문은 줄바꿈만 살아나는 평문이다. 마크다운 기호(`**`, `#`)를 쓰지 않는다(`NoticeScreen` 이 렌더러 없이 그대로 보여 준다)
- 패치 내용은 `docs/RELEASE_NOTES_1.7.0.md` 와 같은 문장을 쓴다(스토어에 나간 설명과 앱 안 설명이 어긋나지 않게)
- 문의 경로는 실제 화면 기준이다: 홈 오른쪽 위 톱니바퀴(설정) → `문의하기` / `Contact Us`
- ⚠ **개별 답변은 약속하지 않는다.** 문의 화면이 이미 *"답변 확인 기능은 준비 중입니다"* 라고 안내한다
- ⚠ **"모두 개발하겠다"고 쓰지 않는다.** 사장님 문장은 *"검토 후 개발한다"* 라서 우선순위를 정한다는 표현으로 옮겼다

⚠ **영어 칸은 지금 스토어 앱(1.7.0)에서는 보이지 않는다.** 영어 공지를 고르는 기능은 2026-09-14 에 코드에 넣었고
다음 스토어 버전부터 나간다. 그전까지는 영어·일본어 앱 사용자에게도 한국어가 보인다.
영어 칸을 지금 채워 두면 그 버전으로 올라온 영어·일본어 사용자에게 영어가 보인다(제목과 본문 둘 다 있어야 한다).

---

## 한국어 (필수)

**제목**

```
플래시카드가 추가되었어요 (1.7.0)
```

**본문**

```
안녕하세요, My Word입니다.
1.7.0 업데이트 내용을 안내드립니다.

[새로워진 점]
• 플래시카드가 추가되었습니다. 홈 화면에서 바로 시작할 수 있습니다
• 카드를 탭하면 뒤집히고, 좌우로 밀어 앞뒤 단어로 넘길 수 있습니다
• 순서를 등록순·무작위·복습순 중에서 고를 수 있습니다
• 앞면에 단어와 뜻 중 무엇을 보일지 정할 수 있고, 발음을 자동으로 들을 수도 있습니다
• 플래시카드는 채점하지 않아 정답률과 복습 일정이 바뀌지 않습니다. 다 본 뒤에는 바로 퀴즈를 풀 수 있습니다

[원하시는 기능을 알려 주세요]
My Word에 있었으면 하는 기능이나 불편한 점이 있다면 문의하기로 보내 주세요.
보내 주신 의견은 꼼꼼히 검토한 뒤 우선순위를 정해 개발하겠습니다.

문의하기 위치: 홈 화면 오른쪽 위 톱니바퀴(설정) → 문의하기

감사합니다.
```

## English (선택)

**Title**

```
New in 1.7.0: Flashcards
```

**Body**

```
Hello from My Word.
Here's what's new in version 1.7.0.

[What's new]
• New: Flashcards, right from the home screen
• Tap a card to flip it, and swipe left or right to move between words
• Choose the order: Date added, Shuffle, or Review due
• Pick whether the front shows the word or the meaning, and turn on auto-play audio
• Flashcards aren't graded, so your accuracy and review schedule stay the same. When you're done, go straight into a quiz

[Tell us what you'd like to see]
Is there a feature you'd love in My Word, or something that gets in your way? Send it to us through Contact Us.
We review every message and decide what to build next.

Where to find it: Home screen, gear icon (Settings) at the top right, then Contact Us

Thank you!
```
