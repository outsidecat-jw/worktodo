// 앱 껍데기 캐시 (오프라인에서도 열리게). 네트워크 우선(서버에 새 버전 있는지 매번 확인), 실패 시 캐시.
// GitHub Pages가 10분 캐시 헤더를 보내므로 cache:'no-cache'로 브라우저 캐시를 건너뛰어야 수정이 바로 반영됨.
const CACHE = 'worktodo-v3';
const SHELL = ['./', './index.html', './config.js', './manifest.json', './icon-192.png', './icon-512.png', './icon-180.png'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (url.origin !== location.origin) return; // firebase 등 외부 요청은 건드리지 않음
  e.respondWith(
    fetch(e.request, {cache: 'no-cache'}).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy));
      return res;
    }).catch(() => caches.match(e.request).then(r => r || caches.match('./index.html')))
  );
});

// ── 푸시 알림 받기 (서버 send-alarms.js 가 보냄) ──
self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) { d = { title: '회사 일정', body: e.data ? e.data.text() : '' }; }
  const title = d.title || '회사 일정';
  e.waitUntil(self.registration.showNotification(title, {
    body: d.body || '',
    tag: d.tag || undefined,          // 같은 알림은 겹치지 않게
    icon: './icon-192.png',
    badge: './icon-192.png',
    data: { date: d.date || '' }
  }));
});

// 알림을 누르면 앱을 그 날짜로 열기 (이미 열려 있으면 그 창으로)
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const date = (e.notification.data && e.notification.data.date) || '';
  const target = new URL('./' + (date ? '?d=' + date : ''), self.location.href).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    for (const c of list) {
      if ('focus' in c) { c.focus(); if (date) c.postMessage({ type: 'goto', date }); return; }
    }
    return self.clients.openWindow(target);
  }));
});
