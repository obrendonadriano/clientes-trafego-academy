"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef, useState } from "react";
import { LogOut } from "lucide-react";
import { logoutAction } from "@/app/login/actions";
import { NavIcon } from "@/components/shell/nav-icon";
import { useScopedHref } from "@/components/shell/period-scope";
import { useDismiss } from "@/components/shell/use-dismiss";
import { findActiveSection, getMobileNav } from "@/lib/navigation";
import type { Role } from "@/lib/types";
import { cn } from "@/lib/utils";

const ITEM_CLASS =
  "flex min-h-14 flex-col items-center justify-center gap-1 border-t-2 text-[0.62rem] transition";

// Barra inferior do celular: 3 seções + "Mais" quando há seções sobrando.
export function MobileBottomNav({ role }: { role: Role }) {
  const pathname = usePathname();
  const scopedHref = useScopedHref();
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);

  useDismiss(sheetRef, isMoreOpen, () => setIsMoreOpen(false));

  const { primary, overflow } = getMobileNav(role);
  const activeKey = findActiveSection(role, pathname).key;
  const isOverflowActive = overflow.some((section) => section.key === activeKey);
  const columnCount = primary.length + (overflow.length > 0 ? 1 : 0);

  return (
    <>
      {isMoreOpen ? (
        <div className="fixed inset-0 z-40 bg-black/45 lg:hidden">
          <div
            ref={sheetRef}
            className="absolute inset-x-0 bottom-0 rounded-t-2xl border-t border-border/70 bg-popover p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] dark:border-white/10"
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-border dark:bg-white/20" />

            <div className="flex flex-col gap-1">
              {overflow.map((section) => (
                <Link
                  key={section.key}
                  href={scopedHref(section.href)}
                  onClick={() => setIsMoreOpen(false)}
                  className={cn(
                    "flex min-h-12 items-center gap-3 rounded-xl px-3 text-sm transition",
                    section.key === activeKey
                      ? "bg-primary/[0.12] font-medium text-primary"
                      : "text-foreground hover:bg-muted dark:hover:bg-white/[0.06]",
                  )}
                >
                  <NavIcon name={section.icon} className="size-[1.15rem] shrink-0" />
                  {section.title ?? section.label}
                </Link>
              ))}

              <form action={logoutAction}>
                <button
                  type="submit"
                  className="flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-sm text-muted-foreground transition hover:bg-muted hover:text-foreground dark:hover:bg-white/[0.06]"
                >
                  <LogOut className="size-[1.15rem] shrink-0" strokeWidth={1.75} />
                  Sair
                </button>
              </form>
            </div>
          </div>
        </div>
      ) : null}

      <nav
        aria-label="Navegação"
        style={{ gridTemplateColumns: `repeat(${columnCount},minmax(0,1fr))` }}
        className="fixed bottom-0 left-[env(safe-area-inset-left)] right-[env(safe-area-inset-right)] z-50 grid border-t border-border bg-card/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-12px_32px_-28px_rgba(24,20,38,0.65)] backdrop-blur-xl lg:hidden"
      >
        {primary.map((section) => {
          const isActive = section.key === activeKey;

          return (
            <Link
              key={section.key}
              href={scopedHref(section.href)}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                ITEM_CLASS,
                isActive
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground",
              )}
            >
              <NavIcon name={section.icon} className="size-5" />
              <span className="max-w-full truncate px-1">{section.label}</span>
            </Link>
          );
        })}

        {overflow.length > 0 ? (
          <button
            type="button"
            onClick={() => setIsMoreOpen(true)}
            aria-expanded={isMoreOpen}
            className={cn(
              ITEM_CLASS,
              isOverflowActive
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground",
            )}
          >
            <NavIcon name="mais" className="size-5" />
            <span>Mais</span>
          </button>
        ) : null}
      </nav>
    </>
  );
}
