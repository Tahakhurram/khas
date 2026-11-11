// KHAS service worker: caches the app shell so the app opens offline (read-only, last loaded data).
// GitHub API calls are never cached here. Bump VERSION when files change.
const VERSION = 'khas-v1';
const SHELL = ['./', 'index.html', 'css/style.css', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png', 'users.json',
  'js/app.js', 'js/util.js', 'js/ui.js', 'js/store.js', 'js/github.js', 'js/seed.js', 'js/engine.js', 'js/calc.js', 'js/hostel-calc.js', 'js/excel.js', 'js/world.js', 'js/demo.js',
  'js/views/entry.js', 'js/views/units.js', 'js/views/overview.js', 'js/views/books.js', 'js/views/admin.js',
  'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js', 'https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(VERSION).then((c) => Promise.allSettled(SHELL.map((u) => c.add(u)))).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.hostname === 'api.github.com') return;
  // Network first, so updates arrive as soon as you are online; fall back to the cached copy offline.
  e.respondWith(fetch(e.request).then((res) => {
    if (res.ok && (url.origin === location.origin || /cdnjs|fonts\.(googleapis|gstatic)/.test(url.hostname))) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(url.origin === location.origin ? url.pathname : e.request, copy)); }
    return res;
  }).catch(() => caches.match(url.origin === location.origin ? url.pathname : e.request).then((r) => r || caches.match(e.request, { ignoreSearch: true })).then((r) => r || Response.error())));
});
