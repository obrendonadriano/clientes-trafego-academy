import * as React from "react";
import { cn } from "@/lib/utils";

export function Input({ className, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "box-border flex h-12 min-w-0 w-full max-w-full rounded-2xl border border-input bg-background/70 px-4 py-3 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus:border-primary focus:ring-4 focus:ring-ring dark:border-white/10 dark:bg-black/25 dark:text-white dark:placeholder:text-slate-500",
        className,
      )}
      {...props}
    />
  );
}
