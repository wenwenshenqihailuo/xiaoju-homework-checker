self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open('xiaoju-v1').then((cache) => {
      return cache.addAll([
        '/',
        '/static/manifest.json'
      ]);
    })
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});
