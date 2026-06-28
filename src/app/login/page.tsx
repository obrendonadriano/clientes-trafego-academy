import type { Viewport } from "next";
import { PublicLanding } from "@/components/marketing/public-landing";

export const viewport: Viewport = {
  // Login abre no tema claro por padrão; o ThemeMetaSync ajusta a cor da barra
  // do navegador caso o usuário troque para o escuro.
  colorScheme: "light dark",
  themeColor: "#ffffff",
};

export default function LoginPage() {
  return <PublicLanding />;
}
