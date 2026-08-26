"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
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
const THEME_CHANGE_EVENT = "ta-theme-change";

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

function subscribeToStoredTheme(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);
  window.addEventListener(THEME_CHANGE_EVENT, onStoreChange);

  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener(THEME_CHANGE_EVENT, onStoreChange);
  };
}

function getAppThemeSnapshot() {
  return readStored(APP_THEME_KEY);
}

function getPublicThemeSnapshot() {
  return readStored(PUBLIC_THEME_KEY);
}

function getServerThemeSnapshot(): Theme | null {
  return null;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isApp = isAppPath(pathname);

  // useSyncExternalStore mantém o primeiro snapshot do servidor estável e só
  // lê o localStorage depois da hidratação, sem renderização divergente.
  const appPref = useSyncExternalStore(
    subscribeToStoredTheme,
    getAppThemeSnapshot,
    getServerThemeSnapshot,
  );
  const publicPref = useSyncExternalStore(
    subscribeToStoredTheme,
    getPublicThemeSnapshot,
    getServerThemeSnapshot,
  );

  // Sem escolha salva, usa o padrão da área (app = escuro, público = claro).
  const explicit = isApp ? appPref : publicPref;
  const resolvedTheme: Theme = explicit ?? (isApp ? "dark" : "light");

  useEffect(() => {
    applyTheme(resolvedTheme);
  }, [resolvedTheme]);

  const setTheme = useCallback((next: Theme) => {
    if (isApp) {
      window.localStorage.setItem(APP_THEME_KEY, next);
    } else {
      window.localStorage.setItem(PUBLIC_THEME_KEY, next);
    }
    window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
  }, [isApp]);

  const value = useMemo<ThemeContextValue>(
    () => ({ resolvedTheme, setTheme }),
    [resolvedTheme, setTheme],
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
