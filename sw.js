const CACHE_NAME = 'arbeitszeit-v3-9-35';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './types.js',
  './modules/state.js',
  './modules/migrations.js',
  './modules/util-time.js',
  './modules/util-format.js',
  './modules/holidays.js',
  './modules/compute.js',
  './modules/selectors.js',
  './modules/render/summary.js',
  './modules/render/report.js',
  './modules/render/overview.js',
  './modules/render/entries.js',
  './modules/render/week.js',
  './modules/render/employers.js',
  './modules/render/archive.js',
  './modules/render/tracker.js',
  './modules/export/word.js',
  './modules/export/pdf.js',
  './modules/export/overview-pdf.js',
  './modules/export/download.js',
  './modules/sw-update.js',
  './modules/whatsnew.js',
  './modules/backup.js',
  './modules/share.js',
  './modules/ui/entry-modal.js',
  './modules/ui/homeoffice-modal.js',
  './modules/ui/employer-modal.js',
  './modules/ui/holiday-overrides.js',
  './modules/ui/templates.js',
  './modules/regression-bridge.js',
  './modules/constants.js',
  './modules/bootstrap.js',
  './modules/lib-loader.js',
  './manifest.json',
  './icon.svg',
  './icon-192.png',
  './icon-512.png',
  './icon-512-maskable.png',
  // Erweiterte Icon-Palette (PWA-Feinschliff v3.9.25)
  './icons/icon-16.png',
  './icons/icon-32.png',
  './icons/icon-96.png',
  './icons/icon-144.png',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-192-maskable.png',
  './icons/icon-384.png',
  './icons/icon-512.png',
  './icons/icon-512-maskable.png',
  // iOS Splash Screens
  './splash/iphone-15-pm-portrait.png',
  './splash/iphone-15-pm-landscape.png',
  './splash/iphone-15-portrait.png',
  './splash/iphone-15-landscape.png',
  './splash/iphone-se-portrait.png',
  './splash/ipad-pro-13-portrait.png',
  './splash/ipad-pro-13-landscape.png',
  './splash/ipad-pro-11-portrait.png',
  './splash/ipad-pro-11-landscape.png',
  './splash/ipad-102-portrait.png',
  './splash/ipad-102-landscape.png',
  './splash/ipad-mini-portrait.png',
  './splash/ipad-mini-landscape.png',
  './diag.html',
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
