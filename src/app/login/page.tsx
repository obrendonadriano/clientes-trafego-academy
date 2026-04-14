import type { Viewport } from "next";
import { PublicLanding } from "@/components/marketing/public-landing";

export const viewport: Viewport = {
  colorScheme: "light",
  themeColor: "#ffffff",
};

export default function LoginPage() {
  return <PublicLanding />;
}
