const CACHE_NAME = 'dtr-pwa-cache-v2';
const ASSETS_TO_CACHE = [
  '/', // Home/Index page (if appropriate, or keep minimal)
  '/static/css/style.css',
  '/static/js/dark_light_mode.js',
  '/manifest.json'
];

// Install Event - cache core static resources immediately
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Caching App Shell');
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

// Activate Event - cleanup old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('[Service Worker] Deleting old cache', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch Event - network-first strategy for dynamic pages like dashboard/attendance
// Fallback to cache if network fails, or serve assets from cache directly for static files
self.addEventListener('fetch', (event) => {
  // We only want to call event.respondWith() if this is a GET request for an HTML page or asset.
  if (event.request.method !== 'GET') {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Optional: you can cache successful responses here dynamically if needed
        return response;
      })
      .catch(async () => {
        // Network failed (offline). Try cache.
        const cachedResponse = await caches.match(event.request);
        if (cachedResponse) {
          return cachedResponse;
        }

        // If both network and cache failed, and it's a navigation request (HTML),
        // we could theoretically return a fallback page, but for now we fallback to root
        if (event.request.mode === 'navigate') {
          return caches.match('/');
        }
      })
  );
});
