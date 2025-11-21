const APP_VERSION = '0.2.2';
const CACHE_NAME = `meteo-journal-${APP_VERSION}`;
const API_CACHE_NAME = `${CACHE_NAME}-api`;
const MAX_CACHE_SIZE = 100;
const MAX_API_CACHE_SIZE = 50;

const STATIC_CACHE_URLS = [
    './',
    './app.js',
    './style.css',
    './manifest.json',
    './404.html',
    './icons/icon-64.png',
    './icons/icon-128.png',
    './icons/icon-192.png'
];

const FALLBACK_HTML = `<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Метеожурнал экспедиции</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
            padding: 20px; 
            text-align: center; 
            background: linear-gradient(135deg, #2c5aa0 0%, #1e3a8a 100%);
            color: white;
            min-height: 100vh;
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
        }
        .container {
            max-width: 500px;
            width: 100%;
        }
        .offline-card {
            background: rgba(255, 255, 255, 0.95);
            color: #333;
            padding: 30px;
            border-radius: 12px;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
            backdrop-filter: blur(10px);
        }
        h1 { 
            font-size: 24px; 
            margin-bottom: 20px;
            color: #2c5aa0;
        }
        .offline-message { 
            background: #ff6b6b; 
            color: white; 
            padding: 15px; 
            border-radius: 8px; 
            margin: 20px 0; 
        }
        button { 
            background: #2c5aa0; 
            color: white; 
            border: none; 
            padding: 12px 24px; 
            border-radius: 6px; 
            cursor: pointer; 
            font-size: 16px;
            margin: 10px;
            transition: background 0.3s;
        }
        button:hover {
            background: #1e3a8a;
        }
        .loading {
            display: inline-block;
            width: 20px;
            height: 20px;
            border: 3px solid #ffffff;
            border-radius: 50%;
            border-top-color: transparent;
            animation: spin 1s ease-in-out infinite;
            margin-right: 10px;
        }
        @keyframes spin {
            to { transform: rotate(360deg); }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="offline-card">
            <h1>🌤️ Метеожурнал экспедиции</h1>
            <div class="offline-message">
                <p>🔌 Офлайн-режим</p>
                <p>Приложение загружается в ограниченном режиме.</p>
            </div>
            <p>Основные функции должны быть доступны после восстановления соединения.</p>
            <div>
                <button onclick="retryConnection()">
                    <span class="loading"></span>Повторить попытку
                </button>
                <button onclick="useOffline()">Продолжить офлайн</button>
            </div>
        </div>
    </div>
    <script>
        function retryConnection() {
            const btn = event.target.closest('button');
            btn.innerHTML = '<span class="loading"></span>Проверка связи...';
            btn.disabled = true;
            
            if ('serviceWorker' in navigator) {
                navigator.serviceWorker.register('./service-worker.js')
                    .then(() => {
                        setTimeout(() => {
                            location.reload();
                        }, 1000);
                    })
                    .catch(error => {
                        console.error('Service Worker registration failed:', error);
                        btn.innerHTML = '❌ Ошибка';
                        setTimeout(() => {
                            btn.innerHTML = 'Повторить попытку';
                            btn.disabled = false;
                        }, 2000);
                    });
            } else {
                location.reload();
            }
        }
        
        function useOffline() {
            location.replace('./');
        }
        
        if (navigator.onLine) {
            setTimeout(() => {
                location.reload();
            }, 3000);
        }
    </script>
</body>
</html>`;

// Функция для очистки старых записей в кэше
async function cleanOldCache(cache, maxSize) {
    try {
        const requests = await cache.keys();
        if (requests.length > maxSize) {
            // Получаем информацию о времени кэширования
            const requestsWithTime = await Promise.all(
                requests.map(async (request) => {
                    const response = await cache.match(request);
                    let timestamp = Date.now();
                    
                    if (response) {
                        const dateHeader = response.headers.get('date');
                        const lastModified = response.headers.get('last-modified');
                        if (dateHeader) {
                            timestamp = new Date(dateHeader).getTime();
                        } else if (lastModified) {
                            timestamp = new Date(lastModified).getTime();
                        }
                    }
                    
                    return { request, timestamp };
                })
            );
            
            // Сортируем по времени (старые сначала)
            requestsWithTime.sort((a, b) => a.timestamp - b.timestamp);
            
            // Удаляем самые старые записи
            const toDelete = requestsWithTime.slice(0, requests.length - maxSize);
            await Promise.all(toDelete.map(item => cache.delete(item.request)));
            
            console.log(`Service Worker: Cleared ${toDelete.length} old cache entries`);
        }
    } catch (error) {
        console.warn('Service Worker: Cache cleaning failed:', error);
    }
}

