// ─────────────────────────────────────────────────────────────
//  공휴일 목록(holidays.json) 갱신
//  애플 "대한민국 공휴일" 캘린더(아이폰 캘린더 기본 공휴일과 같은 것)를 받아 { 날짜: 이름 } 으로 저장.
//  대체공휴일("광복절(대체 휴일)")·선거일 같은 임시공휴일도 애플이 넣으면 같이 들어옴.
//  GitHub Actions(.github/workflows/holidays.yml)가 매주 돌리고, 바뀐 게 있으면 holidays 브랜치에만 올림
//  (main 은 안 바꿈 → GitHub Desktop 에 Pull 이 안 뜸). 앱은 그 브랜치 파일을 직접 읽음.
//  애플 파일은 몇 년 치만 담고 지난해는 빠지므로, 이미 저장된 지난 날짜는 지우지 않고 남겨 둠.
//    직접 실행:  node server/update-holidays.js   (Node 18 이상)
// ─────────────────────────────────────────────────────────────
const SRC = 'https://calendars.icloud.com/holidays/kr_ko.ics';

// ics 글 → { 'YYYY-MM-DD': '이름' } (날짜순). 매년 반복(COUNT/UNTIL)은 펼침
function parseHolidays(text) {
  const raw = text.replace(/\r\n[ \t]/g, '').replace(/\r/g, '');
  const days = {};
  const add = (key, name) => { days[key] = days[key] && days[key] !== name ? days[key] + ' · ' + name : name; };
  for (const m of raw.matchAll(/BEGIN:VEVENT\n([\s\S]*?)END:VEVENT/g)) {
    const b = m[1];
    const ds = (b.match(/^DTSTART[^:\n]*:(\d{8})/m) || [])[1];
    if (!ds) continue;
    const name = ((b.match(/^SUMMARY(?:;[^:\n]*)?:(.*)$/m) || [])[1] || '').replace(/\\([,;\\])/g, '$1').trim();
    if (!name) continue;
    const y0 = +ds.slice(0, 4), md = `${ds.slice(4, 6)}-${ds.slice(6, 8)}`;
    const rr = (b.match(/^RRULE:(.*)$/m) || [])[1];
    if (!rr) { add(`${y0}-${md}`, name); continue; }
    if (!/FREQ=YEARLY/.test(rr) || /INTERVAL=(?!1\b)|BY/.test(rr)) throw new Error('처리 못 하는 반복 규칙: ' + rr);
    const count = +((rr.match(/COUNT=(\d+)/) || [])[1] || 0);
    const until = (rr.match(/UNTIL=(\d{8})/) || [])[1];
    if (!count && !until) throw new Error('끝이 없는 반복: ' + rr);
    for (let y = y0; count ? y < y0 + count : `${y}${ds.slice(4)}` <= until; y++) add(`${y}-${md}`, name);
  }
  return Object.fromEntries(Object.entries(days).sort(([a], [b]) => (a < b ? -1 : 1)));
}

async function main() {
  const fs = require('fs'), path = require('path');
  const res = await fetch(SRC);
  if (!res.ok) throw new Error(`받기 실패 HTTP ${res.status}`);
  const fresh = parseHolidays(await res.text());
  const keys = Object.keys(fresh);
  if (keys.length < 40) throw new Error(`공휴일이 ${keys.length}개뿐 — 원본이 이상해서 저장하지 않음`);

  const file = path.join(__dirname, '..', 'holidays.json');
  const old = fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, 'utf8')).days || {}) : {};
  // 애플 파일이 다루는 첫날보다 앞선 날짜는 예전 것을 그대로 둠 (지난 공휴일이 달력에서 사라지지 않게)
  const days = {};
  for (const [k, v] of Object.entries(old)) if (k < keys[0]) days[k] = v;
  Object.assign(days, fresh);

  if (JSON.stringify(old) === JSON.stringify(days)) { console.log(`변경 없음 (${keys.length}일, ${keys[0]} ~ ${keys[keys.length - 1]})`); return; }
  const out = { source: '애플 대한민국 공휴일 ' + SRC, updated: new Date().toISOString().slice(0, 10), days };
  fs.writeFileSync(file, JSON.stringify(out, null, 1) + '\n');
  const added = Object.keys(days).filter(k => old[k] !== days[k]);
  console.log(`갱신: 전체 ${Object.keys(days).length}일 / 새로 바뀐 날 ${added.length}개`);
  for (const k of added) console.log(`  ${k} ${days[k]}${old[k] ? ` (전: ${old[k]})` : ''}`);
}

if (typeof module !== 'undefined' && require.main === module) main().catch(e => { console.error('실패: ' + e.message); process.exit(1); });
else if (typeof module !== 'undefined') module.exports = { parseHolidays };
