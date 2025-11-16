const CACHE_NAME = 'meteo-journal-v1';
const urlsToCache = [
  './',
  './index.html',
  './app.js',
  './style.css',
  './manifest.json',
  './icons/icon-64.png',
  './icons/icon-128.png',
  './icons/icon-192.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(urlsToCache))
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // Возвращаем кэшированную версию или загружаем новую
        return response || fetch(event.request);
      })
  );
});