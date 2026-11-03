// ─────────────────────────────────────────────────────────────
//  반복 규칙 — 앱(index.html)과 알림 서버(server/send-alarms.js)가 이 파일 하나를 같이 씀.
//  여기만 고치면 달력에 뜨는 날과 알림이 가는 날이 항상 같다.
//
//  repeat = null | {
//    type:     'daily' | 'weekdays' | 'weekly' | 'monthly' | 'yearly'
//    interval: N        (선택, 기본 1) — N일/N주/N개월/N년마다. 'weekdays'(평일)는 무시
//    weekdays: [0~6]    (weekly) 고른 요일, 0=일요일. 비면 시작일 요일
//    monthDays:[1~31]   (monthly) 고른 날짜들. 그 달에 없는 날짜(31일 등)는 건너뜀
//    months:   [0~11]   (yearly) 고른 달들, 0=1월. 비면 시작일의 달
//    nth:      {pos, kind} (monthly·yearly) "몇째 무슨 요일" — pos 1~5, -1=마지막
//              kind 0~6=그 요일, 'day'=날, 'weekday'=평일, 'weekend'=주말
//    until:    'YYYY-MM-DD' (선택) 이 날까지만 반복
//  }
//  아무 선택 필드가 없으면 예전 규칙 그대로: 매월·매년은 시작일과 같은 날,
//  그 달에 없는 날짜(31일, 2월 29일)면 그 달 마지막 날.
//  반복은 시작일(task.date) 이전에는 안 뜨고, skipDates 에 적힌 날은 뺀다.
// ─────────────────────────────────────────────────────────────
(function (root) {
  const parse = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const lastDay = (y, m) => new Date(y, m + 1, 0).getDate();
  const dayNum = d => Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000);
  const ivOf = r => Math.max(1, Math.floor(Number(r.interval) || 1));
  const has = a => Array.isArray(a) && a.length > 0;
  const isRepeat = t => !!(t && t.repeat && t.repeat.type && t.repeat.type !== 'none');

  // "몇째 무슨 요일"이 그 달 며칠인지 (없으면 0 — 예: 다섯째 월요일이 없는 달)
  function nthDay(y, m, pos, kind) {
    const n = lastDay(y, m), hit = [];
    for (let i = 1; i <= n; i++) {
      const w = new Date(y, m, i).getDay();
      if (kind === 'day' || (kind === 'weekday' && w >= 1 && w <= 5) ||
          (kind === 'weekend' && (w === 0 || w === 6)) || kind === w) hit.push(i);
    }
    return pos === -1 ? (hit[hit.length - 1] || 0) : (hit[pos - 1] || 0);
  }

  function occursOn(t, date) {
    if (!isRepeat(t)) return t.date === date;
    if (date < t.date) return false;
    const r = t.repeat;
    if (r.until && date > r.until) return false;
    if (t.skipDates && t.skipDates[date]) return false;
    const d = parse(date), b = parse(t.date), w = d.getDay(), n = ivOf(r);
    const y = d.getFullYear(), m = d.getMonth(), day = d.getDate();
    switch (r.type) {
      case 'daily': return (dayNum(d) - dayNum(b)) % n === 0;
      case 'weekdays': return w >= 1 && w <= 5;
      case 'weekly': {
        if (!(has(r.weekdays) ? r.weekdays : [b.getDay()]).includes(w)) return false;
        // 주는 일요일부터. 시작일이 든 주를 0번째로 세어 N주마다
        return ((dayNum(d) - w) - (dayNum(b) - b.getDay())) / 7 % n === 0;
      }
      case 'monthly': {
        if (((y - b.getFullYear()) * 12 + m - b.getMonth()) % n) return false;
        if (r.nth) return day === nthDay(y, m, r.nth.pos, r.nth.kind);
        if (has(r.monthDays)) return r.monthDays.includes(day);
        return day === Math.min(b.getDate(), lastDay(y, m));
      }
      case 'yearly': {
        if ((y - b.getFullYear()) % n) return false;
        if (!(has(r.months) ? r.months : [b.getMonth()]).includes(m)) return false;
        if (r.nth) return day === nthDay(y, m, r.nth.pos, r.nth.kind);
        return day === Math.min(b.getDate(), lastDay(y, m));
      }
    }
    return false;
  }

  // 사람이 읽는 설명: "매월 5일", "3개월마다 첫째 월요일", "2년마다 8월 6일", "2주마다 화목 (~2027.5.1)"
  const WD = ['일', '월', '화', '수', '목', '금', '토'];
  const POS = { 1: '첫째', 2: '둘째', 3: '셋째', 4: '넷째', 5: '다섯째', '-1': '마지막' };
  const KIND = k => k === 'day' ? '날' : k === 'weekday' ? '평일' : k === 'weekend' ? '주말' : WD[k] + '요일';
  const nthText = x => `${POS[x.pos]} ${KIND(x.kind)}`;
  function label(t) {
    if (!isRepeat(t)) return '';
    const r = t.repeat, b = parse(t.date), n = ivOf(r);
    let s = '';
    switch (r.type) {
      case 'daily': s = n > 1 ? `${n}일마다` : '매일'; break;
      case 'weekdays': s = '평일'; break;
      case 'weekly': s = (n > 1 ? `${n}주마다 ` : '매주 ') + (has(r.weekdays) ? r.weekdays : [b.getDay()]).slice().sort().map(i => WD[i]).join(''); break;
      case 'monthly': s = (n > 1 ? `${n}개월마다 ` : '매월 ') +
        (r.nth ? nthText(r.nth) : has(r.monthDays) ? r.monthDays.slice().sort((a, c) => a - c).join('·') + '일' : b.getDate() + '일'); break;
      case 'yearly': s = (n > 1 ? `${n}년마다 ` : '매년 ') +
        (has(r.months) ? r.months : [b.getMonth()]).slice().sort((a, c) => a - c).map(i => i + 1).join('·') + '월 ' +
        (r.nth ? nthText(r.nth) : b.getDate() + '일'); break;
    }
    if (r.until) { const u = parse(r.until); s += ` (~${u.getFullYear()}.${u.getMonth() + 1}.${u.getDate()})`; }
    return s;
  }

  const api = { occursOn, isRepeat, label, nthDay };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RepeatRule = api;
})(this);
