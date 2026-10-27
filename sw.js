// Service worker: guarda la "cáscara" de la app para que abra sin señal.
// Los datos (Supabase) nunca se cachean aquí. Subir VERSION en cada despliegue.
const VERSION = 'valorika-v14';
const CASCARA = [
  './', 'index.html', 'manifest.json', 'css/estilos.css?v=14', 'js/config.js?v=14', 'js/app.js?v=14',
  'js/util.js', 'js/recorrido.js', 'js/vistas/acceso.js', 'js/vistas/admin.js', 'js/vistas/junta.js', 'js/vistas/residente.js',
  'js/vistas/cartelera.js', 'js/vistas/empresa.js', 'js/vistas/recibo.js', 'js/vistas/cuentas.js', 'js/vistas/gastos.js', 'js/vistas/config.js', 'js/vistas/importar.js', 'js/vistas/plataforma.js', 'js/vistas/legal.js', 'js/vistas/documentos.js', 'js/vistas/balance.js', 'js/vistas/alertas.js',
  'img/icono.svg',
];

self.addEventListener('install', (e) => {
  // 'reload': baja los archivos del servidor, nunca de la caché del navegador (si no, se guardan versiones viejas).
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(CASCARA.map((u) => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return; // Supabase y CDN van directo
  // Red primero, siempre confirmando con el servidor (así no se mezclan versiones tras publicar);
  // si no hay señal, lo guardado.
  const pedido = e.request.mode === 'navigate' ? e.request : new Request(e.request, { cache: 'no-cache' });
  e.respondWith(
    fetch(pedido)
      .then((r) => { const copia = r.clone(); caches.open(VERSION).then((c) => c.put(e.request, copia)); return r; })
      .catch(() => caches.match(e.request).then((r) => r || caches.match('index.html')))
  );
});
