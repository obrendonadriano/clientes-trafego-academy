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
};

export function SideNav({ items }: SideNavProps) {
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
            className={cn(
              "flex items-center gap-3 rounded-2xl border px-4 py-3 text-sm transition active:scale-[0.985]",
              isActive
                ? "border-primary/20 bg-primary/10 font-medium text-foreground"
                : "border-border/50 bg-background/50 text-muted-foreground hover:border-primary/20 hover:text-foreground",
            )}
          >
            {item.icon}
            {item.label}
          </Link>
        );
      })}
    </div>
  );
}
