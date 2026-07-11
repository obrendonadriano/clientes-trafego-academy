"use client";

import type { ComponentProps, ComponentType, ReactNode } from "react";
import { useState } from "react";
import { Briefcase } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
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
