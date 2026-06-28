import type { Viewport } from "next";
import { PublicLanding } from "@/components/marketing/public-landing";

export const viewport: Viewport = {
  // Login segue o tema (escuro como padrão no mobile); o ThemeMetaSync ajusta
  // a cor da barra do navegador conforme o tema escolhido.
  colorScheme: "dark light",
  themeColor: "#08070d",
};

export default function LoginPage() {
  return <PublicLanding />;
}
