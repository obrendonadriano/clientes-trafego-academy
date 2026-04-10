"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type Theme = "light" | "dark";

type ThemeProviderProps = {
  children: ReactNode;
  defaultTheme?: Theme;
};

type ThemeContextValue = {
  theme: Theme;
  resolvedTheme: Theme;
  setTheme: (theme: Theme) => void;
};

const THEME_STORAGE_KEY = "ta-theme";

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({
  children,
  defaultTheme = "dark",
}: ThemeProviderProps) {
  const [theme, setThemeState] = useState<Theme>(() => {
    if (typeof window === "undefined") {
      return defaultTheme;
    }

    const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
    return storedTheme === "light" || storedTheme === "dark"
      ? storedTheme
      : defaultTheme;
  });

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  function setTheme(nextTheme: Theme) {
    applyTheme(nextTheme);
    window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
    setThemeState(nextTheme);
  }

  const value = useMemo(
    () => ({
      theme,
      resolvedTheme: theme,
      setTheme,
    }),
    [theme],
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
