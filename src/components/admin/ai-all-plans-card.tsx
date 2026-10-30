"use client";

import { useState, useTransition } from "react";
import { Bot } from "lucide-react";
import { setAiAllPlansAction } from "@/app/admin/configuracoes/ai-plan-actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toast";

/**
 * Liga: todos os planos usam o Atendimento IA. Desliga: só o Plano Completo
 * (e a IA de quem não é Completo para na hora).
 */
export function AiAllPlansCard({ enabled }: { enabled: boolean }) {
  const [on, setOn] = useState(enabled);
  const [pending, startTransition] = useTransition();
  const { showToast } = useToast();

  const change = (next: boolean) => {
    setOn(next);
    startTransition(async () => {
      const result = await setAiAllPlansAction(next);
      if (result.error) {
        setOn(!next);
        showToast({ message: result.error, tone: "erro" });
      } else if (result.success) {
        showToast({ message: result.success, tone: "sucesso" });
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
        {/* O Switch já traz o próprio <label>: aqui vai uma div. */}
        <div className="flex items-start gap-3 rounded-2xl border border-border/60 bg-card px-4 py-3">
          <Switch
            checked={on}
            disabled={pending}
            aria-label="Liberar o Atendimento IA para todos os planos"
            onChange={(event) => change(event.target.checked)}
          />
          <span className="text-sm text-foreground">
            <span className="block font-medium">
              {on ? "Liberado para todos os planos" : "Apenas para o Plano Completo"}
            </span>
            <span className="mt-1 block text-xs text-muted-foreground">
              {on
                ? "Clientes do Plano Essencial também podem configurar e ativar a IA."
                : "Ao desligar, a IA dos clientes fora do Plano Completo é desativada na hora."}
            </span>
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
