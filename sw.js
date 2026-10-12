/* Цеттель: офлайн-кэш.
   ВАЖНО: при любом изменении любого файла сайта
   (включая data.js с новыми заметками) — подними CACHE_VERSION */
const CACHE_VERSION = 'zettel-v3';

const PRECACHE = [
  '/zettel/',
  '/zettel/index.html',
  '/zettel/style.css',
  '/zettel/app.js',
  '/zettel/data.js',
  '/zettel/assets/images/cover.jpg',
  '/zettel/assets/icons/icon.svg',
  '/zettel/assets/icons/icon-192.png',
  '/zettel/assets/icons/icon-512.png',
  '/zettel/assets/icons/apple-touch-icon.png',
  '/zettel/assets/fonts/fonts.css',
  '/zettel/assets/fonts/ptserif-400-cyrillic.woff2',
  '/zettel/assets/fonts/ptserif-400-latin.woff2',
  '/zettel/assets/fonts/ptserif-700-cyrillic.woff2',
  '/zettel/assets/fonts/ptserif-700-latin.woff2',
  '/zettel/assets/fonts/ptserif-400italic-cyrillic.woff2',
  '/zettel/assets/fonts/ptserif-400italic-latin.woff2',
  '/zettel/assets/fonts/oldstandard-400-cyrillic.woff2',
  '/zettel/assets/fonts/oldstandard-400-latin.woff2',
  '/zettel/assets/fonts/oldstandard-700-cyrillic.woff2',
  '/zettel/assets/fonts/oldstandard-700-latin.woff2',
  '/zettel/assets/fonts/oldstandard-400italic-cyrillic.woff2',
  '/zettel/assets/fonts/oldstandard-400italic-latin.woff2',
  '/zettel/assets/fonts/caveat-cyrillic.woff2',
  '/zettel/assets/fonts/caveat-latin.woff2'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_VERSION)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || !req.url.startsWith(self.location.origin)) return;
  e.respondWith(
    caches.match(req).then((hit) => {
      if (hit) return hit;
      return fetch(req).then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(req, copy));
        }
        return res;
      });
    })
  );
});
