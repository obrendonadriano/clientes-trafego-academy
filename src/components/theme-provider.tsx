"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";

type Theme = "light" | "dark";

type ThemeContextValue = {
  resolvedTheme: Theme;
  setTheme: (theme: Theme) => void;
};

// Tema padrão POR ÁREA: a área de login/pública abre clara e a área logada
// (admin/dashboard) abre escura. A escolha do usuário é salva separadamente
// por área — trocar o tema no dashboard não muda o login e vice-versa.
const APP_THEME_KEY = "ta-theme-app";
const PUBLIC_THEME_KEY = "ta-theme-public";

const ThemeContext = createContext<ThemeContextValue | null>(null);

function isAppPath(pathname: string) {
  return pathname.startsWith("/admin") || pathname.startsWith("/dashboard");
}

function readStored(key: string): Theme | null {
  if (typeof window === "undefined") {
    return null;
  }

  const value = window.localStorage.getItem(key);
  return value === "light" || value === "dark" ? value : null;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isApp = isAppPath(pathname);

  const [appPref, setAppPref] = useState<Theme | null>(() =>
    readStored(APP_THEME_KEY),
  );
  const [publicPref, setPublicPref] = useState<Theme | null>(() =>
    readStored(PUBLIC_THEME_KEY),
  );

  // Sem escolha salva, usa o padrão da área (app = escuro, público = claro).
  const explicit = isApp ? appPref : publicPref;
  const resolvedTheme: Theme = explicit ?? (isApp ? "dark" : "light");

  useEffect(() => {
    applyTheme(resolvedTheme);
  }, [resolvedTheme]);

  function setTheme(next: Theme) {
    if (isApp) {
      window.localStorage.setItem(APP_THEME_KEY, next);
      setAppPref(next);
    } else {
      window.localStorage.setItem(PUBLIC_THEME_KEY, next);
      setPublicPref(next);
    }
  }

  const value = useMemo<ThemeContextValue>(
    () => ({ resolvedTheme, setTheme }),
    // setTheme depende de isApp (qual área salvar/atualizar).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [resolvedTheme, isApp],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);

  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider.");
  }

  return context;
}

function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
  document.documentElement.style.colorScheme = theme;
}
