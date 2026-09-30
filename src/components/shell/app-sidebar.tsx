"use client";

import Image from "next/image";
import { usePathname } from "next/navigation";
import { LogOut, X } from "lucide-react";
import { logoutAction } from "@/app/login/actions";
import { IntentPrefetchLink } from "@/components/shell/intent-prefetch-link";
import { NavIcon } from "@/components/shell/nav-icon";
import { useScopedHref } from "@/components/shell/period-scope";
import { findActiveSection, getSectionGroups } from "@/lib/navigation";
import type { User } from "@/lib/types";
import { cn } from "@/lib/utils";

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("") || "?";
}

// Logo quadrada (seta + "Tráfego Academy") com fundo transparente. A versão
// "light" tem contornos mais escuros, feita para aparecer sobre fundo branco.
export function BrandLogo({
  size = 88,
  surface = "dark",
  className,
  priority,
}: {
  size?: number;
  surface?: "dark" | "light";
  className?: string;
  priority?: boolean;
}) {
  return (
    <Image
      src={surface === "light" ? "/brand/logo-login.webp" : "/brand/logo-square.webp"}
      alt="Tráfego Academy"
      width={size}
      height={size}
      priority={priority}
      className={cn("shrink-0 object-contain", className)}
    />
  );
}

type AppSidebarProps = {
  user: User;
  // Desktop: recolhida mostra só os ícones (76px).
  collapsed: boolean;
  // Celular: gaveta aberta sobre o conteúdo.
  mobileOpen: boolean;
  onCloseMobile: () => void;
};

// Sidebar escura: logo, grupos de seções, usuário e sair no rodapé.
export function AppSidebar({
  user,
  collapsed,
  mobileOpen,
  onCloseMobile,
}: AppSidebarProps) {
  const pathname = usePathname();
  const scopedHref = useScopedHref();
  const groups = getSectionGroups(user.role);
  const activeKey = findActiveSection(user.role, pathname).key;
  const subtitle =
    user.role === "admin" ? "Administrador" : (user.clientName ?? "Cliente");

  return (
    <>
      {mobileOpen ? (
        <div
          onClick={onCloseMobile}
          aria-hidden="true"
          className="animate-ta-fade fixed inset-0 z-40 bg-[rgba(16,11,34,0.5)] lg:hidden"
        />
      ) : null}

      <aside
        aria-label="Navegação principal"
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-[280px] shrink-0 flex-col bg-sidebar text-sidebar-foreground transition-[width,transform] duration-300 ease-[cubic-bezier(.2,.8,.2,1)]",
          "lg:relative lg:z-30 lg:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
          collapsed ? "lg:w-[76px]" : "lg:w-[264px]",
        )}
      >
        <div
          className={cn(
            "flex shrink-0 items-start gap-2.5 px-5 pb-1 pt-5",
            collapsed && "lg:justify-center lg:px-0 lg:pt-4",
          )}
        >
          <IntentPrefetchLink
            href={user.role === "admin" ? "/admin" : "/dashboard"}
            aria-label="Tráfego Academy"
            className="flex min-w-0 items-center"
          >
            <BrandLogo
              priority
              className={cn(
                "size-[92px] transition-[width,height] duration-300",
                collapsed && "lg:size-11",
              )}
            />
          </IntentPrefetchLink>
          <button
            type="button"
            onClick={onCloseMobile}
            aria-label="Fechar menu"
            className="ml-auto grid size-8 place-items-center rounded-lg text-sidebar-muted transition hover:text-white lg:hidden"
          >
            <X className="size-[1.1rem]" />
          </button>
        </div>

        <nav className="sidebar-scroll min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-3 pb-4 pt-1">
          {groups.map((group, index) => (
            <div key={group.label} className="mt-4">
              <p
                className={cn(
                  "whitespace-nowrap px-2.5 pb-2 text-[10.5px] font-semibold uppercase tracking-[0.09em] text-sidebar-muted",
                  collapsed && "lg:hidden",
                )}
              >
                {group.label}
              </p>
              {index > 0 ? (
                <div
                  className={cn(
                    "mx-2.5 mb-2.5 hidden h-px bg-white/[0.06]",
                    collapsed && "lg:block",
                  )}
                />
              ) : null}

              <div className="flex flex-col gap-0.5">
                {group.sections.map((section) => {
                  const isActive = section.key === activeKey;

                  return (
                    <IntentPrefetchLink
                      key={section.key}
                      href={scopedHref(section.href)}
                      onClick={onCloseMobile}
                      title={collapsed ? section.label : undefined}
                      aria-current={isActive ? "page" : undefined}
                      className={cn(
                        "relative flex h-[38px] items-center gap-3 whitespace-nowrap rounded-[10px] px-2.5 transition-colors duration-150",
                        collapsed && "lg:justify-center",
                        isActive
                          ? "bg-[rgba(155,130,255,0.14)] text-white"
                          : "text-[#a9a3bd] hover:text-white",
                      )}
                    >
                      {isActive ? (
                        <span className="absolute -left-3 bottom-[9px] top-[9px] w-[3px] rounded-r-[3px] bg-sidebar-active" />
                      ) : null}
                      <NavIcon name={section.icon} className="size-[19px] shrink-0" />
                      <span
                        className={cn(
                          "min-w-0 flex-1 truncate text-[13.5px] font-medium",
                          collapsed && "lg:hidden",
                        )}
                      >
                        {section.label}
                      </span>
                    </IntentPrefetchLink>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="shrink-0 border-t border-white/[0.06] p-3">
          <div
            className={cn(
              "flex items-center gap-2.5 rounded-xl p-2",
              collapsed && "lg:justify-center",
            )}
          >
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[linear-gradient(135deg,var(--brand-400),var(--brand-800))] text-[13px] font-semibold text-white">
              {initials(user.name)}
            </span>
            <div className={cn("min-w-0 flex-1", collapsed && "lg:hidden")}>
              <p className="truncate text-[13.5px] font-medium text-white">
                {user.name}
              </p>
              <p className="truncate text-xs text-sidebar-muted">{subtitle}</p>
            </div>
            <form action={logoutAction} className={cn(collapsed && "lg:hidden")}>
              <button
                type="submit"
                title="Sair"
                aria-label="Sair"
                className="grid size-8 place-items-center rounded-lg text-sidebar-muted transition hover:bg-white/[0.06] hover:text-white"
              >
                <LogOut className="size-[18px]" strokeWidth={1.75} />
              </button>
            </form>
          </div>
        </div>
      </aside>
    </>
  );
}
