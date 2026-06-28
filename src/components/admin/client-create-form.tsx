"use client";

import type {
  ComponentProps,
  ComponentType,
  KeyboardEvent,
  ReactNode,
} from "react";
import {
  AtSign,
  Building2,
  ChevronLeft,
  ChevronRight,
  Contact,
  KeyRound,
  Lock,
  Mail,
  Megaphone,
  Phone,
  ShieldCheck,
  User,
} from "lucide-react";
import { useActionState, useRef, useState } from "react";
import {
  checkAvailabilityAction,
  createClientWorkspaceAction,
  type AdminActionState,
} from "@/app/admin/actions";
import { CampaignMultiSelect } from "@/components/admin/campaign-multi-select";
import { FormStepper, type WizardStep } from "@/components/admin/form-stepper";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { FormPendingButton } from "@/components/ui/form-pending-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { CampaignWithMetrics } from "@/lib/types";

type ClientCreateFormProps = {
  campaigns: CampaignWithMetrics[];
};

const initialState: AdminActionState = {};

const STEPS: (WizardStep & { fields: string[] })[] = [
  {
    id: "empresa",
    title: "Empresa",
    description: "Quem é o cliente e como falar com ele.",
    icon: Building2,
    fields: ["companyName", "contactName", "whatsapp", "notes"],
  },
  {
    id: "acesso",
    title: "Acesso",
    description: "Os dados que o cliente usará para entrar no portal.",
    icon: KeyRound,
    fields: ["accountName", "username", "email", "password"],
  },
  {
    id: "campanhas",
    title: "Campanhas",
    description: "Selecione o que este cliente poderá acompanhar.",
    icon: Megaphone,
    fields: ["campaignIds"],
  },
];

function FieldError({ message }: { message?: string }) {
  if (!message) {
    return null;
  }

  return <p className="text-xs text-destructive">{message}</p>;
}

