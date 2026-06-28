"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

// Ao reabrir/voltar o foco no app, atualiza os dados em segundo plano. Junto
// com o cache de páginas do service worker, isso faz a tela abrir instantânea
// com o último dado e, se algum cliente importou métricas, atualizar sozinha.
export function RevalidateOnFocus() {
  const router = useRouter();

  useEffect(() => {
    const revalidate = () => {
      if (document.visibilityState === "visible") {
        router.refresh();
      }
    };

    document.addEventListener("visibilitychange", revalidate);
    window.addEventListener("focus", revalidate);

    return () => {
      document.removeEventListener("visibilitychange", revalidate);
      window.removeEventListener("focus", revalidate);
    };
  }, [router]);

  return null;
}
