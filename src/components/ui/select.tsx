import * as React from "react";
import { cn } from "@/lib/utils";

export function Select({
  className,
  children,
  ...props
}: React.ComponentProps<"select">) {
  return (
    <select
      className={cn(
        "flex h-[46px] w-full rounded-xl border border-input bg-card px-3.5 text-sm text-foreground outline-none transition-all duration-200 focus:border-primary focus:ring-4 focus:ring-ring disabled:bg-surface-2",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
}
