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
        "flex h-12 w-full rounded-2xl border border-input bg-background/70 px-4 py-3 text-sm outline-none transition focus:border-primary focus:ring-4 focus:ring-ring",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
}
