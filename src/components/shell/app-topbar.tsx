"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ClientSwitcher, type ClientOption } from "@/components/shell/client-switcher";
import { GlobalSearch, type SearchEntry } from "@/components/shell/global-search";
import { PeriodPicker } from "@/components/shell/period-picker";
import { SyncPill } from "@/components/shell/sync-pill";
import { UserMenu } from "@/components/shell/user-menu";
import { ThemeToggle } from "@/components/theme-toggle";
import { findActiveSection } from "@/lib/navigation";
import type { SyncStatus, User } from "@/lib/types";

type AppTopbarProps = {
  user: User;
  clients: ClientOption[];
  searchEntries: SearchEntry[];
  syncStatus?: SyncStatus | null;
  maxRangeDays?: number;
  maxRangeLabel?: string;
};

export function AppTopbar({
  user,
  clients,
  searchEntries,
  syncStatus,
  maxRangeDays,
  maxRangeLabel,
}: AppTopbarProps) {
  const pathname = usePathname();
  const section = findActiveSection(user.role, pathname);
  const isAdmin = user.role === "admin";

  return (
    <header className="relative z-30 flex shrink-0 flex-col gap-2 border-b border-border bg-card px-3 py-2.5 lg:px-[1.05rem] lg:py-[0.7rem]">
      <div className="flex w-full min-w-0 items-center gap-2 lg:hidden">
        {isAdmin ? (
          <ClientSwitcher
            clients={clients}
            className="min-w-0 flex-1"
            buttonClassName="w-full max-w-none"
          />
        ) : (
          <>
            <Link
              href="/dashboard"
              className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-lg border border-border/70 bg-[#0c0a16] p-1.5 dark:border-white/10"
              aria-label="Tráfego Academy"
            >
              <Image
                src="/icon-192.png"
                alt="Tráfego Academy"
                width={36}
                height={36}
                className="h-full w-full object-contain"
              />
            </Link>
            <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
              {section.title ?? section.label}
            </span>
          </>
        )}
        <ThemeToggle compact className="size-9 shrink-0" />
        <UserMenu user={user} />
      </div>

      {section.usesPeriod ? (
        <div className="flex w-full min-w-0 items-center gap-2 lg:hidden">
          <SyncPill
            status={syncStatus}
            className="min-w-0 flex-1 overflow-hidden"
          />
          <div className="ml-auto shrink-0">
            <PeriodPicker
              maxRangeDays={maxRangeDays}
              maxRangeLabel={maxRangeLabel}
            />
          </div>
        </div>
      ) : null}

      <div className="hidden w-full min-w-0 items-center gap-[0.7rem] lg:flex">
        {isAdmin ? (
          <ClientSwitcher clients={clients} />
        ) : (
          <span className="inline-flex h-9 min-w-0 items-center gap-2 rounded-lg border border-border bg-background px-2.5 text-sm font-medium text-foreground">
            <span className="grid size-[1.35rem] shrink-0 place-items-center rounded-md bg-primary/20 text-[0.65rem] font-semibold text-primary">
              {(user.clientName ?? user.name).charAt(0).toUpperCase()}
            </span>
            <span className="truncate">{user.clientName ?? user.name}</span>
          </span>
        )}

        {isAdmin ? (
          <div className="min-w-0 flex-1">
            <GlobalSearch entries={searchEntries} />
          </div>
        ) : (
          <div className="min-w-0 flex-1" />
        )}

        <div className="ml-auto flex shrink-0 items-center gap-2">
          {section.usesPeriod ? (
            <>
              <PeriodPicker
                maxRangeDays={maxRangeDays}
                maxRangeLabel={maxRangeLabel}
              />
              <SyncPill status={syncStatus} className="hidden xl:inline-flex" />
            </>
          ) : null}
          <ThemeToggle compact className="size-9" />
          <UserMenu user={user} />
        </div>
      </div>
    </header>
  );
}
