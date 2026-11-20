const CACHE_NAME = 'fixzology-studio-v2';
const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/studio.css',
  './js/crypto-license.js',
  './js/project-db.js',
  './js/timeline-engine.js',
  './js/compositor.js',
  './js/export-engine.js',
  './js/app.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request).catch(() => caches.match('./index.html')))
  );
});
