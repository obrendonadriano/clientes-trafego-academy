"use client";

import { useEffect } from "react";

// Registra o service worker (public/sw.js) que guarda os arquivos do app no
// navegador, deixando os carregamentos seguintes instantâneos.
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }

    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Falha ao registrar não pode quebrar o app — apenas perde o cache.
      });
    };

    // Registra depois do load para não competir com o primeiro render.
    if (document.readyState === "complete") {
      register();
    } else {
      window.addEventListener("load", register, { once: true });
      return () => window.removeEventListener("load", register);
    }
  }, []);

  return null;
}
