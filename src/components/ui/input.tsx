import * as React from "react";
import { cn } from "@/lib/utils";

export function Input({ className, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "box-border flex h-[46px] min-w-0 w-full max-w-full rounded-xl border border-input bg-card px-3.5 text-sm text-foreground outline-none transition-all duration-200 placeholder:text-text-4 focus:border-primary focus:ring-4 focus:ring-ring disabled:bg-surface-2 disabled:text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}