// Обработка API запросов
async function handleApiRequest(request) {
    const cache = await caches.open(API_CACHE_NAME);
    
    try {
        // Сначала пробуем сеть с таймаутом
        const networkPromise = fetch(request);
        const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Timeout')), 10000)
        );
        
        const response = await Promise.race([networkPromise, timeoutPromise]);
        
        // Если успех - кэшируем для оффлайн использования
        if (response && response.ok) {
            const cacheResponse = response.clone();
            await cache.put(request, cacheResponse);
            await cleanOldCache(cache, MAX_API_CACHE_SIZE);
        }
        
        return response;
    } catch (error) {
        console.log('Service Worker: API request failed, trying cache...', error);
        
        // В оффлайне пробуем вернуть закэшированные данные
        const cachedResponse = await cache.match(request);
        if (cachedResponse) {
            console.log('Service Worker: Serving cached API response');
            return cachedResponse;
        }
        
        // Если нет кэша, возвращаем заглушку
        return new Response(JSON.stringify({
            error: 'offline',
            message: 'Приложение работает в оффлайн-режиме. Данные будут обновлены при восстановлении соединения.',
            timestamp: new Date().toISOString()
        }), {
            status: 200,
            headers: { 
                'Content-Type': 'application/json; charset=utf-8',
                'Cache-Control': 'no-cache'
            }
        });
    }
}

// Обработка навигационных запросов
async function handleNavigateRequest(request) {
    const cache = await caches.open(CACHE_NAME);
    
    try {
        // Сначала пробуем сеть с таймаутом
        const networkPromise = fetch(request);
        const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Timeout')), 5000)
        );
        
        const response = await Promise.race([networkPromise, timeoutPromise]);
        
        // Если сетевой запрос успешен, обновляем кэш
        if (response && response.status === 200) {
            await cache.put(request, response.clone());
        }
        
        return response;
    } catch (networkError) {
        console.log('Service Worker: Navigation network failed, trying cache...');
        
        // Пробуем кэш
        try {
            const cachedResponse = await cache.match(request);
            if (cachedResponse) {
                return cachedResponse;
            }
            
            // Если в кэше нет, пробуем альтернативные URL
            const fallbackUrls = ['./', '/index.html', '/'];
            for (const url of fallbackUrls) {
                const fallbackResponse = await cache.match(url);
                if (fallbackResponse) {
                    console.log('Service Worker: Serving fallback for navigation');
                    return fallbackResponse;
                }
            }
            
            // Если ничего нет, возвращаем fallback HTML
            console.log('Service Worker: Serving offline fallback HTML');
            return new Response(FALLBACK_HTML, {
                headers: { 
                    'Content-Type': 'text/html; charset=utf-8',
                    'Cache-Control': 'no-cache'
                }
            });
        } catch (cacheError) {
            console.error('Service Worker: Cache failed for navigation:', cacheError);
            
            // Аварийный fallback
            return new Response(FALLBACK_HTML, {
                headers: { 
                    'Content-Type': 'text/html; charset=utf-8',
                    'Cache-Control': 'no-cache'
                }
            });
        }
    }
}

