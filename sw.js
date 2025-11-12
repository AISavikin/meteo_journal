const CACHE_NAME = 'meteo-journal-v1.2.0';
const urlsToCache = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-64x64.png',
  './icons/icon-128x128.png',
  './icons/icon-192x192.png'
];

// Установка сервис-воркера
self.addEventListener('install', function(event) {
  console.log('Service Worker: Установка...');
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(function(cache) {
        console.log('Service Worker: Кэширование файлов');
        return cache.addAll(urlsToCache);
      })
      .then(function() {
        console.log('Service Worker: Установлен');
        return self.skipWaiting();
      })
      .catch(function(error) {
        console.log('Service Worker: Ошибка кэширования', error);
      })
  );
});

// Активация сервис-воркера
self.addEventListener('activate', function(event) {
  console.log('Service Worker: Активация...');
  
  event.waitUntil(
    caches.keys().then(function(cacheNames) {
      return Promise.all(
        cacheNames.map(function(cacheName) {
          if (cacheName !== CACHE_NAME) {
            console.log('Service Worker: Удаление старого кэша', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(function() {
      console.log('Service Worker: Активирован');
      return self.clients.claim();
    })
  );
});

// Перехват запросов
self.addEventListener('fetch', function(event) {
  // Пропускаем запросы к chrome-extension и другие не-http(s) запросы
  if (!event.request.url.startsWith('http')) {
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then(function(response) {
        // Возвращаем кэшированную версию или делаем запрос к сети
        if (response) {
          return response;
        }
        
        return fetch(event.request).then(function(response) {
          // Проверяем валидный ли ответ
          if(!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }
          
          // Клонируем ответ
          const responseToCache = response.clone();
          
          caches.open(CACHE_NAME)
            .then(function(cache) {
              // Кэшируем только важные ресурсы
              if (event.request.url.includes('index.html') || 
                  event.request.url.includes('manifest.json') ||
                  event.request.url.includes('icons/')) {
                cache.put(event.request, responseToCache);
              }
            });
            
          return response;
        });
      })
      .catch(function() {
        // Fallback для случаев когда нет сети и нет в кэше
        if (event.request.destination === 'document') {
          return caches.match('./index.html');
        }
        
        // Для других типов запросов возвращаем понятное сообщение
        return new Response('Оффлайн режим', {
          status: 408,
          headers: new Headers({
            'Content-Type': 'text/plain; charset=utf-8'
          })
        });
      })
  );
});