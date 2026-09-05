// Shell FOS — minimal service worker.
// Scope matches manifest.json's "scope"/"start_url": /Shell-FOS-APK/.
// Bump CACHE_NAME whenever you deploy a new index.html so old clients
// pick up the change instead of serving a stale cached copy.
const CACHE_NAME = 'shell-fos-v1';

const CORE_ASSETS = [
  '/Shell-FOS-APK/',
  '/Shell-FOS-APK/index.html',
  '/Shell-FOS-APK/manifest.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(CORE_ASSETS))
      .catch(() => { /* offline-first install shouldn't hard-fail the SW */ })
  );
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

// Stale-while-revalidate: serve from cache instantly if available, and
// refresh the cache in the background from the network. Only same-origin
// GET requests are handled — third-party requests (map tiles, geocoding,
// the Apps Script API, etc.) always go straight to the network, since
// those are live/dynamic data this app already handles failure for.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  if (new URL(req.url).origin !== self.location.origin) return;

  event.respondWith(
    caches.match(req).then((cached) => {
      const networkFetch = fetch(req)
        .then((response) => {
          if (response && response.status === 200) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached || networkFetch;
    })
  );
});
