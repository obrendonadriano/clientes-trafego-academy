"use client";

import { MoonStar, SunMedium } from "lucide-react";
import { useTheme } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const nextTheme = isDark ? "light" : "dark";
  const label = nextTheme === "light" ? "Tema branco" : "Tema escuro";

  return (
    <Button
      type="button"
      variant="outline"
      className="w-full gap-2 rounded-full border-border/70 bg-background/70 text-foreground hover:bg-accent hover:text-accent-foreground lg:w-auto"
      onClick={() => setTheme(nextTheme)}
      aria-label={label}
    >
      {isDark ? <SunMedium className="size-4" /> : <MoonStar className="size-4" />}
      {label}
    </Button>
  );
}
