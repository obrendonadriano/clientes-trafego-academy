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
            <h1 className="mt-3 font-display text-2xl font-semibold">
              {user.role === "admin" ? "Admin console" : "Client dashboard"}
            </h1>
          </div>

          <Button
            type="button"
            variant="outline"
            size="icon"
            className="rounded-full lg:hidden"
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
          <div className="rounded-3xl border border-border/60 bg-[rgba(246,247,255,0.92)] p-4 backdrop-blur dark:bg-background/60">
            <p className="text-sm text-muted-foreground">Sessão atual</p>
            <p className="mt-2 font-semibold">{user.name}</p>
            <p className="text-sm text-muted-foreground">
              {user.role === "admin" ? "Administrador" : user.clientName}
            </p>
          </div>

          <div className="flex gap-3">
            <div className="flex-1">
              <ThemeToggle />
            </div>
            <form action={logoutAction} className="flex-1">
              <Button
                variant="outline"
                className="w-full gap-2 rounded-full border-border/70 bg-background/70 text-foreground hover:bg-accent hover:text-accent-foreground"
              >
                <LogOut className="size-4" />
                Sair
              </Button>
            </form>
          </div>
        </div>
      </>
    );
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex min-h-screen max-w-[1600px] flex-col gap-4 px-3 py-3 lg:flex-row lg:gap-6 lg:px-6 lg:py-4">
        <div className="lg:hidden">
          <div className="flex items-center justify-between rounded-[1.75rem] border border-border/60 bg-[linear-gradient(180deg,rgba(255,255,255,1)_0%,rgba(244,245,255,0.98)_100%)] px-4 py-3 shadow-[0_24px_60px_-28px_rgba(31,28,64,0.2)] dark:bg-[linear-gradient(180deg,rgba(10,12,24,0.92)_0%,rgba(10,14,28,0.98)_100%)]">
            <div>
              <p className="text-[0.65rem] uppercase tracking-[0.3em] text-muted-foreground">
                Tráfego Academy
              </p>
              <p className="mt-1 font-display text-lg font-semibold">
                {user.role === "admin" ? "Admin console" : "Client dashboard"}
              </p>
            </div>

            <Button
              type="button"
              size="icon"
              className="rounded-full"
              onClick={() => setIsMobileMenuOpen(true)}
              aria-label="Abrir menu"
            >
              <Menu className="size-5" />
            </Button>
          </div>
        </div>

        {isMobileMenuOpen ? (
          <div className="fixed inset-0 z-50 bg-black/45 lg:hidden" onClick={() => setIsMobileMenuOpen(false)}>
            <aside
              className="absolute left-3 top-3 flex h-[calc(100dvh-1.5rem)] w-[min(86vw,320px)] flex-col rounded-[2rem] border border-border/60 bg-[linear-gradient(180deg,rgba(255,255,255,1)_0%,rgba(244,245,255,0.98)_100%)] p-5 shadow-[0_24px_60px_-28px_rgba(31,28,64,0.2)] backdrop-blur dark:bg-[linear-gradient(180deg,rgba(10,12,24,0.98)_0%,rgba(10,14,28,1)_100%)]"
              onClick={(event) => event.stopPropagation()}
            >
              {renderSidebarContent()}
            </aside>
          </div>
        ) : null}

        <aside className="hidden w-full flex-col rounded-[2rem] border border-border/60 bg-[linear-gradient(180deg,rgba(255,255,255,1)_0%,rgba(244,245,255,0.98)_100%)] p-5 shadow-[0_24px_60px_-28px_rgba(31,28,64,0.2)] backdrop-blur dark:bg-[linear-gradient(180deg,rgba(10,12,24,0.92)_0%,rgba(10,14,28,0.98)_100%)] lg:sticky lg:top-4 lg:flex lg:h-[calc(100vh-2rem)] lg:w-[280px]">
          {renderSidebarContent()}
        </aside>

        <section className="flex-1 rounded-[1.75rem] border border-border/60 bg-[linear-gradient(180deg,rgba(255,255,255,1)_0%,rgba(245,246,255,0.98)_100%)] p-4 shadow-[0_24px_60px_-28px_rgba(31,28,64,0.2)] backdrop-blur dark:bg-[linear-gradient(180deg,rgba(10,13,25,0.92)_0%,rgba(8,11,23,0.97)_100%)] lg:rounded-[2rem] lg:p-8">
          <header className="flex flex-col gap-4 border-b border-border/60 pb-5 lg:flex-row lg:items-end lg:justify-between lg:pb-6">
            <div>
              <p className="text-xs uppercase tracking-[0.28em] text-muted-foreground sm:text-sm">
                {user.role === "admin" ? "Área Administrativa" : "Área do Cliente"}
              </p>
              <h2 className="mt-2 font-display text-[2.2rem] font-semibold tracking-[-0.04em] sm:text-[2.7rem] lg:text-4xl">
                {title}
              </h2>
              <p className="mt-3 max-w-3xl text-sm text-muted-foreground sm:text-base">
                {subtitle}
              </p>
            </div>
          </header>

          <div className="mt-6 lg:mt-8">{children}</div>
        </section>
      </div>
    </main>
  );
}
