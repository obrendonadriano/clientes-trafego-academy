import type { Viewport } from "next";
import { PublicLanding } from "@/components/marketing/public-landing";

export const viewport: Viewport = {
  colorScheme: "light",
  themeColor: "#f7f8fa",
};

export default function LoginPage() {
  return <PublicLanding />;
}
