"use client";

import { useState, useTransition } from "react";
import { Bot, TriangleAlert } from "lucide-react";
import { setAiAllPlansAction } from "@/app/admin/configuracoes/ai-plan-actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toast";
import { CLIENT_PLAN_LABELS, aiAllowedPlans } from "@/lib/ai-agent/shared";

function planList(allPlans: boolean) {
  const labels = aiAllowedPlans(allPlans).map((plan) => CLIENT_PLAN_LABELS[plan]);
  return labels.length > 1
    ? `${labels.slice(0, -1).join(", ")} e ${labels.at(-1)}`
    : labels[0];
}

/**
 * Liga: todos os planos usam o Atendimento IA. Desliga: só o Plano Completo
 * (e a IA de quem não é Completo para na hora). Clientes com a tela aberta
 * recebem a mudança em até ~1 min (ou ao voltar para a aba), e toda ação deles
 * é conferida de novo no servidor.
 */
export function AiAllPlansCard({ enabled }: { enabled: boolean | null }) {
  const [on, setOn] = useState(enabled ?? false);
  const [pending, startTransition] = useTransition();
  const { showToast } = useToast();

  const change = (next: boolean) => {
    if (pending) return;
    setOn(next);
    startTransition(async () => {
      try {
        const result = await setAiAllPlansAction(next);
        if (result.error) {
          setOn(!next);
          showToast({ message: result.error, tone: "erro" });
        } else if (result.success) {
          showToast({ message: result.success, tone: "sucesso" });
        }
      } catch {
        // Queda de conexão: a action nem respondeu. Volta ao estado salvo.
        setOn(!next);
        showToast({
          message: "Sem conexão com o servidor. A liberação não foi alterada.",
          tone: "erro",
        });
      }
    });
  };

  return (
    <Card className="border-border/60 bg-background/60">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Bot className="size-4 text-primary" />
          Liberação do Atendimento IA
        </CardTitle>
      </CardHeader>
      <CardContent>
        {enabled === null ? (
          <p className="flex items-start gap-2 rounded-2xl border border-amber-500/30 bg-amber-500/[0.08] px-4 py-3 text-sm text-amber-700">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            Não foi possível ler a liberação atual agora. Atualize a página para
            ver e alterar a configuração.
          </p>
        ) : (
          // O Switch já traz o próprio <label>: aqui vai uma div.
          <div className="flex items-start gap-3 rounded-2xl border border-border/60 bg-card px-4 py-3">
            <Switch
              checked={on}
              disabled={pending}
              aria-busy={pending}
              aria-label="Liberar o Atendimento IA para todos os planos"
              onChange={(event) => change(event.target.checked)}
            />
            <span className="text-sm text-foreground">
              <span className="block font-medium">
                {pending ? "Salvando..." : `Liberado para: ${planList(on)}`}
              </span>
              <span className="mt-1 block text-xs text-muted-foreground">
                {on
                  ? "Clientes do Plano Essencial também podem configurar e ativar a IA."
                  : "Ao desligar, a IA dos clientes fora do Plano Completo é desativada na hora."}
              </span>
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
