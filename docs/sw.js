/* SIVEA: guarda la app en el equipo para que abra sin internet.
   Los informes PDF y las respuestas NO pasan por aquí: viven en el navegador del revisor. */
const VERSION = '73b7da0dc797'; // tools/empaquetar.js la reemplaza por la huella de la versión publicada
const CACHE = `sivea-${VERSION}`;
const ARCHIVOS = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './icon-maskable-512.png', './apple-touch-icon.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ARCHIVOS.map((u) => new Request(u, { cache: 'reload' })))));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((llaves) => Promise.all(llaves.filter((k) => k.startsWith('sivea-') && k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

/* Primero lo guardado (abre al instante y sin internet); si hay conexión, trae la versión nueva para la próxima vez. */
self.addEventListener('fetch', (e) => {
  const pedido = e.request;
  if (pedido.method !== 'GET' || new URL(pedido.url).origin !== self.location.origin) return;
  const llave = pedido.mode === 'navigate' ? './index.html' : pedido;
  e.respondWith(caches.open(CACHE).then(async (c) => {
    const guardado = await c.match(llave, { ignoreSearch: true });
    const red = fetch(pedido).then((r) => { if (r.ok) c.put(llave, r.clone()); return r; }).catch(() => null);
    e.waitUntil(red);
    return guardado || (await red) || new Response('Sin conexión', { status: 503 });
  }));
});
