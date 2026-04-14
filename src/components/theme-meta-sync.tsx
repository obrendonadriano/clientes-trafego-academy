"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useTheme } from "@/components/theme-provider";

const LOGIN_THEME_COLOR = "#ffffff";
const LIGHT_THEME_COLOR = "#f6f7ff";
const DARK_THEME_COLOR = "#08070d";

export function ThemeMetaSync() {
  const pathname = usePathname();
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    const themeColor =
      pathname === "/login" ? LOGIN_THEME_COLOR : resolvedTheme === "dark" ? DARK_THEME_COLOR : LIGHT_THEME_COLOR;

    let meta = document.querySelector('meta[name="theme-color"]');

    if (!meta) {
      meta = document.createElement("meta");
      meta.setAttribute("name", "theme-color");
      document.head.appendChild(meta);
    }

    meta.setAttribute("content", themeColor);
  }, [pathname, resolvedTheme]);

  return null;
}
