"use client";

import type { ComponentProps, ComponentType, ReactNode } from "react";
import { useState } from "react";
import { Briefcase, Sparkles, Target } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  CLIENT_PLAN_LABELS,
  CLIENT_PLAN_TYPES,
  type ClientPlanType,
} from "@/lib/ai-agent/shared";
import type { ConversionGoalType } from "@/lib/conversions/shared";
import { CLIENT_SEGMENTS } from "@/lib/segments";
import { cn } from "@/lib/utils";

// Helpers compartilhados entre o cadastro (wizard) e a edição de clientes,
// para manter o mesmo visual sem duplicar código.

export function FieldError({ message }: { message?: string }) {
  if (!message) {
    return null;
  }

  return <p className="text-xs text-destructive">{message}</p>;
}

export function Field({
  label,
  htmlFor,
  error,
  optional,
  children,
  className,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  optional?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0 space-y-2", className)}>
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={htmlFor}>{label}</Label>
        {optional ? (
          <span className="text-xs text-muted-foreground">Opcional</span>
        ) : null}
      </div>
      {children}
      <FieldError message={error} />
    </div>
  );
}

// Input com ícone à esquerda — reaproveita o Input base só adicionando padding.
export function IconInput({
  icon: Icon,
  className,
  ...props
}: { icon: ComponentType<{ className?: string }> } & ComponentProps<
  typeof Input
>) {
  return (
    <div className="relative min-w-0">
      <Icon className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input className={cn("pl-11", className)} {...props} />
    </div>
  );
}

// Máscara de celular brasileiro com +55 fixo: "+55 (11) 99999-9999".
// Mantém o código do país travado e formata DDD + número conforme digita.
export function formatWhatsapp(raw: string): string {
  let digits = raw.replace(/\D/g, "");

  if (!digits.startsWith("55")) {
    digits = `55${digits}`;
  }

  digits = digits.slice(0, 13); // 55 + DDD (2) + número (9)

  // Só o código do país: volta ao estado inicial pré-preenchido.
  if (digits.length <= 2) {
    return "+55 ";
  }

  const ddd = digits.slice(2, 4);
  const part1 = digits.slice(4, 9);
  const part2 = digits.slice(9, 13);

  let formatted = "+55";
  formatted += ` (${ddd}`;
  if (ddd.length === 2) {
    formatted += ")";
  }
  if (part1) {
    formatted += ` ${part1}`;
  }
  if (part2) {
    formatted += `-${part2}`;
  }

  return formatted;
}

// Pattern do WhatsApp completo, usado na validação nativa dos formulários.
export const WHATSAPP_PATTERN = "\\+55 \\(\\d{2}\\) \\d{5}-\\d{4}";
export const WHATSAPP_TITLE =
  "Informe o WhatsApp no formato +55 (DD) 99999-9999";

