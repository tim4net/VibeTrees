const CACHE_NAME = 'worktree-manager-v10';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.svg',
  '/css/base.css',
  '/css/sidebar.css',
  '/css/terminals.css',
  '/css/components.css',
  '/js/main.js',
  '/js/state.js',
  '/js/sidebar.js',
  '/js/terminals.js',
  '/js/tabs.js',
  '/js/modals.js',
  '/js/projects.js',
  '/js/service-actions.js',
  '/js/context-menus.js',
  '/js/context-menu-actions.js',
  '/js/terminal-empty-state.js',
  '/js/terminal-openers.js',
  '/js/terminal-setup.js',
  '/js/websockets.js',
  '/icons/anthropic.svg',
  '/icons/openai.svg'
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
  console.log('Service Worker: Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Service Worker: Caching static assets');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => self.skipWaiting())
      .catch((err) => console.error('Service Worker: Cache failed', err))
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('Service Worker: Activating...');
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cache) => {
            if (cache !== CACHE_NAME) {
              console.log('Service Worker: Clearing old cache', cache);
              return caches.delete(cache);
            }
          })
        );
      })
      .then(() => self.clients.claim())
  );
});

// Fetch event - network first, fallback to cache for static assets
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Skip WebSocket connections and API calls (always use network)
  if (request.url.includes('/api/') ||
      request.url.includes('/terminal/') ||
      request.url.includes('/logs/') ||
      request.url.includes('ws://') ||
      request.url.includes('wss://')) {
    return;
  }

  // For navigation requests and static assets: Network first, fallback to cache
  event.respondWith(
    fetch(request)
      .then((response) => {
        // Clone the response before caching
        const responseClone = response.clone();

        // Cache successful responses
        if (response.status === 200) {
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseClone);
          });
        }

        return response;
      })
      .catch(() => {
        // Network failed, try cache
        return caches.match(request).then((cachedResponse) => {
          if (cachedResponse) {
            console.log('Service Worker: Serving from cache', request.url);
            return cachedResponse;
          }

          // If not in cache and network failed, return offline page or error
          console.error('Service Worker: No cache match for', request.url);
          return new Response('Offline - Resource not available', {
            status: 503,
            statusText: 'Service Unavailable'
          });
        });
      })
  );
});
