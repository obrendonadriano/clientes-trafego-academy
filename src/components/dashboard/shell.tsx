import type { ReactNode } from "react";
import { BarChart3, FileText, LayoutDashboard, LogOut, Users } from "lucide-react";
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
  const defaultNavItems =
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
            href: "#visao-geral",
            icon: <LayoutDashboard className="size-4" />,
          },
          {
            label: "Campanhas",
            href: "#campanhas",
            icon: <BarChart3 className="size-4" />,
          },
          {
            label: "Métricas",
            href: "#metricas",
            icon: <FileText className="size-4" />,
          },
          {
            label: "Comparativos",
            href: "#comparativos",
            icon: <FileText className="size-4" />,
          },
        ];

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex min-h-screen max-w-[1600px] flex-col gap-6 px-4 py-4 lg:flex-row lg:px-6">
        <aside className="flex w-full flex-col rounded-[2rem] border border-border/60 bg-[linear-gradient(180deg,rgba(255,255,255,1)_0%,rgba(244,245,255,0.98)_100%)] p-5 shadow-[0_24px_60px_-28px_rgba(31,28,64,0.2)] backdrop-blur dark:bg-[linear-gradient(180deg,rgba(10,12,24,0.92)_0%,rgba(10,14,28,0.98)_100%)] lg:sticky lg:top-4 lg:h-[calc(100vh-2rem)] lg:w-[280px]">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
              Tráfego Academy
            </p>
            <h1 className="mt-3 font-display text-2xl font-semibold">
              {user.role === "admin" ? "Admin console" : "Client dashboard"}
            </h1>
          </div>

          <SideNav items={navItems ?? defaultNavItems} />

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
        </aside>

        <section className="flex-1 rounded-[2rem] border border-border/60 bg-[linear-gradient(180deg,rgba(255,255,255,1)_0%,rgba(245,246,255,0.98)_100%)] p-5 shadow-[0_24px_60px_-28px_rgba(31,28,64,0.2)] backdrop-blur dark:bg-[linear-gradient(180deg,rgba(10,13,25,0.92)_0%,rgba(8,11,23,0.97)_100%)] lg:p-8">
          <header className="flex flex-col gap-4 border-b border-border/60 pb-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.28em] text-muted-foreground">
                {user.role === "admin" ? "Área Administrativa" : "Área do Cliente"}
              </p>
              <h2 className="mt-2 font-display text-4xl font-semibold tracking-[-0.04em]">
                {title}
              </h2>
              <p className="mt-3 max-w-3xl text-muted-foreground">{subtitle}</p>
            </div>
          </header>

          <div className="mt-8">{children}</div>
        </section>
      </div>
    </main>
  );
}
