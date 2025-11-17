const CACHE_NAME = 'meteo-journal-v2';
const FALLBACK_HTML = `<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Метеожурнал экспедиции</title>
    <style>
        body { font-family: Arial, sans-serif; padding: 20px; text-align: center; }
        .offline-message { background: #ff6b6b; color: white; padding: 20px; border-radius: 8px; margin: 20px 0; }
        button { background: #2c5aa0; color: white; border: none; padding: 10px 20px; border-radius: 4px; cursor: pointer; }
    </style>
</head>
<body>
    <h1>🌤️ Метеожурнал экспедиции</h1>
    <div class="offline-message">
        <p>🔌 Офлайн-режим</p>
        <p>Приложение загружается в ограниченном режиме.</p>
    </div>
    <p>Основные функции должны быть доступны после полной загрузки.</p>
    <button onclick="location.reload()">Повторить попытку</button>
    <script>
        // Пытаемся зарегистрировать Service Worker при повторной попытке
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('./service-worker.js')
                .catch(console.error);
        }
    </script>
</body>
</html>`;

// Статические ресурсы для кэширования
const STATIC_CACHE_URLS = [
    './',
    './index.html',
    './app.js',
    './style.css',
    './manifest.json',
    './icons/icon-64.png',
    './icons/icon-128.png',
    './icons/icon-192.png'
];

// Установка Service Worker
self.addEventListener('install', (event) => {
    console.log('Service Worker: Installing...');
    
    event.waitUntil(
        (async () => {
            try {
                const cache = await caches.open(CACHE_NAME);
                console.log('Service Worker: Caching static resources');
                
                // Кэшируем основные ресурсы, но не блокируем установку при ошибках
                await cache.addAll(STATIC_CACHE_URLS).catch(error => {
                    console.warn('Service Worker: Some resources failed to cache:', error);
                });
                
                console.log('Service Worker: Installation completed');
            } catch (error) {
                console.error('Service Worker: Installation failed:', error);
                // Установка все равно завершается успешно, даже с ошибками
            }
        })()
    );
});

// Активация Service Worker
self.addEventListener('activate', (event) => {
    console.log('Service Worker: Activating...');
    
    event.waitUntil(
        (async () => {
            try {
                // Очищаем старые кэши
                const cacheNames = await caches.keys();
                await Promise.all(
                    cacheNames.map((cacheName) => {
                        if (cacheName !== CACHE_NAME) {
                            console.log('Service Worker: Deleting old cache:', cacheName);
                            return caches.delete(cacheName);
                        }
                    })
                );
                
                console.log('Service Worker: Activation completed');
                // Сообщаем всем клиентам о готовности
                await self.clients.claim();
            } catch (error) {
                console.error('Service Worker: Activation failed:', error);
            }
        })()
    );
});

// Обработка запросов
self.addEventListener('fetch', (event) => {
    // Пропускаем не-GET запросы и chrome-extension
    if (event.request.method !== 'GET' || event.request.url.startsWith('chrome-extension://')) {
        return;
    }

    event.respondWith(
        (async () => {
            // Для навигационных запросов (страницы)
            if (event.request.mode === 'navigate') {
                return handleNavigateRequest(event.request);
            }
            
            // Для статических ресурсов
            return handleStaticRequest(event.request);
        })()
    );
});

// Обработка навигационных запросов
async function handleNavigateRequest(request) {
    try {
        // Сначала пробуем сеть с таймаутом
        const networkPromise = fetch(request);
        const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Timeout')), 3000)
        );
        
        const response = await Promise.race([networkPromise, timeoutPromise]);
        
        // Если сетевой запрос успешен, обновляем кэш
        if (response && response.status === 200) {
            const cache = await caches.open(CACHE_NAME);
            cache.put(request, response.clone()).catch(console.warn);
        }
        
        return response;
    } catch (networkError) {
        console.log('Service Worker: Network failed, trying cache...');
        
        // Пробуем кэш
        try {
            const cachedResponse = await caches.match(request);
            if (cachedResponse) {
                return cachedResponse;
            }
            
            // Если в кэше нет, пробуем index.html
            const fallbackResponse = await caches.match('./index.html');
            if (fallbackResponse) {
                return fallbackResponse;
            }
            
            // Если ничего нет, возвращаем fallback HTML
            return new Response(FALLBACK_HTML, {
                headers: { 'Content-Type': 'text/html; charset=utf-8' }
            });
        } catch (cacheError) {
            console.error('Service Worker: Cache failed:', cacheError);
            
            // Аварийный fallback
            return new Response(FALLBACK_HTML, {
                headers: { 'Content-Type': 'text/html; charset=utf-8' }
            });
        }
    }
}

// Обработка статических запросов
async function handleStaticRequest(request) {
    try {
        // Сначала пробуем кэш
        const cachedResponse = await caches.match(request);
        if (cachedResponse) {
            return cachedResponse;
        }
        
        // Если нет в кэше, пробуем сеть
        const networkResponse = await fetch(request);
        if (networkResponse && networkResponse.status === 200) {
            // Кэшируем для будущего использования
            const cache = await caches.open(CACHE_NAME);
            cache.put(request, networkResponse.clone()).catch(console.warn);
        }
        
        return networkResponse;
    } catch (error) {
        console.log('Service Worker: Static resource failed:', error);
        
        // Для изображений возвращаем заглушку
        if (request.destination === 'image') {
            return new Response(
                '<svg width="100" height="100" xmlns="http://www.w3.org/2000/svg"><rect width="100" height="100" fill="#f0f0f0"/><text x="50" y="50" text-anchor="middle" dy=".3em" font-family="Arial" font-size="10" fill="#666">IMG</text></svg>',
                { headers: { 'Content-Type': 'image/svg+xml' } }
            );
        }
        
        // Для других ресурсов возвращаем пустой ответ
        return new Response('', { 
            status: 503, 
            statusText: 'Service Unavailable',
            headers: { 'Content-Type': 'text/plain' }
        });
    }
}

// Фоновая синхронизация (если понадобится в будущем)
self.addEventListener('sync', (event) => {
    console.log('Service Worker: Background sync:', event.tag);
});