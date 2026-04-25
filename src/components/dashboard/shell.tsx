"use client";

import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import {
  BarChart3,
  FileText,
  LayoutDashboard,
  LogOut,
  Menu,
  Users,
  X,
} from "lucide-react";
import { logoutAction } from "@/app/login/actions";
import { SideNav, type SideNavItem } from "@/components/dashboard/side-nav";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import type { User } from "@/lib/types";

type DashboardShellProps = {
  children: ReactNode;
  title: string;
  subtitle: string;
  user: User;
  navItems?: SideNavItem[];
};

export function DashboardShell({
  children,
  title,
  subtitle,
  user,
  navItems,
}: DashboardShellProps) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const defaultNavItems = useMemo<SideNavItem[]>(
    () =>
      user.role === "admin"
        ? [
            {
              label: "Dashboard geral",
              href: "/admin",
              icon: <LayoutDashboard className="size-4" />,
            },
            {
              label: "Clientes",
              href: "/admin/clientes",
              icon: <Users className="size-4" />,
            },
            {
              label: "Relatórios IA",
              href: "/admin/relatorios-ia",
              icon: <FileText className="size-4" />,
            },
            {
              label: "Campanhas",
              href: "/admin/campanhas",
              icon: <BarChart3 className="size-4" />,
            },
            {
              label: "Configurações",
              href: "/admin/configuracoes",
              icon: <FileText className="size-4" />,
            },
          ]
        : [
            {
              label: "Visão geral",
              href: "/dashboard",
              icon: <LayoutDashboard className="size-4" />,
            },
            {
              label: "Campanhas",
              href: "/dashboard/campanhas",
              icon: <BarChart3 className="size-4" />,
            },
          ],
    [user.role],
  );

  const resolvedNavItems = navItems ?? defaultNavItems;

  function renderSidebarContent() {
    return (
      <>
        <div className="flex items-start justify-between gap-4 lg:block">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
              Tráfego Academy
            </p>
            <h1 className="mt-3 font-display text-2xl font-semibold text-foreground">
              {user.role === "admin" ? "Admin console" : "Client dashboard"}
            </h1>
          </div>

          <Button
            type="button"
            variant="outline"
            size="icon"
            className="rounded-full border-border/70 bg-background/70 text-foreground hover:bg-accent lg:hidden dark:border-white/10 dark:bg-white/[0.06] dark:text-white dark:hover:bg-white/10"
            onClick={() => setIsMobileMenuOpen(false)}
            aria-label="Fechar menu"
          >
            <X className="size-5" />
          </Button>
        </div>

        <SideNav
          items={resolvedNavItems}
          onNavigate={() => setIsMobileMenuOpen(false)}
        />

        <div className="mt-auto space-y-4 pt-8">
          <div className="rounded-[1.35rem] border border-border/70 bg-background/[0.55] p-4 text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.35)] dark:border-white/10 dark:bg-white/[0.04] dark:text-white dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
            <p className="text-sm text-muted-foreground">Sessão atual</p>
            <p className="mt-2 text-sm font-semibold leading-6">{user.name}</p>
            <p className="text-sm text-muted-foreground">
              {user.role === "admin" ? "Administrador" : user.clientName}
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 min-[1280px]:grid-cols-2">
            <div className="min-w-0">
              <ThemeToggle />
            </div>
            <form action={logoutAction} className="min-w-0">
              <Button
                variant="outline"
                className="w-full min-w-0 gap-2 rounded-full px-4"
              >
                <LogOut className="size-4 shrink-0" />
                <span className="truncate">Sair</span>
              </Button>
            </form>
          </div>
        </div>
      </>
    );
  }

  return (
    <main className="min-h-screen overflow-x-hidden bg-transparent text-foreground">
      <div className="mx-auto flex min-h-screen max-w-[1680px] min-w-0 flex-col gap-4 overflow-x-hidden px-3 py-3 lg:flex-row lg:gap-6 lg:px-6 lg:py-4">
        <div className="lg:hidden">
          <div className="dashboard-glass flex items-center justify-between rounded-[1.5rem] px-4 py-3">
            <div>
              <p className="text-[0.65rem] uppercase tracking-[0.3em] text-muted-foreground">
                Tráfego Academy
              </p>
              <p className="mt-1 font-display text-lg font-semibold text-foreground">
                {user.role === "admin" ? "Admin console" : "Client dashboard"}
              </p>
            </div>

            <Button
              type="button"
              size="icon"
              className="rounded-full bg-primary text-white hover:bg-primary/90"
              onClick={() => setIsMobileMenuOpen(true)}
              aria-label="Abrir menu"
            >
              <Menu className="size-5" />
            </Button>
          </div>
        </div>

        {isMobileMenuOpen ? (
          <div className="fixed inset-0 z-50 overflow-hidden bg-black/45 lg:hidden" onClick={() => setIsMobileMenuOpen(false)}>
            <aside
              className="dashboard-glass absolute left-3 top-3 flex h-[calc(100dvh-0.75rem)] w-[min(86vw,320px)] max-w-[calc(100vw-1.5rem)] flex-col rounded-[1.75rem] p-5"
              onClick={(event) => event.stopPropagation()}
            >
              {renderSidebarContent()}
            </aside>
          </div>
        ) : null}

        <aside className="dashboard-glass hidden w-full flex-col rounded-[1.75rem] p-5 lg:sticky lg:top-4 lg:flex lg:h-[calc(100vh-1rem)] lg:w-[286px]">
          {renderSidebarContent()}
        </aside>

        <section className="min-w-0 flex-1 overflow-x-hidden px-1 py-3 lg:px-3 lg:py-8">
          <header className="flex flex-col gap-4 border-b border-border/70 pb-5 dark:border-white/10 lg:flex-row lg:items-end lg:justify-between lg:pb-7">
            <div>
              <p className="text-xs uppercase tracking-[0.28em] text-muted-foreground sm:text-sm">
                {user.role === "admin" ? "Área Administrativa" : "Área do Cliente"}
              </p>
              <h2 className="mt-2 font-display text-[2.1rem] font-semibold leading-tight text-foreground sm:text-[2.65rem] lg:text-4xl">
                {title}
              </h2>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-muted-foreground sm:text-base">
                {subtitle}
              </p>
            </div>
          </header>

          <div className="mt-6 min-w-0 lg:mt-8">{children}</div>
        </section>
      </div>
    </main>
  );
}
