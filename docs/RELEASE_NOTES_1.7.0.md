# 1.7.0 출시 노트

Play Console `프로덕션 → 새 버전 만들기 → 출시 노트` 에 언어별로 넣는다.
등록정보 언어가 ko-KR · en-US · ja-JP 세 개라 **세 언어 모두 있어야 출시할 수 있다.**

- 언어당 상한 500자. Play 콘솔은 서식을 지원하지 않는다
- 이번 릴리스에 사용자에게 보이는 변경은 **플래시카드 하나뿐이다.** 1.6.0 게시(2026-09-08) 이후
  코드 커밋 셋(`aa391eb` · `097a246` · `333578e`)이 전부 플래시카드와 그 화면 정리다
- 🚫 R8 설정(`optimizedShrinking`)은 적지 않는다. 사용자에게 의미가 없는 내부 사정이다(`CLAUDE.md` R8 절)
- 🔴 **한국어 문안은 검수 대상이다**(`common/KOREAN_WRITING.md` §2). 사장님 검수 전 초안이다
- 앱 안의 이름을 그대로 쓴다: ko `플래시카드` · en `Flashcards` · ja `単語カード`,
  순서는 `등록순·무작위·복습순` / `Date added · Shuffle · Review due` / `登録順・ランダム・復習順`

---

## 한국어 (ko-KR)

```
• 플래시카드가 추가되었습니다. 홈 화면에서 바로 시작할 수 있습니다
• 카드를 탭하면 뒤집히고, 좌우로 밀면 다음 단어로 넘어갑니다
• 순서를 등록순·무작위·복습순 중에서 고를 수 있습니다
• 앞면에 단어와 뜻 중 무엇을 보일지 정할 수 있고, 발음을 자동으로 들을 수도 있습니다
• 플래시카드는 채점하지 않아 정답률과 복습 일정이 바뀌지 않습니다. 다 본 뒤 퀴즈로 이어서 풀 수 있습니다
```

## English (en-US)

```
• New: Flashcards, right from the home screen
• Tap a card to flip it, and swipe left or right to move between words
• Choose the order: Date added, Shuffle, or Review due
• Pick whether the front shows the word or the meaning, and turn on auto-play audio
• Flashcards aren't graded, so your accuracy and review schedule stay the same. When you're done, go straight into a quiz
```

## 日本語 (ja-JP)

```
• 単語カードを追加しました。ホーム画面からすぐに始められます
• カードをタップするとめくれ、左右にスワイプすると次の単語に進みます
• 順番を登録順・ランダム・復習順から選べます
• 表に単語と意味のどちらを出すか選べ、発音の自動再生もできます
• 単語カードは採点しないため、正答率や復習スケジュールは変わりません。見終わったらそのままクイズに進めます
```
