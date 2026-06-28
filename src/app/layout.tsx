import type { Metadata, Viewport } from "next";
import { Manrope, Space_Grotesk } from "next/font/google";
import "./globals.css";
import { ServiceWorkerRegister } from "@/components/service-worker-register";
import { ThemeMetaSync } from "@/components/theme-meta-sync";
import { ThemeProvider } from "@/components/theme-provider";

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
});

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
});

// Aplica o tema antes da página pintar, evitando o "flash" de tema errado.
// Padrão por área (espelha o ThemeProvider): app (admin/dashboard) abre escuro,
// login/público abre claro; a escolha salva por área tem prioridade.
const themeInitScript = `(function(){try{var p=location.pathname;var app=p.indexOf("/admin")===0||p.indexOf("/dashboard")===0;var s=localStorage.getItem(app?"ta-theme-app":"ta-theme-public");var dark=s?s==="dark":app;var e=document.documentElement;e.classList.toggle("dark",dark);e.style.colorScheme=dark?"dark":"light";}catch(e){}})();`;

export const metadata: Metadata = {
  title: "Tráfego Academy Dashboard",
  description:
    "Portal privado para clientes da Tráfego Academy com dashboard, permissões e relatórios com IA.",
  metadataBase: new URL("https://dashboard.trafegoacademy.online"),
  applicationName: "Tráfego Academy",
  // Favicon e apple-touch-icon vêm das convenções de arquivo do Next
  // (src/app/icon.png e src/app/apple-icon.png), ambos gerados do logo.png.
  // Faz o iOS abrir em tela cheia (sem a barra do Safari) quando adicionado à
  // tela de início, com cara de app nativo.
  appleWebApp: {
    capable: true,
    title: "Tráfego Academy",
    statusBarStyle: "black-translucent",
  },
  // Este Next só emite `mobile-web-app-capable`; iPhones mais antigos ainda
  // exigem a meta legada `apple-mobile-web-app-capable` para abrir em tela cheia.
  other: {
    "apple-mobile-web-app-capable": "yes",
  },
};

export const viewport: Viewport = {
  colorScheme: "dark light",
  themeColor: "#08070d",
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
      suppressHydrationWarning
      className={`${manrope.variable} ${spaceGrotesk.variable}`}
    >
      <body
        suppressHydrationWarning
        className="min-h-screen bg-background font-sans text-foreground antialiased"
      >
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <ThemeProvider>
          <ServiceWorkerRegister />
          <ThemeMetaSync />
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
