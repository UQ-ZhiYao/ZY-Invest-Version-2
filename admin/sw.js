/* ZY-Invest Admin — service worker (offline shell for installability) */
const CACHE = 'zy-admin-v1';
const ASSETS = [
  'admin-login.html',
  'admin.html',
  'manifest.webmanifest',
  '../assets/css/dashboard.css',
  '../assets/css/dashboard-portfolio.css',
  '../assets/img/logo.png',
  '../assets/img/icon-192.png',
  '../assets/img/icon-512.png',
  '../assets/img/apple-touch-icon.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(ASSETS).catch(() => {})).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  // network-first, fall back to cache (so updates land but app still opens offline)
  e.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit || caches.match('admin-login.html')))
  );
});
