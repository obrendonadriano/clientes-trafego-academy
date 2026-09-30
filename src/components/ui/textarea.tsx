import * as React from "react";
import { cn } from "@/lib/utils";

export function Textarea({
  className,
  ...props
}: React.ComponentProps<"textarea">) {
  return (
    <textarea
      className={cn(
        "box-border flex min-h-[120px] min-w-0 w-full max-w-full rounded-xl border border-input bg-card px-3.5 py-3 text-sm leading-6 text-foreground outline-none transition-all duration-200 placeholder:text-text-4 focus:border-primary focus:ring-4 focus:ring-ring",
        className,
      )}
      {...props}
    />
  );
}
