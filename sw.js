// Shell FOS — service worker.
// Bump VERSION whenever you deploy a new index.html so phones pick up the change.
//
// - The app page (index.html) is fetched from the network FIRST, so a new version reaches reps on
//   their next open instead of one launch later. If the network is slow (3.5 s) or down, the saved
//   copy is used, so the app still opens.
// - Other same-site files (manifest, masterdata.csv ...) are served from the saved copy and
//   refreshed in the background.
// - Document Vault files (their address ends in ?v=<fingerprint>, so a replaced file has a new address) and the
//   PDF reader in /vendor/ never change under the same address: they are saved on first use and then served
//   straight from the phone, instantly and offline.
// - Cache names include this app's own address, so /reporting/ and /testing/ (same website) no
//   longer delete each other's saved files.
const VERSION = 'v20';
const SCOPE = self.registration.scope;                       // e.g. https://fieldmis.github.io/reporting/
const CACHE_PREFIX = 'shell-fos:' + SCOPE + ':';
const CACHE_NAME = CACHE_PREFIX + VERSION;
const CORE_ASSETS = ['./', './index.html', './manifest.json'];
const NAV_TIMEOUT_MS = 3500;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(CORE_ASSETS))
      .catch(() => { /* a failed pre-save must not stop the worker installing */ })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys
        .filter((k) => (k.startsWith(CACHE_PREFIX) && k !== CACHE_NAME) || /^shell-fos-v\d+$/.test(k))
        .map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

async function networkFirst(req) {
  const cache = await caches.open(CACHE_NAME);
  const net = fetch(req).then((res) => {
    if (res && res.status === 200) cache.put('./index.html', res.clone());   // keep one copy of the app page
    return res;
  });
  net.catch(() => {});                                       // no unhandled error if we already answered from the saved copy
  try {
    return await Promise.race([
      net,
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), NAV_TIMEOUT_MS))
    ]);
  } catch (e) {
    const saved = (await cache.match('./index.html')) || (await cache.match('./'));
    if (saved) return saved;
    try { return await net; } catch (e2) { return Response.error(); }
  }
}

async function cacheFirst(req) {
  const cache = await caches.open(CACHE_NAME);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res && res.status === 200) cache.put(req, res.clone()).catch(() => {});
  return res;
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(req);
  const refresh = fetch(req)
    .then((res) => {
      if (res && res.status === 200) cache.put(req, res.clone()).catch(() => {});
      return res;
    })
    .catch(() => cached);
  return cached || refresh;
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  if (new URL(req.url).origin !== self.location.origin) return;   // maps, geocoding, Apps Script etc. go straight to the network
  if (req.mode === 'navigate') { event.respondWith(networkFirst(req)); return; }
  const u = new URL(req.url);
  if (/\/vendor\//i.test(u.pathname) || (/\/Document%20Vault\//i.test(u.pathname) && u.searchParams.has('v'))) {
    event.respondWith(cacheFirst(req)); return;
  }
  event.respondWith(staleWhileRevalidate(req));
});
