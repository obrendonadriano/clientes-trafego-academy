"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

const PAGES_CACHE = "ta-pages-v1";

// Registra o service worker (public/sw.js) que guarda os arquivos do app no
// navegador, deixando os carregamentos seguintes instantâneos.
export function ServiceWorkerRegister() {
  const pathname = usePathname();

  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }

    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Falha ao registrar não pode quebrar o app — apenas perde o cache.
      });
    };

    if (document.readyState === "complete") {
      register();
    } else {
      window.addEventListener("load", register, { once: true });
      return () => window.removeEventListener("load", register);
    }
  }, []);

  // Fora da área logada (ex.: tela de login após sair) limpa o cache de páginas
  // privadas, para que um próximo login não veja dados em cache de outra conta.
  useEffect(() => {
    const isApp =
      pathname.startsWith("/admin") || pathname.startsWith("/dashboard");

    if (isApp || typeof window === "undefined") {
      return;
    }

    if (typeof caches !== "undefined") {
      caches.delete(PAGES_CACHE).catch(() => {});
    }
    navigator.serviceWorker?.controller?.postMessage("clear-pages-cache");
  }, [pathname]);

  return null;
}
