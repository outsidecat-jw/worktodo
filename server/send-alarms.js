// ─────────────────────────────────────────────────────────────
//  알림 발송 스크립트 (GitHub Actions 에서 5분마다 실행)
//  - Firestore 에서 시간·알림이 있는 일정을 읽어 "지금 보낼 때가 된" 알림을 찾고
//  - 각 기기의 푸시 구독(users/{uid}/push/*) 으로 Web Push 발송
//  - 보낸 것은 users/{uid}/sent/{key} 에 기록해 두 번 보내지 않음
//  환경변수: FIREBASE_SERVICE_ACCOUNT(JSON 문자열), VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY,
//           VAPID_SUBJECT(mailto:주소), DRY_RUN(=1 이면 실제 발송 안 함), TZ=Asia/Seoul
// ─────────────────────────────────────────────────────────────
const admin = require('firebase-admin');
const webpush = require('web-push');

const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}');
if (!sa.project_id) { console.error('FIREBASE_SERVICE_ACCOUNT 비어 있음'); process.exit(1); }
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();
webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:noreply@example.com', process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
const DRY = process.env.DRY_RUN === '1';

// ── 날짜 유틸 (앱과 동일 규칙) ──
const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return ymd(d); };
const isRepeat = t => !!(t.repeat && t.repeat.type !== 'none');
function occursOn(t, date) {
  if (!isRepeat(t)) return t.date === date;
  if (date < t.date) return false;
  if (t.skipDates && t.skipDates[date]) return false;
  const d = parse(date), w = d.getDay();
  switch (t.repeat.type) {
    case 'daily': return true;
    case 'weekdays': return w >= 1 && w <= 5;
    case 'weekly': return (t.repeat.weekdays || []).includes(w);
    case 'monthly': return d.getDate() === parse(t.date).getDate();
  }
  return false;
}
const isDone = (t, date) => isRepeat(t) ? !!(t.doneDates && t.doneDates[date]) : !!t.done;
const PRI_LABEL = { red: '급함', blue: '보통', green: '여유' };
function offsetLabel(m) {
  if (m === 0) return '지금';
  if (m < 60) return `${m}분 전`;
  if (m < 1440) return `${m / 60}시간 전`;
  return `${m / 1440}일 전`;
}

async function main() {
  const now = new Date();
  const GRACE_MIN = 30;                       // Actions 가 늦게 돌아도 30분 안이면 보냄
  const today = ymd(now);
  console.log(`[${now.toString()}] 시작 (DRY_RUN=${DRY})`);

  const snap = await db.collectionGroup('tasks').get();
  let checked = 0, sent = 0;
  const subsCache = {}, sentCache = {};

  for (const doc of snap.docs) {
    const t = doc.data();
    if (t.deleted || t.archived || !t.time || !Array.isArray(t.alarms) || !t.alarms.length) continue;
    const uid = doc.ref.parent.parent.id;
    checked++;

    // 이 일정이 뜨는 날짜들 (반복이면 최근 3일 ~ 앞으로 3일)
    const dates = isRepeat(t)
      ? [-3, -2, -1, 0, 1, 2, 3].map(i => addDays(today, i)).filter(d => occursOn(t, d))
      : [t.date];

    for (const date of dates) {
      if (isDone(t, date)) continue;               // 완료한 건 알림 없음 (체크 풀면 다시 대상)
      const at = new Date(`${date}T${t.time}:00`); // TZ=Asia/Seoul 로 실행되므로 한국 시각
      for (const m of t.alarms) {
        const fireAt = new Date(at.getTime() - m * 60000);
        const diffMin = (now - fireAt) / 60000;
        if (diffMin < 0 || diffMin > GRACE_MIN) continue;

        const key = `${doc.id}_${date}_${m}`;
        sentCache[uid] = sentCache[uid] || new Set((await db.collection('users').doc(uid).collection('sent').get()).docs.map(d => d.id));
        if (sentCache[uid].has(key)) continue;

        subsCache[uid] = subsCache[uid] || (await db.collection('users').doc(uid).collection('push').get()).docs;
        const subs = subsCache[uid];
        const body = `${t.time} · ${offsetLabel(m)}${t.note ? ' · ' + t.note : ''}`;
        const payload = JSON.stringify({ title: t.title, body, date, tag: key, priority: t.priority || 'red' });
        console.log(`보냄: [${uid.slice(0, 6)}] ${t.title} @ ${date} ${t.time} (${offsetLabel(m)}) → 기기 ${subs.length}대`);

        if (!DRY) {
          for (const s of subs) {
            const sub = s.data();
            try {
              await webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, payload, { TTL: 3600, urgency: 'high' });
            } catch (e) {
              console.log(`  기기 ${s.id} 실패: ${e.statusCode || e.message}`);
              if (e.statusCode === 404 || e.statusCode === 410) { await s.ref.delete(); console.log('  → 만료된 구독 삭제'); }
            }
          }
          await db.collection('users').doc(uid).collection('sent').doc(key).set({ at: admin.firestore.FieldValue.serverTimestamp(), title: t.title });
        }
        sentCache[uid].add(key);
        sent++;
      }
    }
  }

  // 7일 지난 발송 기록 정리 (사용자별로 조회 → 별도 색인 필요 없음)
  const cutoff = admin.firestore.Timestamp.fromMillis(Date.now() - 7 * 86400000);
  const uids = new Set(snap.docs.map(d => d.ref.parent.parent.id));
  let cleaned = 0;
  for (const uid of uids) {
    const old = await db.collection('users').doc(uid).collection('sent').where('at', '<', cutoff).get();
    for (const d of old.docs) { await d.ref.delete(); cleaned++; }
  }

  console.log(`검사 ${checked}건, 발송 ${sent}건, 오래된 기록 정리 ${cleaned}건`);
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
