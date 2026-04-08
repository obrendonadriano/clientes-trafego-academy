"use client";

import { Contrast } from "lucide-react";
import { useTheme } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  return (
    <Button
      type="button"
      variant="outline"
      className="gap-2 rounded-full"
      onClick={() => setTheme(isDark ? "light" : "dark")}
    >
      <Contrast className="size-4" />
      Alternar tema
    </Button>
  );
}