// Обработка статических запросов
async function handleStaticRequest(request) {
    const cache = await caches.open(CACHE_NAME);
    
    try {
        // Сначала пробуем кэш
        const cachedResponse = await cache.match(request);
        if (cachedResponse) {
            // Проверяем свежесть кэша (не старше 1 дня для статики)
            const cacheControl = cachedResponse.headers.get('cache-control');
            const cachedTime = new Date(cachedResponse.headers.get('sw-cached-time') || cachedResponse.headers.get('date') || Date.now());
            const cacheAge = Date.now() - cachedTime.getTime();
            const MAX_AGE = 24 * 60 * 60 * 1000; // 1 день            
            
            // Для статики с длительным кэшированием используем кэш
            if (cacheControl && cacheControl.includes('max-age=31536000')) {
                return cachedResponse;
            }

            if (cacheAge < MAX_AGE) {
                return cachedResponse;
            }
        }
        
        // Если нет в кэше или кэш устарел, пробуем сеть
        const networkResponse = await fetch(request);
        if (networkResponse && networkResponse.status === 200) {
            // Клонируем response перед кэшированием
            const responseToCache = networkResponse.clone();
            const cachedHeaders = new Headers(networkResponse.headers);
            cachedHeaders.set('sw-cached-time', new Date().toISOString());

            const cachedResponse = new Response(await networkResponse.blob(), {
                status: networkResponse.status,
                statusText: networkResponse.statusText,
                headers: cachedHeaders
            });

            await cache.put(request, cachedResponse);
            await cleanOldCache(cache, MAX_CACHE_SIZE);
        }
        
        return networkResponse;
    } catch (error) {
        console.log('Service Worker: Static resource failed, using cache:', request.url);
        
        // Пробуем вернуть из кэша даже если он старый
        const cachedResponse = await cache.match(request);
        if (cachedResponse) {
            return cachedResponse;
        }
        
        // Для изображений возвращаем заглушку
        if (request.destination === 'image') {
            return new Response(
                '<svg width="100" height="100" xmlns="http://www.w3.org/2000/svg"><rect width="100" height="100" fill="#f0f0f0"/><text x="50" y="50" text-anchor="middle" dy=".3em" font-family="Arial" font-size="10" fill="#666">IMG</text></svg>',
                { headers: { 'Content-Type': 'image/svg+xml' } }
            );
        }
        
        // Для CSS возвращаем пустой стиль
        if (request.destination === 'style') {
            return new Response('/* Fallback CSS */', {
                headers: { 'Content-Type': 'text/css' }
            });
        }
        
        // Для JS возвращаем пустой скрипт
        if (request.destination === 'script') {
            return new Response('// Fallback JS', {
                headers: { 'Content-Type': 'application/javascript' }
            });
        }
        
        // Для других ресурсов возвращаем ошибку
        return new Response('Service Unavailable', { 
            status: 503, 
            statusText: 'Service Unavailable',
            headers: { 'Content-Type': 'text/plain' }
        });
    }
}

// Установка Service Worker
self.addEventListener('install', (event) => {
    console.log('Service Worker: Installing version', APP_VERSION);
    
    // Принудительная активация нового SW
    self.skipWaiting();
    
    event.waitUntil(
        (async () => {
            try {
                const cache = await caches.open(CACHE_NAME);
                console.log('Service Worker: Caching static resources');
                
                // Кэшируем критические ресурсы с повторными попытками
                const criticalUrls = ['./', './app.js', './style.css', './manifest.json'];
                
                for (const url of criticalUrls) {
                    let success = false;
                    for (let attempt = 0; attempt < 3 && !success; attempt++) {
                        try {
                            await cache.add(url);
                            success = true;
                            console.log(`Service Worker: Cached ${url} (attempt ${attempt + 1})`);
                        } catch (error) {
                            console.warn(`Service Worker: Failed to cache ${url}, attempt ${attempt + 1}:`, error);
                            if (attempt === 2) {
                                // На последней попытке создаем заглушку
                                const fallbackContent = url.endsWith('.js') ? '// Fallback JS' :
                                                       url.endsWith('.css') ? '/* Fallback CSS */' :
                                                       FALLBACK_HTML;
                                const fallbackResponse = new Response(fallbackContent, {
                                    headers: { 
                                        'Content-Type': url.endsWith('.js') ? 'application/javascript' :
                                                     url.endsWith('.css') ? 'text/css' : 'text/html'
                                    }
                                });
                                await cache.put(url, fallbackResponse);
                            }
                        }
                    }
                }
                
                console.log('Service Worker: Installation completed');
            } catch (error) {
                console.error('Service Worker: Installation failed:', error);
            }
        })()
    );
});

// Активация Service Worker
self.addEventListener('activate', (event) => {
    console.log('Service Worker: Activating version', APP_VERSION);
    
    event.waitUntil(
        (async () => {
            try {
                // Очищаем старые кэши
                const cacheNames = await caches.keys();
                await Promise.all(
                    cacheNames.map((cacheName) => {
                        if (cacheName.startsWith('meteo-journal-') && 
                            cacheName !== CACHE_NAME && 
                            cacheName !== API_CACHE_NAME) {
                            console.log('Service Worker: Deleting old cache:', cacheName);
                            return caches.delete(cacheName);
                        }
                    })
                );
                
                console.log('Service Worker: Activation completed');
                // Сообщаем всем клиентам о готовности
                await self.clients.claim();
                
                // Отправляем сообщение всем клиентам
                const clients = await self.clients.matchAll();
                clients.forEach(client => {
                    client.postMessage({
                        type: 'SW_ACTIVATED',
                        version: APP_VERSION,
                        cacheName: CACHE_NAME
                    });
                });
            } catch (error) {
                console.error('Service Worker: Activation failed:', error);
            }
        })()
    );
});

