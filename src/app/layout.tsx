import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ServiceWorkerRegister } from "@/components/service-worker-register";

const geist = Geist({
  variable: "--font-geist",
  subsets: ["latin"],
});

// Fonte variável: sem `weight` fixo. Pesos fixos geram um arquivo por peso e o
// Turbopack da Vercel falhava ao resolvê-los ("queries have exactly one entry").
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Tráfego Academy Dashboard",
  description:
    "Portal privado para clientes da Tráfego Academy com dashboard, campanhas e conversões.",
  metadataBase: new URL("https://dashboard.trafegoacademy.online"),
  applicationName: "Tráfego Academy",
  // Favicon e apple-touch-icon vêm das convenções de arquivo do Next
  // (src/app/icon.png e src/app/apple-icon.png), ambos gerados do logo.png.
  // Faz o iOS abrir em tela cheia (sem a barra do Safari) quando adicionado à
  // tela de início, com cara de app nativo.
  appleWebApp: {
    capable: true,
    title: "Tráfego Academy",
    statusBarStyle: "default",
  },
  // Este Next só emite `mobile-web-app-capable`; iPhones mais antigos ainda
  // exigem a meta legada `apple-mobile-web-app-capable` para abrir em tela cheia.
  other: {
    "apple-mobile-web-app-capable": "yes",
  },
};

export const viewport: Viewport = {
  // Tema único claro: a barra do navegador acompanha o fundo do painel.
  colorScheme: "light",
  themeColor: "#f7f8fa",
  // Permite que o conteúdo use a tela inteira (atrás do notch); o body
  // compensa com safe-area-inset no globals.css.
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt-BR"
      data-scroll-behavior="smooth"
      suppressHydrationWarning
      className={`${geist.variable} ${geistMono.variable}`}
    >
      <body
        suppressHydrationWarning
        className="min-h-screen bg-background font-sans text-foreground antialiased"
      >
        <ServiceWorkerRegister />
        {children}
      </body>
    </html>
  );
}
