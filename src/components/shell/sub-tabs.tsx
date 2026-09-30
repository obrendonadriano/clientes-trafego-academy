"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { IntentPrefetchLink } from "@/components/shell/intent-prefetch-link";
import { useScopedHref } from "@/components/shell/period-scope";
import { isSubTabActive, type NavSubTab } from "@/lib/navigation";
import { cn } from "@/lib/utils";

// Sub-abas da seção atual, logo abaixo da topbar.
export function SubTabs({ tabs }: { tabs: NavSubTab[] }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const scopedHref = useScopedHref();

  if (tabs.length === 0) {
    return null;
  }

  return (
    <nav
      aria-label="Navegação da seção"
      className="scrollbar-hidden relative z-20 flex min-w-0 shrink-0 items-end gap-[1.4rem] overflow-x-auto overflow-y-hidden border-b border-border bg-card px-4 lg:px-7"
    >
      {tabs.map((tab) => {
        const isActive = isSubTabActive(tab, pathname, searchParams);

        return (
          <IntentPrefetchLink
            key={tab.href}
            href={scopedHref(tab.href)}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "-mb-px shrink-0 whitespace-nowrap border-b-2 py-3 text-[13.5px] transition",
              isActive
                ? "border-primary font-medium text-brand-700"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
          </IntentPrefetchLink>
        );
      })}
    </nav>
  );
}
