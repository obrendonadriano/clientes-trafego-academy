import type { MetadataRoute } from "next";

// Web App Manifest: faz o portal ser instalável como app (tela de início do
// iPhone/Android) e abrir em tela cheia, sem a barra do navegador.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Tráfego Academy",
    short_name: "Tráfego Academy",
    description:
      "Portal privado para clientes da Tráfego Academy com dashboard e relatórios.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#08070d",
    theme_color: "#08070d",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
