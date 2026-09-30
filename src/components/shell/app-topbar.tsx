"use client";

import { usePathname } from "next/navigation";
import { Menu, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { ClientSwitcher, type ClientOption } from "@/components/shell/client-switcher";
import { GlobalSearch, type SearchEntry } from "@/components/shell/global-search";
import { PeriodPicker } from "@/components/shell/period-picker";
import { SyncPill } from "@/components/shell/sync-pill";
import { findActiveSection } from "@/lib/navigation";
import type { SyncStatus, User } from "@/lib/types";

type AppTopbarProps = {
  user: User;
  clients: ClientOption[];
  searchEntries: SearchEntry[];
  syncStatus?: SyncStatus | null;
  maxRangeDays?: number;
  maxRangeLabel?: string;
  sidebarCollapsed: boolean;
  onToggleSidebar: () => void;
  onOpenMobileNav: () => void;
};

const ICON_BUTTON =
  "grid size-9 shrink-0 place-items-center rounded-[10px] border border-border bg-card text-text-3 transition hover:bg-surface-2";

export function AppTopbar({
  user,
  clients,
  searchEntries,
  syncStatus,
  maxRangeDays,
  maxRangeLabel,
  sidebarCollapsed,
  onToggleSidebar,
  onOpenMobileNav,
}: AppTopbarProps) {
  const pathname = usePathname();
  const section = findActiveSection(user.role, pathname);
  const isAdmin = user.role === "admin";
  const hasMobileTools = isAdmin || section.usesPeriod;

  return (
    <header className="relative z-30 shrink-0 border-b border-border bg-white/85 backdrop-blur-[10px]">
      <div className="flex h-16 items-center gap-3 px-4 lg:px-7">
        <button
          type="button"
          onClick={onOpenMobileNav}
          aria-label="Abrir menu"
          className={`${ICON_BUTTON} lg:hidden`}
        >
          <Menu className="size-[18px]" strokeWidth={1.75} />
        </button>
        <button
          type="button"
          onClick={onToggleSidebar}
          title={sidebarCollapsed ? "Expandir menu" : "Recolher menu"}
          aria-label={sidebarCollapsed ? "Expandir menu" : "Recolher menu"}
          className={`${ICON_BUTTON} hidden lg:grid`}
        >
          {sidebarCollapsed ? (
            <PanelLeftOpen className="size-[18px]" strokeWidth={1.75} />
          ) : (
            <PanelLeftClose className="size-[18px]" strokeWidth={1.75} />
          )}
        </button>

        <div className="flex min-w-0 shrink-0 flex-col">
          <span className="whitespace-nowrap text-[11.5px] text-text-4">
            {section.group}
          </span>
          <span className="truncate text-[15px] font-semibold text-foreground">
            {section.title ?? section.label}
          </span>
        </div>

        {isAdmin ? (
          <div className="mx-auto hidden min-w-0 flex-[0_1_440px] lg:block">
            <GlobalSearch entries={searchEntries} />
          </div>
        ) : (
          <div className="mx-auto hidden lg:block" />
        )}

        <div className="ml-auto hidden shrink-0 items-center gap-2 lg:flex">
          {isAdmin ? <ClientSwitcher clients={clients} /> : null}
          {section.usesPeriod ? (
            <>
              <PeriodPicker
                maxRangeDays={maxRangeDays}
                maxRangeLabel={maxRangeLabel}
              />
              <SyncPill status={syncStatus} className="hidden xl:inline-flex" />
            </>
          ) : null}
        </div>
      </div>

      {hasMobileTools ? (
        <div className="flex min-w-0 items-center gap-2 px-4 pb-3 lg:hidden">
          {isAdmin ? (
            <ClientSwitcher
              clients={clients}
              className="min-w-0 flex-1"
              buttonClassName="w-full max-w-none"
            />
          ) : (
            <SyncPill
              status={syncStatus}
              className="min-w-0 flex-1 overflow-hidden"
            />
          )}
          {section.usesPeriod ? (
            <div className="ml-auto shrink-0">
              <PeriodPicker
                maxRangeDays={maxRangeDays}
                maxRangeLabel={maxRangeLabel}
              />
            </div>
          ) : null}
        </div>
      ) : null}
    </header>
  );
}
