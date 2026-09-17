"use client";

import type { ReactNode } from "react";
import { Lock } from "lucide-react";

/**
 * Cobertura do Plano Essencial.
 *
 * O conteúdo continua visível (é proposital: o cliente precisa ver que o
 * recurso existe), mas fica esmaecido, sem foco e sem clique. `inert` remove
 * o conteúdo da árvore de acessibilidade e do tab — é o que impede burlar o
 * bloqueio só com o teclado. A trava de verdade, ainda assim, é no servidor.
 */
export function AiPlanLock({ children }: { children: ReactNode }) {
  return (
    <div className="relative">
      <div
        inert
        aria-hidden="true"
        className="pointer-events-none select-none opacity-40 blur-[2px] saturate-50"
      >
        {children}
      </div>

      <div className="absolute inset-0 z-10 flex items-start justify-center p-4 sm:p-8">
        <div className="sticky top-8 w-full max-w-md rounded-[1.5rem] border border-border/60 bg-card/95 p-8 text-center shadow-xl backdrop-blur-md">
          <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-primary/12 text-primary">
            <Lock className="size-6" strokeWidth={1.75} />
          </div>

          <h3 className="mt-5 font-display text-xl font-medium text-foreground">
            Recurso exclusivo do Plano Completo
          </h3>

          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Faça upgrade para utilizar o atendimento e qualificação automática
            por IA.
          </p>

          <p className="mt-5 rounded-2xl border border-border/60 bg-background/60 px-4 py-3 text-xs leading-5 text-muted-foreground">
            Fale com a Tráfego Academy para liberar o atendimento automático no
            seu WhatsApp.
          </p>
        </div>
      </div>
    </div>
  );
}
