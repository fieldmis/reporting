// Field Ops Console — service worker
// Bump this on every deploy so old caches get cleared out.
const CACHE_VERSION = 'fos-v1';
const CACHE_NAME = `fos-cache-${CACHE_VERSION}`;

// App-shell files to pre-cache. Add/remove paths to match your repo.
const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

// ---- Install: pre-cache the app shell ----
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

// ---- Activate: drop old caches from previous versions ----
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key.startsWith('fos-cache-') && key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// ---- Fetch strategy ----
// - Never cache calls to the Apps Script backend (script.google.com):
//   this data changes constantly and must always be fresh. Network-only,
//   let the page's own fetch().catch() handle failures.
// - For everything else (HTML/CSS/JS/fonts/icons): network-first, falling
//   back to cache when offline, and caching successful responses as we go.
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Only handle GET requests; let POST (our API calls) pass straight through.
  if (event.request.method !== 'GET') return;

  if (url.hostname === 'script.google.com' || url.hostname === 'script.googleusercontent.com') {
    return; // network-only, no interception
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Only cache successful, basic (same-origin-ish) responses.
        if (response && response.status === 200) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
        }
        return response;
      })
      .catch(() => caches.match(event.request).then((cached) => cached || caches.match('./index.html')))
  );
});
