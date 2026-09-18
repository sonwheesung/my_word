// /check 비교기. current.json(방금 읽은 것)과 last.json(지난 확인)을 순번으로 비교해 보고하고 last.json 을 갱신한다.
// 원본: C:/project/common/FIX_REQUESTS.md §7.3. 여기서 고치지 말고 원본을 고친 뒤 다시 복사한다.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const here = new URL('.', import.meta.url);
const NL = String.fromCharCode(10);
let cur;
try {
  cur = JSON.parse(readFileSync(new URL('current.json', here), 'utf8'));
} catch (e) {
  console.log('멈춤: current.json 을 읽지 못했다. 지난 기록은 그대로 둔다.');
  process.exit(1);
}
if (!cur || cur.ok !== true || typeof cur.tab !== 'string' || !Array.isArray(cur.rows)) {
  console.log('멈춤: 시트를 제대로 읽지 못했다(' + (cur && cur.reason) + '). 지난 기록은 그대로 둔다.');
  process.exit(1);
}

const lastUrl = new URL('last.json', here);
const prev = existsSync(lastUrl) ? JSON.parse(readFileSync(lastUrl, 'utf8')) : null;
const first = (s) => String(s || '').split(NL)[0];
const state = (r) => (r.final ? '회색 최종 확인' : r.verified ? '빨간색 화면 확인' : r.fixed ? '갈색 수정 완료' : '흰색 할 일');
const label = (r) => '#' + r.no + ' [' + (r.screen || '화면 미기재') + '] ' + first(r.text);
const numbered = cur.rows.filter((r) => String(r.no) !== '');
const unnumbered = cur.rows.filter((r) => String(r.no) === '');
const out = [];

if (!prev) {
  out.push('처음 확인이다. 비교할 기록이 없어 지금 ' + numbered.length + '건을 기준으로 저장한다.');
} else {
  if (prev.tab !== cur.tab) out.push('⚠ 지난번 탭(' + prev.tab + ')과 이번 탭(' + cur.tab + ')이 다르다. 비교 결과를 믿지 말 것.');
  const before = new Map(prev.rows.filter((r) => String(r.no) !== '').map((r) => [String(r.no), r]));
  const now = new Map(numbered.map((r) => [String(r.no), r]));
  const added = numbered.filter((r) => !before.has(String(r.no)));
  const removed = [...before.values()].filter((r) => !now.has(String(r.no)));
  const edited = [];
  const status = [];
  for (const r of numbered) {
    const p = before.get(String(r.no));
    if (!p) continue;
    if (p.screen !== r.screen || p.text !== r.text) edited.push([p, r]);
    else if (p.fixed !== r.fixed || p.verified !== r.verified || p.final !== r.final || p.note !== r.note) status.push([p, r]);
  }
  out.push('지난 확인: ' + prev.readAt);
  out.push('신규 ' + added.length + ' · 내용 수정 ' + edited.length + ' · 삭제 ' + removed.length + ' · 상태 변경 ' + status.length);
  if (added.length) out.push('', '[신규]', ...added.map(label));
  if (edited.length) out.push('', '[내용 수정]', ...edited.map(([p, r]) => label(r) + '  (이전: ' + first(p.text) + ')'));
  if (removed.length) out.push('', '[삭제]', ...removed.map(label));
  if (status.length) out.push('', '[상태 변경]', ...status.map(([p, r]) => label(r) + '  ' + state(p) + ' → ' + state(r)));
}
if (unnumbered.length) out.push('', '[번호 없는 줄] 자동 입력이 아직 안 된 줄이다. 시트에서 아무 칸이나 한 번 편집하면 채워진다', ...unnumbered.map((r) => '[' + (r.screen || '화면 미기재') + '] ' + first(r.text)));
const todo = numbered.filter((r) => !r.fixed);
out.push('', '할 일(흰색) ' + todo.length + '건', ...todo.map(label));

console.log(out.join(NL));
writeFileSync(lastUrl, JSON.stringify(cur, null, 2));
