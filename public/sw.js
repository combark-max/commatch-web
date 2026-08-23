self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Push delivery and notification click handling are intentionally deferred to
// Phase 2-B. This worker has no fetch handler and creates no offline cache.