// Seleção do nicho do cliente (dá contexto à IA dos relatórios). Presets +
// "Outro" com descrição livre. Opcional — sem segmento, o texto sai genérico.
export function SegmentField({
  defaultSegment,
  defaultDescription,
}: {
  defaultSegment?: string;
  defaultDescription?: string;
}) {
  const [segment, setSegment] = useState(defaultSegment ?? "");

  return (
    <div className="min-w-0 space-y-4 md:col-span-2">
      <Field label="Segmento do cliente (contexto da IA)" htmlFor="segment" optional>
        <div className="relative min-w-0">
          <Briefcase className="pointer-events-none absolute left-4 top-1/2 z-10 size-4 -translate-y-1/2 text-muted-foreground" />
          <Select
            id="segment"
            name="segment"
            value={segment}
            onChange={(event) => setSegment(event.target.value)}
            className="pl-11"
          >
            <option value="">Não definido (texto genérico)</option>
            {CLIENT_SEGMENTS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </div>
      </Field>

      {segment === "outro" ? (
        <Field label="Descreva o negócio do cliente" htmlFor="segmentDescription">
          <Textarea
            id="segmentDescription"
            name="segmentDescription"
            required
            defaultValue={defaultDescription}
            className="min-h-[88px]"
            placeholder="O que o cliente vende, qual o público e o que conta como 'resultado' (ex.: conversas no WhatsApp, ingressos vendidos...)."
          />
        </Field>
      ) : null}
    </div>
  );
}

// Tipo de resultado final do negócio. Decide o que a etapa final do Kanban
// significa e qual conversão é enviada à Meta — por isso é uma configuração
// explícita, e não algo deduzido do segmento.
//
// O gestor não lê nomes técnicos aqui; eles ficam no painel administrativo.
export function ConversionGoalField({
  defaultValue = "vehicle_acquisition",
  hasHistory = false,
  error,
}: {
  defaultValue?: ConversionGoalType;
  // Com fechamentos já registrados, trocar o modelo pede confirmação.
  hasHistory?: boolean;
  error?: string;
}) {
  const [goal, setGoal] = useState<ConversionGoalType>(defaultValue);
  const changed = goal !== defaultValue;

  return (
    <div className="min-w-0 space-y-2 md:col-span-2">
      <Field
        label="Tipo de resultado final"
        htmlFor="conversionGoalType"
        error={error}
      >
        <div className="relative min-w-0">
          <Target className="pointer-events-none absolute left-4 top-1/2 z-10 size-4 -translate-y-1/2 text-muted-foreground" />
          <Select
            id="conversionGoalType"
            name="conversionGoalType"
            value={goal}
            onChange={(event) =>
              setGoal(event.target.value as ConversionGoalType)
            }
            className="pl-11"
          >
            <option value="vehicle_acquisition">Compra / Aquisição</option>
            <option value="sale">Venda</option>
          </Select>
        </div>
      </Field>

      <p className="text-xs leading-5 text-muted-foreground">
        {goal === "sale"
          ? "A empresa vende um produto ou serviço ao lead. A última etapa vira “Vendas realizadas” e o valor informado é a receita do contrato. Ex.: agência, dentista, energia solar."
          : "A empresa compra algo do lead. A última etapa vira “Veículos comprados” e o valor informado é o custo de aquisição, que nunca é tratado como receita. Ex.: compra de veículos."}
      </p>

      {hasHistory && changed ? (
        <label className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs leading-5">
          <input
            type="checkbox"
            name="confirmGoalChange"
            className="mt-0.5 size-4 shrink-0"
          />
          <span>
            Este cliente já tem fechamentos registrados. Confirmo a troca do
            modelo. Os resultados já enviados à Meta não mudam; apenas os
            próximos fechamentos passam a usar o novo modelo.
          </span>
        </label>
      ) : null}
    </div>
  );
}

// Plano do cliente. Escolher "Completo" libera a area de Atendimento IA;
// voltar para "Essencial" bloqueia na hora e desliga a IA, sem apagar nada.
export function PlanTypeField({
  defaultValue = "essential",
}: {
  defaultValue?: ClientPlanType;
}) {
  const [plan, setPlan] = useState<ClientPlanType>(defaultValue);

  return (
    <div className="min-w-0 space-y-2 md:col-span-2">
      <Field label="Plano do cliente" htmlFor="planType">
        <div className="relative min-w-0">
          <Sparkles className="pointer-events-none absolute left-4 top-1/2 z-10 size-4 -translate-y-1/2 text-muted-foreground" />
          <Select
            id="planType"
            name="planType"
            value={plan}
            onChange={(event) => setPlan(event.target.value as ClientPlanType)}
            className="pl-11"
          >
            {CLIENT_PLAN_TYPES.map((option) => (
              <option key={option} value={option}>
                {CLIENT_PLAN_LABELS[option]}
              </option>
            ))}
          </Select>
        </div>
      </Field>

      <p className="text-xs leading-5 text-muted-foreground">
        {plan === "complete"
          ? "Libera o Atendimento IA: ativacao, prompt, WhatsApp de notificacao, historico e leads qualificados."
          : "O cliente ve a area de Atendimento IA bloqueada, com o convite para upgrade."}
      </p>
    </div>
  );
}
