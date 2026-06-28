// Service worker do portal Tráfego Academy.
//
// Objetivo: deixar o app "instantâneo" do segundo carregamento em diante,
// guardando no navegador os arquivos estáticos do build (JS, CSS, fontes,
// imagens e ícones) — que têm hash no nome e nunca mudam de conteúdo.
//
// O que NÃO é cacheado aqui: HTML, payloads RSC, rotas /api e qualquer dado
// dinâmico. Esses sempre vão à rede, para o cliente nunca ver métrica velha e
// para não misturar dados privados entre contas no mesmo aparelho.

const CACHE = "ta-static-v1";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)),
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

self.addEventListener("fetch", (event) => {
  const request = event.request;

  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);

  // Deixa passar (rede) tudo que não for asset estático: HTML, RSC, /api, dados.
  if (!isCacheableAsset(url)) {
    return;
  }

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const cached = await cache.match(request);

      if (cached) {
        // Stale-while-revalidate: serve do cache na hora e atualiza ao fundo.
        event.waitUntil(
          fetch(request)
            .then((response) => {
              if (response && response.ok) {
                cache.put(request, response.clone());
              }
            })
            .catch(() => {}),
        );
        return cached;
      }

      try {
        const response = await fetch(request);
        if (response && response.ok) {
          cache.put(request, response.clone());
        }
        return response;
      } catch {
        return cached ?? Response.error();
      }
    })(),
  );
});
