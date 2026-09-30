"use client";

import { usePathname } from "next/navigation";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { AppSidebar } from "@/components/shell/app-sidebar";
import { AppTopbar } from "@/components/shell/app-topbar";
import type { ClientOption } from "@/components/shell/client-switcher";
import type { SearchEntry } from "@/components/shell/global-search";
import { SubTabs } from "@/components/shell/sub-tabs";
import { RevalidateOnFocus } from "@/components/dashboard/revalidate-on-focus";
import { ToastProvider } from "@/components/ui/toast";
import { WhatsappGlobalAlert } from "@/components/whatsapp/whatsapp-global-alert";
import { WhatsappSessionProvider } from "@/components/whatsapp/whatsapp-session-provider";
import { findActiveSection } from "@/lib/navigation";
import type { SyncStatus, User } from "@/lib/types";
import type { WhatsappSession } from "@/lib/whatsapp-session";

type AppShellProps = {
  children: ReactNode;
  user: User;
  clients: ClientOption[];
  searchEntries: SearchEntry[];
  syncStatus?: SyncStatus | null;
  whatsappSession: WhatsappSession | null;
  maxRangeDays?: number;
  maxRangeLabel?: string;
};

// A preferência "sidebar recolhida" fica salva no navegador.
const COLLAPSED_KEY = "ta-sidebar-collapsed";
const COLLAPSED_EVENT = "ta-sidebar-change";

function subscribeCollapsed(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(COLLAPSED_EVENT, onChange);

  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(COLLAPSED_EVENT, onChange);
  };
}

function readCollapsed() {
  try {
    return window.localStorage.getItem(COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

// Moldura de todas as telas logadas: sidebar, topbar e sub-abas.
export function AppShell({
  children,
  user,
  clients,
  searchEntries,
  syncStatus,
  whatsappSession,
  maxRangeDays,
  maxRangeLabel,
}: AppShellProps) {
  const pathname = usePathname();
  const contentRef = useRef<HTMLElement>(null);
  const section = findActiveSection(user.role, pathname);
  const showsCampaignTabsInContent = section.key === "campanhas";
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const collapsed = useSyncExternalStore(
    subscribeCollapsed,
    readCollapsed,
    () => false,
  );

  const toggleCollapsed = useCallback(() => {
    try {
      window.localStorage.setItem(COLLAPSED_KEY, collapsed ? "0" : "1");
    } catch {
      // Sem storage (aba anônima): a preferência só não persiste.
    }
    window.dispatchEvent(new Event(COLLAPSED_EVENT));
  }, [collapsed]);

  const closeMobileNav = useCallback(() => setMobileNavOpen(false), []);

  useEffect(() => {
    contentRef.current?.scrollTo({ top: 0 });
  }, [pathname]);

  return (
    <ToastProvider>
    <WhatsappSessionProvider
      enabled={user.role === "client"}
      initialSession={whatsappSession}
    >
    {/* overflow-clip (e não hidden): hidden ainda pode ser rolado por foco ou
        scrollIntoView, o que "subia" o painel inteiro; clip nunca rola. */}
    <div className="fixed inset-x-0 bottom-[env(safe-area-inset-bottom)] top-[env(safe-area-inset-top)] flex min-h-0 w-full overflow-clip bg-background">
      <RevalidateOnFocus />
      <AppSidebar
        user={user}
        collapsed={collapsed}
        mobileOpen={mobileNavOpen}
        onCloseMobile={closeMobileNav}
      />

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-clip">
        <AppTopbar
          user={user}
          clients={clients}
          searchEntries={searchEntries}
          syncStatus={syncStatus}
          maxRangeDays={maxRangeDays}
          maxRangeLabel={maxRangeLabel}
          sidebarCollapsed={collapsed}
          onToggleSidebar={toggleCollapsed}
          onOpenMobileNav={() => setMobileNavOpen(true)}
        />

        {showsCampaignTabsInContent ? null : <SubTabs tabs={section.subTabs} />}

        {user.role === "client" ? <WhatsappGlobalAlert /> : null}

        {/* A moldura não rola: somente o conteúdo desta aba. */}
        <main
          ref={contentRef}
          id="app-content"
          tabIndex={-1}
          className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-y-contain [scrollbar-gutter:stable]"
        >
          <div className="mx-auto w-full max-w-[1480px] px-4 pb-[calc(2.5rem+env(safe-area-inset-bottom))] pt-6 lg:px-7 lg:pb-16 lg:pt-7">
            {children}
          </div>
        </main>
      </div>
    </div>
    </WhatsappSessionProvider>
    </ToastProvider>
  );
}
