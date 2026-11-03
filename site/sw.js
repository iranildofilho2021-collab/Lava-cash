/**
 * Service Worker para PWA completo
 * Permite funcionamento offline e cache de assets
 * @version 1.1.0
 */

const CACHE_VERSION = '20261103-pages-sync-v1';
const CACHE_PREFIX = `lavacash:${self.registration.scope}:`;
const CACHE_NAME = `${CACHE_PREFIX}app-${CACHE_VERSION}`;
const STATIC_CACHE = `${CACHE_PREFIX}static-${CACHE_VERSION}`;
const DYNAMIC_CACHE = `${CACHE_PREFIX}dynamic-${CACHE_VERSION}`;

// Assets para cache imediato (apenas CSS/JS/assets — NUNCA cachear HTML)
const STATIC_ASSETS = [
  'manifest.json',
  'css/styles.css',
  'js/theme-init.js',
  'js/pwa-init.js',
  'assets/favicon.svg'
];

const OPTIONAL_RUNTIME_ASSETS = [
  '/js/vendor/chart.umd.min.js',
  '/js/vendor/xlsx.full.min.js',
  '/js/vendor-loader.js',
  '/js/mobile-loader.js'
];

// Recursos externos para cache
const EXTERNAL_ASSETS = [
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600;700;800&display=swap'
];

// Instalação do Service Worker
self.addEventListener('install', (event) => {
  console.log('[SW] Instalando Service Worker...');

  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => {
        console.log('[SW] Cacheando assets estáticos...');
        return cache.addAll(STATIC_ASSETS.map(url => {
          return new Request(url, { cache: 'reload' });
        })).catch(err => {
          console.warn('[SW] Alguns assets não puderam ser cacheados:', err);
        });
      })
      .then(() => self.skipWaiting())
      .then(() => console.log('[SW] Nova versão instalada e ativada automaticamente.'))
  );
});

// Ativação do Service Worker
self.addEventListener('activate', (event) => {
  console.log('[SW] Ativando Service Worker...');

  event.waitUntil(
    caches.keys()
      .then((keys) => {
        return Promise.all(
          keys
            .filter(key => key.startsWith(CACHE_PREFIX) && key !== STATIC_CACHE && key !== DYNAMIC_CACHE)
            .map(key => {
              console.log('[SW] Removendo cache antigo:', key);
              return caches.delete(key);
            })
        );
      })
      .then(() => self.clients.claim())
  );
});

// Estratégia de fetch: Network First com fallback para cache
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Ignora requisições não-GET
  if (request.method !== 'GET') return;

  // Nunca intercepta APIs autenticadas. Isso evita cachear dados de um usuário
  // e entregá-los para outra sessão no mesmo dispositivo.
  if (url.hostname.includes('firebase') ||
      url.hostname.includes('supabase.co') ||
      url.hostname.includes('googleapis') ||
      url.hostname.includes('gstatic')) {
    return;
  }

  // Para CSS/JS: Stale While Revalidate (garante que atualizações chegam após 1 carregamento)
  if (/\.(css|js)(\?.*)?$/.test(url.pathname + (url.search || ''))) {
    event.respondWith(OPTIONAL_RUNTIME_ASSETS.some(path => new URL('.' + path, self.registration.scope).pathname === url.pathname)
      ? cacheFirst(request)
      : staleWhileRevalidate(request));
    return;
  }

  // Para outros assets estáticos (imagens, fontes): Cache First
  if (isStaticAsset(request.url)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Para páginas HTML: SEMPRE busca da rede, nunca usa cache
  if (request.headers.get('accept')?.includes('text/html') || /\.html$/.test(url.pathname)) {
    event.respondWith(fetch(request));
    return;
  }

  // Para outros recursos: Stale While Revalidate
  event.respondWith(staleWhileRevalidate(request));
});

// Estratégia: Cache First
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(STATIC_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    console.warn('[SW] Fetch falhou, sem cache disponível:', request.url);
    return new Response('Offline', { status: 503 });
  }
}

// Estratégia: Network First (usado só para recursos não-HTML)
async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(DYNAMIC_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    const cached = await caches.match(request);
    return cached || new Response('Offline', { status: 503 });
  }
}

// Estratégia: Stale While Revalidate
async function staleWhileRevalidate(request) {
  const cache = await caches.open(DYNAMIC_CACHE);
  const cached = await cache.match(request);

  const fallbackResponse = cached || new Response('Offline', {
    status: 503,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' }
  });

  const fetchPromise = fetch(request).then(response => {
    if (response && response.ok) {
      cache.put(request, response.clone());
    }
    return response || fallbackResponse;
  }).catch(() => fallbackResponse);

  return cached || fetchPromise;
}

// Verifica se é um asset estático
function isStaticAsset(url) {
  const staticExtensions = ['.css', '.js', '.svg', '.png', '.jpg', '.jpeg', '.gif', '.woff', '.woff2'];
  return staticExtensions.some(ext => url.includes(ext));
}

// Escuta mensagens do cliente
self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') {
    self.skipWaiting();
  }
});

console.log('[SW] Service Worker carregado!');
