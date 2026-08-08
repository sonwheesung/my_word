# 1.2.0 출시 노트

Play Console 업로드 시 언어별로 붙여넣는다. 등록정보 언어가 ko-KR · en-US · ja-JP
세 개이므로 **세 언어 모두 입력해야 출시할 수 있다.**

- 입력 위치: `프로덕션 → 새 버전 만들기 → 출시 노트`
- 언어당 상한 500자. 아래는 모두 상한 이내다
- Play 콘솔은 서식을 지원하지 않는다. 아래 텍스트를 **그대로** 붙여넣는다

---

## 한국어 (ko-KR)

```
• 앱 언어를 한국어와 영어 중에서 고를 수 있습니다 (설정 → 언어)
• 일본어·중국어·아랍어 등 어떤 언어의 단어든 입력한 그대로 저장됩니다
• 단어 읽어주기가 글자에서 언어를 알아내 알맞은 음성으로 읽습니다
• 사전 검색이 영어 외의 단어도 지원합니다 (예문은 영어 단어만)
• 독일어처럼 대문자가 철자인 단어가 소문자로 바뀌던 문제를 고쳤습니다
```

## English (en-US)

```
• Choose the app language between English and Korean (Settings → Language)
• Words in any language — Japanese, Chinese, Arabic and more — are saved exactly as you type them
• Pronunciation playback now detects the language and picks the matching voice
• Dictionary lookup works for non-English words too (examples are English-only)
• Fixed capitalization being stripped from words like German nouns
```

## 日本語 (ja-JP)

```
• アプリの表示言語を英語と韓国語から選べます（設定 → 言語）
• 日本語・中国語・アラビア語など、どの言語の単語も入力したとおりに保存されます
• 読み上げが文字から言語を判別して適切な音声を選ぶようになりました
• 辞書検索が英語以外の単語にも対応しました（例文の取得は英単語のみ）
• ドイツ語の名詞など、大文字が小文字に変わってしまう問題を修正しました
```

---

## 빌드 정보

| 항목 | 값 |
|---|---|
| 버전 | 1.2.0 |
| versionCode | 13 |
| 빌드 ID | `88826c3f-0061-472c-9867-ffd61f7c5d3b` |
| AAB | https://expo.dev/artifacts/eas/XMxZnhdRQ8FnozEKQlnp4S3zns-Pra0ZX9vReBVQytQ.aab |
| 로그 | https://expo.dev/accounts/shs00925/projects/my-word-front/builds/88826c3f-0061-472c-9867-ffd61f7c5d3b |

## 업로드 전 확인

1. **스토어 등록정보(en-US · ja-JP) 검토가 끝났는지** — 제출 12. 겹쳐서 올리면 반려 시
   등록정보 문제인지 APK 문제인지 구분이 어려워진다
2. 배포 국가 145개국은 **이미 출시 완료**(제출 11)라 이번 업로드와 무관하다
3. 출시 노트 3개 언어를 모두 입력했는지 — 하나라도 비면 출시 버튼이 막힌다

## 이번 릴리즈에 포함되지 않은 것

- EEA·영국·스위스 배포 (AdMob 동의 UMP 미연동)
- 아랍어·히브리어 RTL 레이아웃
- 개인정보처리방침 영문·일본어
- 앱 UI 일본어 (스토어 등록정보만 일본어이고 앱 안은 한국어·영어다 —
  일본어 등록정보 본문에 이 사실을 명시해 두었다)
