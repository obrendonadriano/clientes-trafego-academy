"use client";

import { MoonStar, SunMedium } from "lucide-react";
import { useTheme } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const nextTheme = isDark ? "light" : "dark";
  const label = nextTheme === "light" ? "Tema claro" : "Tema escuro";
  const shortLabel = nextTheme === "light" ? "Claro" : "Escuro";

  return (
    <Button
      type="button"
      variant="outline"
      className="w-full min-w-0 gap-2 rounded-full px-4 lg:w-full"
      onClick={() => setTheme(nextTheme)}
      aria-label={label}
    >
      {isDark ? <SunMedium className="size-4 shrink-0" /> : <MoonStar className="size-4 shrink-0" />}
      <span className="truncate">{shortLabel}</span>
    </Button>
  );
}