// Máscara de celular brasileiro com +55 fixo: "+55 (11) 99999-9999".
// Mantém o código do país travado e formata DDD + número conforme digita.
function formatWhatsapp(raw: string): string {
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

function Field({
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
function IconInput({
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

export function ClientCreateForm({ campaigns }: ClientCreateFormProps) {
  const [state, formAction] = useActionState(createClientWorkspaceAction, initialState);
  // Erros detectados no blur (disponibilidade) sobrepõem-se aos do servidor.
  const [liveErrors, setLiveErrors] = useState<Record<string, string>>({});
  const [current, setCurrent] = useState(0);
  // WhatsApp já começa com +55 e é formatado com máscara enquanto digita.
  const [whatsapp, setWhatsapp] = useState("+55 ");
  // Refs dos painéis para validar nativamente só o passo visível.
  const panelRefs = useRef<(HTMLDivElement | null)[]>([]);
  // Guarda o último resultado da action já tratado, para reagir só a um
  // resultado novo, ajustando o passo durante a renderização (padrão do React
  // para "ajustar estado quando algo muda", sem useEffect).
  const [handledState, setHandledState] = useState(state);

  const fieldErrors = { ...state.fieldErrors, ...liveErrors };
  const isLastStep = current === STEPS.length - 1;
  const activeStep = STEPS[current];

  // Erro novo vindo do servidor (ex.: duplicidade no submit) → leva ao passo
  // do primeiro campo com problema, para o admin ver e corrigir.
  if (state !== handledState) {
    setHandledState(state);

    const stepWithError = state.fieldErrors
      ? STEPS.findIndex((step) =>
          step.fields.some((field) => state.fieldErrors?.[field]),
        )
      : -1;

    if (stepWithError >= 0 && stepWithError !== current) {
      setCurrent(stepWithError);
    }
  }

  async function handleAvailabilityBlur(field: "username" | "email", value: string) {
    const trimmed = value.trim();

    if (!trimmed) {
      return;
    }

    const result = await checkAvailabilityAction(
      field === "username" ? { username: trimmed } : { email: trimmed },
    );

    setLiveErrors((currentErrors) => {
      const next = { ...currentErrors };

      if (field === "username") {
        if (result.usernameTaken) {
          next.username = "Este usuário já está em uso.";
        } else {
          delete next.username;
        }
      } else {
        if (result.emailTaken) {
          next.email = "Este email já está cadastrado.";
        } else {
          delete next.email;
        }
      }

      return next;
    });
  }

  // Valida o passo atual com a própria validação nativa do navegador (mesmas
  // regras de hoje) e bloqueia se houver erro de disponibilidade pendente.
  function validateStep(index: number) {
    const panel = panelRefs.current[index];

    if (panel) {
      const controls = panel.querySelectorAll<
        HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
      >("input, textarea, select");

      for (const control of Array.from(controls)) {
        if (!control.checkValidity()) {
          control.reportValidity();
          return false;
        }
      }
    }

    if (STEPS[index].fields.some((field) => liveErrors[field])) {
      return false;
    }

    return true;
  }

  function goNext() {
    if (!validateStep(current)) {
      return;
    }

    setCurrent((value) => Math.min(value + 1, STEPS.length - 1));
  }

  function goBack() {
    setCurrent((value) => Math.max(value - 1, 0));
  }

  // Enter avança o passo em vez de submeter (evita criação acidental e o erro
  // de "controle inválido não focável" em campos de passos ocultos).
  function handleKeyDown(event: KeyboardEvent<HTMLFormElement>) {
    if (event.key !== "Enter") {
      return;
    }

    const target = event.target as HTMLElement;
    if (target.tagName === "TEXTAREA") {
      return;
    }

    event.preventDefault();
    if (!isLastStep) {
      goNext();
    }
  }

  return (
    <Card className="min-w-0">
      <CardHeader className="space-y-5">
        <div className="flex items-center gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-primary/12 text-primary">
            <User className="size-5" />
          </span>
          <div className="min-w-0">
            <h3 className="font-display text-2xl font-semibold text-foreground">
              Novo cliente
            </h3>
            <p className="text-sm text-muted-foreground">
              Empresa, acesso e campanhas em três passos rápidos.
            </p>
          </div>
        </div>

        <FormStepper steps={STEPS} current={current} onStepClick={setCurrent} />
      </CardHeader>

      <CardContent className="min-w-0 overflow-hidden">
        <form
          action={formAction}
          onKeyDown={handleKeyDown}
          className="min-w-0 space-y-6 overflow-hidden"
        >
          {/* Cabeçalho do passo ativo — dá contexto, principalmente no mobile
              onde os rótulos do stepper ficam ocultos. */}
          <div className="flex items-start gap-3 rounded-2xl border border-border/60 bg-muted/40 px-4 py-3 dark:border-white/10 dark:bg-white/[0.03]">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/12 text-primary">
              <activeStep.icon className="size-4" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">
                {activeStep.title}
              </p>
              <p className="text-sm leading-5 text-muted-foreground">
                {activeStep.description}
              </p>
            </div>
          </div>

          {/* PASSO 1 — Dados da empresa */}
          <div
            ref={(node) => {
              panelRefs.current[0] = node;
            }}
            hidden={current !== 0}
            className="min-w-0 space-y-4"
          >
            <div className="grid min-w-0 gap-4 md:grid-cols-2">
              <Field
                label="Nome da empresa"
                htmlFor="companyName"
                error={fieldErrors.companyName}
              >
                <IconInput
                  icon={Building2}
                  id="companyName"
                  name="companyName"
                  required
                  minLength={2}
                  placeholder="Ex.: Padaria do João"
                />
              </Field>
              <Field
                label="Responsável"
                htmlFor="contactName"
                error={fieldErrors.contactName}
              >
                <IconInput
                  icon={User}
                  id="contactName"
                  name="contactName"
                  required
                  minLength={2}
                  placeholder="Ex.: João Silva"
                />
              </Field>
              <Field label="WhatsApp" htmlFor="whatsapp" error={fieldErrors.whatsapp}>
                <IconInput
                  icon={Phone}
                  id="whatsapp"
                  name="whatsapp"
                  required
                  inputMode="tel"
                  value={whatsapp}
                  onChange={(event) => setWhatsapp(formatWhatsapp(event.target.value))}
                  pattern="\+55 \(\d{2}\) \d{5}-\d{4}"
                  title="Informe o WhatsApp no formato +55 (DD) 99999-9999"
                  placeholder="+55 (11) 99999-9999"
                />
              </Field>
              <Field
                label="Observações"
                htmlFor="notes"
                optional
                className="md:col-span-2"
              >
                <Textarea
                  id="notes"
                  name="notes"
                  className="min-h-[96px]"
                  placeholder="Anotações internas sobre o cliente (não aparecem para ele)."
                />
              </Field>
            </div>
          </div>

          {/* PASSO 2 — Acesso ao portal */}
          <div
            ref={(node) => {
              panelRefs.current[1] = node;
            }}
            hidden={current !== 1}
            className="min-w-0 space-y-4"
          >
            <div className="grid min-w-0 gap-4 md:grid-cols-2">
              <Field
                label="Nome exibido"
                htmlFor="accountName"
                error={fieldErrors.accountName}
              >
                <IconInput
                  icon={Contact}
                  id="accountName"
                  name="accountName"
                  required
                  minLength={2}
                  placeholder="Nome mostrado no portal"
                />
              </Field>
              <Field label="Usuário" htmlFor="username" error={fieldErrors.username}>
                <IconInput
                  icon={AtSign}
                  id="username"
                  name="username"
                  required
                  minLength={3}
                  autoCapitalize="none"
                  autoCorrect="off"
                  placeholder="ex.: empresa01"
                  onBlur={(event) =>
                    handleAvailabilityBlur("username", event.target.value)
                  }
                />
              </Field>
              <Field
                label="Email de acesso"
                htmlFor="email"
                error={fieldErrors.email}
              >
                <IconInput
                  icon={Mail}
                  id="email"
                  name="email"
                  type="email"
                  required
                  placeholder="cliente@email.com"
                  onBlur={(event) =>
                    handleAvailabilityBlur("email", event.target.value)
                  }
                />
              </Field>
              <Field label="Senha inicial" htmlFor="password" error={fieldErrors.password}>
                <IconInput
                  icon={Lock}
                  id="password"
                  name="password"
                  type="password"
                  required
                  minLength={6}
                  placeholder="Mínimo de 6 caracteres"
                />
              </Field>
            </div>

            <div className="flex items-start gap-3 rounded-2xl border border-primary/15 bg-primary/[0.06] px-4 py-3 text-sm text-muted-foreground">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />
              <p>
                O cliente entra no portal com o <strong>usuário ou email</strong> e
                a senha acima. Ele poderá trocar a senha depois.
              </p>
            </div>
          </div>

          {/* PASSO 3 — Campanhas liberadas */}
          <div
            ref={(node) => {
              panelRefs.current[2] = node;
            }}
            hidden={current !== 2}
            className="min-w-0 space-y-3"
          >
            {campaigns.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border/60 px-4 py-6 text-sm text-muted-foreground">
                Ainda não há campanhas cadastradas. Sincronize a Meta Ads em
                Campanhas e volte para liberar o acesso.
              </div>
            ) : (
              <CampaignMultiSelect campaigns={campaigns} showSelectionSummary />
            )}
          </div>

          {state.error ? (
            <p className="rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {state.error}
            </p>
          ) : null}

          {state.success ? (
            <p className="rounded-2xl border border-primary/20 bg-primary/10 px-4 py-3 text-sm text-primary">
              {state.success}
            </p>
          ) : null}

          {/* Navegação do wizard */}
          <div className="flex items-center justify-between gap-3 border-t border-border/60 pt-5 dark:border-white/10">
            <Button
              type="button"
              variant="outline"
              onClick={goBack}
              disabled={current === 0}
              className={cn(current === 0 && "invisible")}
            >
              <ChevronLeft className="mr-1 size-4" />
              Voltar
            </Button>

            <span className="text-xs font-medium text-muted-foreground sm:hidden">
              Passo {current + 1} de {STEPS.length}
            </span>

            {isLastStep ? (
              <FormPendingButton
                type="submit"
                size="lg"
                idleLabel="Criar cliente"
                pendingLabel="Criando cliente..."
              >
                Criar cliente
              </FormPendingButton>
            ) : (
              <Button type="button" size="lg" onClick={goNext}>
                Próximo
                <ChevronRight className="ml-1 size-4" />
              </Button>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
