import * as React from "react";
import { cn } from "@/lib/utils";

// Interruptor deslizante baseado num checkbox real (envia o valor no form,
// igual a um checkbox: "on" quando ligado, nada quando desligado).
export type SwitchProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "type"
>;

export function Switch({ className, ...props }: SwitchProps) {
  return (
    <label className="inline-flex shrink-0 cursor-pointer items-center">
      <input type="checkbox" className="peer sr-only" {...props} />
      <span
        className={cn(
          "relative h-7 w-12 rounded-full bg-muted transition-colors",
          "peer-checked:bg-primary",
          "peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring",
          "peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
          "after:absolute after:left-1 after:top-1 after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow-sm after:transition-transform after:content-['']",
          "peer-checked:after:translate-x-5",
          "dark:bg-white/15",
          className,
        )}
      />
    </label>
  );
}
