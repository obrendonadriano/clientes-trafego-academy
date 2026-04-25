"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export type SideNavItem = {
  label: string;
  href: string;
  icon: React.ReactNode;
};

type SideNavProps = {
  items: SideNavItem[];
  onNavigate?: () => void;
};

export function SideNav({ items, onNavigate }: SideNavProps) {
  const pathname = usePathname();

  return (
    <div className="mt-8 space-y-3">
      {items.map((item) => {
        const isActive =
          pathname === item.href ||
          (item.href !== "/admin" && pathname.startsWith(`${item.href}/`));

        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              "group flex min-h-12 items-center gap-3 rounded-2xl border px-4 py-3 text-sm transition active:scale-[0.985]",
              isActive
                ? "border-primary/25 bg-primary/10 font-medium text-foreground shadow-[0_18px_40px_-28px_rgba(139,120,255,0.55)] dark:border-primary/30 dark:bg-primary/[0.15] dark:text-white dark:shadow-[0_18px_40px_-28px_rgba(139,120,255,0.9)]"
                : "border-border/60 bg-background/50 text-muted-foreground hover:border-primary/25 hover:text-foreground dark:border-white/10 dark:bg-white/[0.025] dark:text-slate-400 dark:hover:border-white/[0.15] dark:hover:bg-white/[0.055] dark:hover:text-white",
            )}
          >
            <span
              className={cn(
                "grid size-8 shrink-0 place-items-center rounded-xl transition",
                isActive
                  ? "bg-primary/20 text-primary"
                  : "bg-muted text-muted-foreground group-hover:text-foreground dark:bg-white/[0.035] dark:text-slate-400 dark:group-hover:text-white",
              )}
            >
              {item.icon}
            </span>
            <span className="min-w-0 truncate">{item.label}</span>
          </Link>
        );
      })}
    </div>
  );
}
