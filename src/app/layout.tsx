import type { Metadata, Viewport } from "next";
import { Manrope, Space_Grotesk } from "next/font/google";
import "./globals.css";
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
        <ThemeProvider
          defaultTheme="dark"
        >
          <ThemeMetaSync />
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
