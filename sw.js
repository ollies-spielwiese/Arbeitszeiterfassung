// rebuild trigger 1783173081
const CACHE_NAME = 'arbeitszeit-v3-3';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.json',
  './icon.svg',
  './icon-192.png',
  './icon-512.png',
  './icon-512-maskable.png',
  'https://unpkg.com/docx@8.5.0/build/index.umd.js',
  'https://unpkg.com/jspdf@2.5.2/dist/jspdf.umd.min.js',
  'https://unpkg.com/jspdf-autotable@3.8.4/dist/jspdf.plugin.autotable.min.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // Cache core assets individually so a single failure doesn't kill the install
      return Promise.all(
        ASSETS.map((url) => cache.add(url).catch((err) => console.warn('Cache miss for', url, err)))
      );
    })
  );
  // Do not skipWaiting automatically — wait for the client to opt in via message.
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request)
        .then((response) => {
          // Cache successful GET responses for future offline use
          if (response && response.status === 200 && (request.url.startsWith(self.location.origin) || request.url.includes('unpkg.com'))) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => {
          // Offline fallback for navigation requests
          if (request.mode === 'navigate') return caches.match('./index.html');
          return new Response('Offline', { status: 503 });
        });
    })
  );
});
