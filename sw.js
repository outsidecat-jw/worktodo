// 앱 껍데기 캐시 (오프라인에서도 열리게). 네트워크 우선(서버에 새 버전 있는지 매번 확인), 실패 시 캐시.
// GitHub Pages가 10분 캐시 헤더를 보내므로 cache:'no-cache'로 브라우저 캐시를 건너뛰어야 수정이 바로 반영됨.
const CACHE = 'worktodo-v2';
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