// Обработка запросов
self.addEventListener('fetch', (event) => {
    // Пропускаем не-GET запросы и chrome-extension
    if (event.request.method !== 'GET' || 
        event.request.url.startsWith('chrome-extension://') ||
        event.request.url.includes('browser-sync') ||
        event.request.url.includes('sockjs')) {
        return;
    }

    // Для API запросов используем специальную обработку
    if (event.request.url.includes('/api/')) {
        event.respondWith(handleApiRequest(event.request));
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

// Фоновая синхронизация
self.addEventListener('sync', (event) => {
    console.log('Service Worker: Background sync:', event.tag);
    
    if (event.tag === 'background-sync') {
        event.waitUntil(doBackgroundSync());
    }
});

async function doBackgroundSync() {
    try {
        console.log('Service Worker: Performing background sync');
        
        // Обновляем критические ресурсы
        const cache = await caches.open(CACHE_NAME);
        const urlsToUpdate = ['./', './app.js', './style.css'];
        
        for (const url of urlsToUpdate) {
            try {
                const networkResponse = await fetch(url, {
                    cache: 'no-cache',
                    headers: {
                        'Cache-Control': 'no-cache'
                    }
                });
                
                if (networkResponse.status === 200) {
                    await cache.put(url, networkResponse.clone());
                    console.log(`Service Worker: Updated ${url} in cache`);
                }
            } catch (error) {
                console.warn(`Service Worker: Failed to update ${url}:`, error);
            }
        }
        
        // Уведомляем клиентов об обновлении
        const clients = await self.clients.matchAll();
        clients.forEach(client => {
            client.postMessage({
                type: 'BACKGROUND_SYNC_COMPLETE',
                timestamp: new Date().toISOString()
            });
        });
    } catch (error) {
        console.error('Service Worker: Background sync failed:', error);
    }
}

// Обработка сообщений от клиентов
self.addEventListener('message', (event) => {
    console.log('Service Worker: Received message:', event.data);
    
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
    
    if (event.data && event.data.type === 'GET_VERSION') {
        event.ports[0].postMessage({
            type: 'VERSION_INFO',
            version: APP_VERSION,
            cacheName: CACHE_NAME,
            timestamp: new Date().toISOString()
        });
    }
    
    if (event.data && event.data.type === 'CLEAR_CACHE') {
        caches.delete(CACHE_NAME).then(() => {
            event.ports[0].postMessage({
                type: 'CACHE_CLEARED',
                success: true
            });
        });
    }
});

// Периодическая синхронизация (если поддерживается)
if ('periodicSync' in self.registration) {
    self.addEventListener('periodicsync', (event) => {
        if (event.tag === 'content-update') {
            console.log('Service Worker: Periodic sync triggered');
            event.waitUntil(doBackgroundSync());
        }
    });
}

// Обработка push-уведомлений
self.addEventListener('push', (event) => {
    console.log('Service Worker: Push message received', event);
    
    const options = {
        body: event.data ? event.data.text() : 'Обновление метеожурнала',
        icon: './icons/icon-64.png',
        badge: './icons/icon-64.png',
        vibrate: [100, 50, 100],
        data: {
            dateOfArrival: Date.now(),
            primaryKey: 1
        },
        actions: [
            {
                action: 'explore',
                title: 'Открыть приложение',
                icon: './icons/icon-64.png'
            },
            {
                action: 'close',
                title: 'Закрыть',
                icon: './icons/icon-64.png'
            }
        ]
    };
    
    event.waitUntil(
        self.registration.showNotification('Метеожурнал', options)
    );
});

self.addEventListener('notificationclick', (event) => {
    console.log('Service Worker: Notification click', event.notification.tag);
    event.notification.close();
    
    if (event.action === 'explore') {
        // Открываем приложение
        event.waitUntil(
            clients.matchAll({type: 'window'}).then(windowClients => {
                for (let client of windowClients) {
                    if (client.url.includes('./') && 'focus' in client) {
                        return client.focus();
                    }
                }
                if (clients.openWindow) {
                    return clients.openWindow('./');
                }
            })
        );
    }
});

// Глобальная обработка ошибок
self.addEventListener('error', (event) => {
    console.error('Service Worker: Global error:', event.error);
});

self.addEventListener('unhandledrejection', (event) => {
    console.error('Service Worker: Unhandled promise rejection:', event.reason);
});