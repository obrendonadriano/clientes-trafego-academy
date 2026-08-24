"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";
import { AppRail } from "@/components/shell/app-rail";
import { AppTopbar } from "@/components/shell/app-topbar";
import type { ClientOption } from "@/components/shell/client-switcher";
import type { SearchEntry } from "@/components/shell/global-search";
import { MobileBottomNav } from "@/components/shell/mobile-bottom-nav";
import { SubTabs } from "@/components/shell/sub-tabs";
import { RevalidateOnFocus } from "@/components/dashboard/revalidate-on-focus";
import { ToastProvider } from "@/components/ui/toast";
import { findActiveSection } from "@/lib/navigation";
import type { SyncStatus, User } from "@/lib/types";

type AppShellProps = {
  children: ReactNode;
  user: User;
  clients: ClientOption[];
  searchEntries: SearchEntry[];
  syncStatus?: SyncStatus | null;
  maxRangeDays?: number;
  maxRangeLabel?: string;
};

// Moldura de todas as telas logadas: trilho, topbar, sub-abas e barra inferior.
export function AppShell({
  children,
  user,
  clients,
  searchEntries,
  syncStatus,
  maxRangeDays,
  maxRangeLabel,
}: AppShellProps) {
  const pathname = usePathname();
  const contentRef = useRef<HTMLElement>(null);
  const section = findActiveSection(user.role, pathname);
  const showsCampaignTabsInContent = section.key === "campanhas";

  useEffect(() => {
    contentRef.current?.scrollTo({ top: 0 });
  }, [pathname]);

  return (
    <ToastProvider>
    <div className="fixed inset-x-0 bottom-[env(safe-area-inset-bottom)] top-[env(safe-area-inset-top)] min-h-0 w-full overflow-hidden bg-[#ececf2] lg:px-4 lg:py-4 dark:bg-[#161826]">
      <div className="app-shell-frame flex h-full min-h-0 w-full overflow-hidden bg-background lg:rounded-[0.875rem] lg:border lg:border-border lg:shadow-[0_16px_40px_rgba(0,0,0,0.45)]">
        <RevalidateOnFocus />
        <AppRail role={user.role} />

        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <AppTopbar
            user={user}
            clients={clients}
            searchEntries={searchEntries}
            syncStatus={syncStatus}
            maxRangeDays={maxRangeDays}
            maxRangeLabel={maxRangeLabel}
          />

          {showsCampaignTabsInContent ? null : <SubTabs tabs={section.subTabs} />}

          {/* A moldura não rola: somente o conteúdo desta aba. No celular, o
              padding inferior preserva a área ocupada pela navegação fixa. */}
          <main
            ref={contentRef}
            id="app-content"
            tabIndex={-1}
            className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-y-contain px-3 pb-[calc(4.5rem+env(safe-area-inset-bottom))] pt-5 [scrollbar-gutter:stable] lg:px-[1.05rem] lg:pb-7 lg:pt-[1.4rem]"
          >
            {children}
          </main>

          <MobileBottomNav role={user.role} />
        </div>
      </div>
    </div>
    </ToastProvider>
  );
}
