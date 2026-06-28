// Service worker do portal Tráfego Academy.
//
// 1) Assets estáticos do build (JS, CSS, fontes, imagens, ícones) → cache com
//    stale-while-revalidate. Faz o app abrir instantâneo do 2º load em diante.
//
// 2) Páginas do app (admin/dashboard) → ao reabrir, serve a ÚLTIMA versão na
//    hora (do cache) e atualiza ao fundo. Como os dados só mudam quando alguém
//    importa métricas, mostrar o último dado na hora deixa a navegação
//    instantânea. A página revalida sozinha ao voltar ao foco (ver shell).
//
// O que NUNCA é cacheado: /api, payloads RSC, login/público e respostas com
// redirect. O cache de páginas é limpo no logout (privacidade).

const STATIC_CACHE = "ta-static-v1";
const PAGES_CACHE = "ta-pages-v1";
const KEEP = [STATIC_CACHE, PAGES_CACHE];

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((key) => !KEEP.includes(key)).map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

// Permite ao app pedir a limpeza do cache de páginas (no logout).
self.addEventListener("message", (event) => {
  if (event.data === "clear-pages-cache") {
    event.waitUntil(caches.delete(PAGES_CACHE));
  }
});

function isCacheableAsset(url) {
  if (url.origin !== self.location.origin) {
    return false;
  }

  if (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/_next/image")
  ) {
    return true;
  }

  return /\.(?:js|css|woff2?|ttf|otf|png|webp|svg|jpg|jpeg|gif|ico)$/.test(
    url.pathname,
  );
}

// Só as páginas logadas entram no cache de navegação.
function isPrivatePage(url) {
  return (
    url.origin === self.location.origin &&
    (url.pathname === "/admin" ||
      url.pathname.startsWith("/admin/") ||
      url.pathname === "/dashboard" ||
      url.pathname.startsWith("/dashboard/"))
  );
}

async function staleWhileRevalidate(cacheName, request) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  const networkPromise = fetch(request)
    .then((response) => {
      // Não cacheia erro nem redirect (ex.: sessão expirada → /login).
      if (response && response.ok && !response.redirected) {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => null);

  if (cached) {
    return cached;
  }

  const response = await networkPromise;
  return response ?? cached ?? Response.error();
}

self.addEventListener("fetch", (event) => {
  const request = event.request;

  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);

  // Navegações (reabrir o app, recarregar): última versão na hora + revalida.
  if (request.mode === "navigate") {
    if (isPrivatePage(url)) {
      event.respondWith(staleWhileRevalidate(PAGES_CACHE, request));
    }
    return;
  }

  // Deixa passar (rede) tudo que não for asset estático: RSC, /api, dados.
  if (!isCacheableAsset(url)) {
    return;
  }

  event.respondWith(staleWhileRevalidate(STATIC_CACHE, request));
});
