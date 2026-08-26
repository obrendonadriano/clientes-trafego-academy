"use client";

import Image from "next/image";
import { usePathname } from "next/navigation";
import { LogOut } from "lucide-react";
import { logoutAction } from "@/app/login/actions";
import { IntentPrefetchLink } from "@/components/shell/intent-prefetch-link";
import { NavIcon } from "@/components/shell/nav-icon";
import { useScopedHref } from "@/components/shell/period-scope";
import { findActiveSection, getSectionGroups } from "@/lib/navigation";
import type { Role } from "@/lib/types";
import { cn } from "@/lib/utils";

// Trilho de ícones do desktop: logo, grupos de seções e sair no rodapé.
export function AppRail({ role }: { role: Role }) {
  const pathname = usePathname();
  const scopedHref = useScopedHref();
  const groups = getSectionGroups(role);
  const activeKey = findActiveSection(role, pathname).key;

  return (
    <nav
      aria-label="Navegação principal"
      className="relative z-30 hidden h-full min-h-0 w-[84px] shrink-0 flex-col items-center gap-[1.4rem] overflow-hidden border-r border-border bg-card py-[1.05rem] lg:flex"
    >
      <IntentPrefetchLink
        href={role === "admin" ? "/admin" : "/dashboard"}
        aria-label="Tráfego Academy"
        className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-lg border border-border bg-background p-0.5"
      >
        <Image
          src="/icon-192.png"
          alt="Tráfego Academy"
          width={48}
          height={48}
          className="h-full w-full scale-[1.15] object-contain"
        />
      </IntentPrefetchLink>

      {groups.map((group, index) => (
        <div key={group.label} className="flex w-full flex-col items-center gap-2">
          {index > 0 ? (
            <div className="mb-[0.7rem] h-px w-10 bg-gradient-to-r from-transparent via-border to-transparent" />
          ) : null}

          <p className="mb-0.5 text-[0.56rem] font-medium uppercase tracking-[0.14em] text-muted-foreground/70">
            {group.label}
          </p>

          {group.sections.map((section) => {
            const isActive = section.key === activeKey;

            return (
              <IntentPrefetchLink
                key={section.key}
                href={scopedHref(section.href)}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "flex w-[64px] flex-col items-center gap-1 rounded-lg border px-0.5 py-2 text-[0.59rem] leading-tight transition active:scale-[0.97]",
                  isActive
                    ? "border-primary/30 bg-primary/[0.14] text-primary"
                    : "border-transparent text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                )}
              >
                <NavIcon name={section.icon} className="size-[1.125rem]" />
                <span className="w-full text-center leading-[1.15]">{section.label}</span>
              </IntentPrefetchLink>
            );
          })}
        </div>
      ))}

      <form action={logoutAction} className="mt-auto">
        <button
          type="submit"
          title="Sair"
          aria-label="Sair"
          className="grid size-10 place-items-center rounded-xl border border-border/70 text-muted-foreground transition hover:bg-muted/70 hover:text-foreground dark:border-white/10 dark:hover:bg-white/[0.06]"
        >
          <LogOut className="size-[1.125rem]" strokeWidth={1.75} />
        </button>
      </form>
    </nav>
  );
}
