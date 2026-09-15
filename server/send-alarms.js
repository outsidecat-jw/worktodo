// ─────────────────────────────────────────────────────────────
//  알림 발송 스크립트 (GitHub Actions 가 5분마다 깨워 주면 14분 동안 매 1분 확인 → 1분 정확도)
//  - Firestore 에서 시간·알림이 있는 일정을 읽어 "지금 보낼 때가 된" 알림을 찾고
//  - 각 기기의 푸시 구독(users/{uid}/push/*) 으로 Web Push 발송
//  - 보낸 것은 users/{uid}/sent/{key} 에 기록해 두 번 보내지 않음
//  환경변수: FIREBASE_SERVICE_ACCOUNT(JSON 문자열), VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY,
//           VAPID_SUBJECT(mailto:주소), DRY_RUN(=1 이면 실제 발송 안 함), TZ=Asia/Seoul
// ─────────────────────────────────────────────────────────────
const admin = require('firebase-admin');
const webpush = require('web-push');

// ── 비밀값 점검 (틀리면 무엇이 틀렸는지 로그에 정확히 남김) ──
const env = k => (process.env[k] || '').replace(/^﻿/, '').trim();   // 앞뒤 공백·줄바꿈·BOM 제거
const problems = [];
const saRaw = env('FIREBASE_SERVICE_ACCOUNT');
let sa = {};
if (!saRaw) problems.push('FIREBASE_SERVICE_ACCOUNT 가 비어 있음 (Secret 이름 확인)');
else {
  try { sa = JSON.parse(saRaw); } catch (e) { problems.push(`FIREBASE_SERVICE_ACCOUNT 가 JSON 이 아님: ${e.message} (앞 30자: ${JSON.stringify(saRaw.slice(0, 30))})`); }
  if (sa && !sa.project_id) problems.push('FIREBASE_SERVICE_ACCOUNT 에 project_id 없음 (파일 내용 전체를 붙여넣었는지 확인)');
  if (sa && sa.private_key && !sa.private_key.includes('BEGIN PRIVATE KEY')) problems.push('FIREBASE_SERVICE_ACCOUNT 의 private_key 형식 이상');
}
const pub = env('VAPID_PUBLIC_KEY'), priv = env('VAPID_PRIVATE_KEY'), subject = env('VAPID_SUBJECT');
if (pub.length !== 87) problems.push(`VAPID_PUBLIC_KEY 길이 ${pub.length} (87이어야 함, 값이 비었거나 다른 줄이 섞임)`);
if (priv.length !== 43) problems.push(`VAPID_PRIVATE_KEY 길이 ${priv.length} (43이어야 함)`);
if (!/^(mailto:|https:\/\/)/.test(subject)) problems.push(`VAPID_SUBJECT 는 mailto:주소 형식이어야 함 (현재: ${JSON.stringify(subject)})`);
if (problems.length) { console.error('설정 오류:\n - ' + problems.join('\n - ')); process.exit(1); }

admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();
try { webpush.setVapidDetails(subject, pub, priv); }
catch (e) { console.error('VAPID 키 오류: ' + e.message); process.exit(1); }
const DRY = env('DRY_RUN') === '1';

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

// ── 한 번 깨어나면 LOOP_MIN 분 동안 매 1분 확인 (GitHub 예약이 늦어도 1분 정확도) ──
const LOOP_MIN = DRY ? 0 : Number(env('LOOP_MIN') || 14);
const GRACE_MIN = 30;                       // 그래도 늦었으면 30분 안이면 보냄
let docsNow = [];                           // Firestore 실시간 구독으로 갱신되는 일정 목록
const sentCache = {};
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function checkOnce() {
  const now = new Date();
  const today = ymd(now);
  let checked = 0, sent = 0;

  for (const doc of docsNow) {
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

        const subs = (await db.collection('users').doc(uid).collection('push').get()).docs;   // 보낼 때마다 최신 기기 목록
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
  if (sent || LOOP_MIN === 0) console.log(`[${now.toTimeString().slice(0, 8)}] 검사 ${checked}건, 발송 ${sent}건`);
  return sent;
}

async function cleanupOld() {
  // 7일 지난 발송 기록 정리 (사용자별로 조회 → 별도 색인 필요 없음)
  const cutoff = admin.firestore.Timestamp.fromMillis(Date.now() - 7 * 86400000);
  const uids = new Set(docsNow.map(d => d.ref.parent.parent.id));
  let cleaned = 0;
  for (const uid of uids) {
    const old = await db.collection('users').doc(uid).collection('sent').where('at', '<', cutoff).get();
    for (const d of old.docs) { await d.ref.delete(); cleaned++; }
  }
  if (cleaned) console.log(`오래된 발송 기록 ${cleaned}건 정리`);
}

async function main() {
  const start = Date.now();
  console.log(`[${new Date().toString()}] 시작 (DRY_RUN=${DRY}, ${LOOP_MIN}분 동안 매 1분 확인)`);

  // 일정 목록을 실시간 구독: 처음 한 번만 전체를 읽고, 그 뒤엔 바뀐 것만 (Firestore 무료 한도 절약)
  await new Promise((resolve, reject) => {
    let first = true;
    db.collectionGroup('tasks').onSnapshot(snap => {
      docsNow = snap.docs;
      if (first) { first = false; console.log(`일정 ${docsNow.length}건 불러옴`); resolve(); }
    }, err => { if (first) reject(err); else console.error('구독 오류', err); });
  });

  let total = 0, loops = 0;
  while (true) {
    total += await checkOnce();
    loops++;
    const elapsed = (Date.now() - start) / 60000;
    if (elapsed >= LOOP_MIN) break;
    // 다음 정각 분까지 대기 (매 분 :02초쯤 확인)
    const now = Date.now();
    await sleep(60000 - (now % 60000) + 2000);
  }
  await cleanupOld();
  console.log(`끝: ${loops}회 확인, 발송 ${total}건`);
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
