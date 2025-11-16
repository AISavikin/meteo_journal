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
  // Для навигационных запросов (HTML-страницы) используем стратегию "Network Falling Back to Cache"
  // с обработкой ошибок для офлайн-режима
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          // Если сеть доступна, возвращаем свежий контент и обновляем кэш
          const responseClone = response.clone();
          caches.open(CACHE_NAME)
            .then((cache) => cache.put(event.request, responseClone));
          return response;
        })
        .catch(() => {
          // Если сеть недоступна, возвращаем кэшированную версию
          return caches.match(event.request)
            .then((cachedResponse) => {
              if (cachedResponse) {
                return cachedResponse;
              }
              // Если в кэше нет запрашиваемой страницы, возвращаем главную страницу
              return caches.match('./index.html');
            });
        })
    );
    return;
  }

  // Для остальных запросов (CSS, JS, изображения) используем стратегию "Cache First"
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // Возвращаем кэшированную версию, если есть
        if (response) {
          return response;
        }
        
        // Если нет в кэше, загружаем из сети
        return fetch(event.request)
          .then((networkResponse) => {
            // Кэшируем новый ресурс для будущего использования
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME)
              .then((cache) => cache.put(event.request, responseClone));
            return networkResponse;
          })
          .catch(() => {
            // Для статических ресурсов возвращаем заглушку или ничего
            if (event.request.destination === 'image') {
              return new Response(
                '<svg width="100" height="100" xmlns="http://www.w3.org/2000/svg"><rect width="100" height="100" fill="#f0f0f0"/></svg>',
                { headers: { 'Content-Type': 'image/svg+xml' } }
              );
            }
            return new Response('Офлайн-режим', {
              status: 503,
              statusText: 'Service Unavailable'
            });
          });
      })
  );
});

// Обработка обновления Service Worker
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});