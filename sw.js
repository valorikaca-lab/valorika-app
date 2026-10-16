// Service worker: guarda la "cáscara" de la app para que abra sin señal.
// Los datos (Supabase) nunca se cachean aquí. Subir VERSION en cada despliegue.
const VERSION = 'valorika-v10';
const CASCARA = [
  './', 'index.html', 'manifest.json', 'css/estilos.css?v=10', 'js/config.js?v=10', 'js/app.js?v=10',
  'js/util.js', 'js/recorrido.js', 'js/vistas/acceso.js', 'js/vistas/admin.js', 'js/vistas/junta.js', 'js/vistas/residente.js',
  'js/vistas/cartelera.js', 'js/vistas/empresa.js', 'js/vistas/recibo.js', 'js/vistas/cuentas.js', 'js/vistas/gastos.js', 'js/vistas/config.js', 'js/vistas/importar.js', 'js/vistas/plataforma.js',
  'img/icono.svg',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(CASCARA)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return; // Supabase y CDN van directo
  // Red primero; si no hay señal, lo guardado.
  e.respondWith(
    fetch(e.request)
      .then((r) => { const copia = r.clone(); caches.open(VERSION).then((c) => c.put(e.request, copia)); return r; })
      .catch(() => caches.match(e.request).then((r) => r || caches.match('index.html')))
  );
});
