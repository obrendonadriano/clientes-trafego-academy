"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/components/theme-provider";
import { cn } from "@/lib/utils";

type ThemeToggleProps = {
  className?: string;
  // Versão compacta (botão quadrado só com ícone) para barras estreitas.
  compact?: boolean;
};

// Interruptor deslizante de tema (claro/escuro) ligado ao ThemeProvider.
export function ThemeToggle({ className, compact }: ThemeToggleProps) {
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  if (compact) {
    return (
      <button
        type="button"
        role="switch"
        aria-checked={isDark}
        aria-label={isDark ? "Ativar tema claro" : "Ativar tema escuro"}
        onClick={() => setTheme(isDark ? "light" : "dark")}
        className={cn(
          "grid size-10 shrink-0 place-items-center rounded-full border transition-colors",
          isDark
            ? "border-white/10 bg-white/[0.06] text-amber-300 hover:bg-white/10"
            : "border-border bg-muted text-slate-600 hover:bg-muted/70",
          className,
        )}
      >
        {isDark ? (
          <Sun className="size-[1.05rem]" strokeWidth={1.75} />
        ) : (
          <Moon className="size-[1.05rem]" strokeWidth={1.75} />
        )}
      </button>
    );
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isDark}
      aria-label={isDark ? "Ativar tema claro" : "Ativar tema escuro"}
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className={cn(
        "flex h-9 w-16 shrink-0 items-center rounded-full border p-1 transition-colors",
        isDark
          ? "border-white/10 bg-white/[0.08]"
          : "border-border bg-muted",
        className,
      )}
    >
      <span
        className={cn(
          "flex size-7 items-center justify-center rounded-full shadow-sm transition-transform duration-300",
          isDark
            ? "translate-x-0 bg-primary text-white"
            : "translate-x-7 bg-white text-amber-500",
        )}
      >
        {isDark ? (
          <Moon className="size-4" strokeWidth={1.75} />
        ) : (
          <Sun className="size-4" strokeWidth={1.75} />
        )}
      </span>
    </button>
  );
}
