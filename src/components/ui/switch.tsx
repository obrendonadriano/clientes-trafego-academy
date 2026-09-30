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
    // `relative` prende o checkbox invisível (sr-only é absolute) dentro do
    // interruptor. Sem isso, ao focar, o navegador rolava a moldura do painel
    // até onde o checkbox "estava" e a tela subia deixando uma faixa vazia.
    <label className="relative inline-flex shrink-0 cursor-pointer items-center">
      <input type="checkbox" className="peer sr-only" {...props} />
      <span
        className={cn(
          "relative h-6 w-11 rounded-full bg-[#e4e7ec] transition-colors duration-200",
          "peer-checked:bg-primary",
          "peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring",
          "peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
          "after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow-[0_1px_3px_rgba(16,24,40,0.2)] after:transition-transform after:content-['']",
          "peer-checked:after:translate-x-5",
          className,
        )}
      />
    </label>
  );
}
