---
name: check
description: 프로젝트 별 수정사항 시트에서 이 프로젝트 탭을 읽고, 지난 확인 이후 신규·내용 수정·삭제·상태 변경된 수정사항과 할 일을 보고한다. 사용자가 "/check", "수정사항 확인", "새 수정사항 있어?" 라고 하면 실행한다.
---

# /check — 수정사항 확인

정본 규칙은 `C:/project/common/FIX_REQUESTS.md` 다. 이 스킬은 **읽고 알려 주기만** 한다.

1. 크롬 **새 탭**으로 시트를 연다: https://docs.google.com/spreadsheets/d/1w09QLGQKidkDqsPyBJbfy1hT-RCoIyDEbT05Qt7vf8c/edit
2. 그 탭에서 `FIX_REQUESTS.md` §7.4 의 읽기 코드를 실행한다. `TAB` 은 `my_word` 이다
3. 결과가 `ok: false` 면 멈추고 알린다
   - `tab-missing` 이면 내 탭이 없다는 뜻이다. `FIX_REQUESTS.md` §2 대로 탭을 만들지 관리자에게 묻는다
   - `tab-list-unreadable` 이면 시트 화면이 바뀐 것이다. 추측해서 읽지 않는다
4. 결과 JSON 을 **그대로** `.claude/skills/check/current.json` 에 파일 쓰기 도구로 저장한다
5. `node .claude/skills/check/diff.mjs` 를 실행한다
6. 출력 내용을 관리자에게 기획자 말투로 보고한다. 신규와 내용 수정을 먼저 말한다
7. 무엇부터 처리할지 묻는다. 시트와 코드는 건드리지 않는다
8. 연 탭을 닫는다
