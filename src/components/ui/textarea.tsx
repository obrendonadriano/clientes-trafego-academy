import * as React from "react";
import { cn } from "@/lib/utils";

export function Textarea({
  className,
  ...props
}: React.ComponentProps<"textarea">) {
  return (
    <textarea
      className={cn(
        "box-border flex min-h-[120px] min-w-0 w-full max-w-full rounded-[1.35rem] border border-input bg-background/70 px-4 py-3 text-sm leading-6 text-foreground outline-none transition placeholder:text-muted-foreground focus:border-primary focus:ring-4 focus:ring-ring dark:border-white/10 dark:bg-black/25 dark:text-white dark:placeholder:text-slate-500",
        className,
      )}
      {...props}
    />
  );
}
