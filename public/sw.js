// Service worker do portal Tráfego Academy.
//
// 1) Assets estáticos do build (JS, CSS, fontes, imagens, ícones) → cache com
//    stale-while-revalidate. Faz o app abrir instantâneo do 2º load em diante.
//
// HTML/RSC autenticado nunca entra no Cache Storage. Além de ficar obsoleto,
// ele contém dados privados e não pode sobreviver à expiração/troca da sessão.

const STATIC_CACHE = "ta-static-v1";
const KEEP = [STATIC_CACHE];

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

  // Navegações passam sempre pela rede para que autenticação e isolamento de
  // tenant sejam revalidados pelo servidor.
  if (request.mode === "navigate") {
    return;
  }

  // Deixa passar (rede) tudo que não for asset estático: RSC, /api, dados.
  if (!isCacheableAsset(url)) {
    return;
  }

  event.respondWith(staleWhileRevalidate(STATIC_CACHE, request));
});
