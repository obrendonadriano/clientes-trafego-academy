"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Car,
  CheckCircle2,
  ClipboardList,
  KeyRound,
  Lock,
  MessagesSquare,
  SlidersHorizontal,
  Sparkles,
  X,
} from "lucide-react";
import {
  saveAiProfileAction,
  type AiAgentActionState,
} from "@/app/dashboard/atendimento-ia/actions";
import { ActivationPhrasesEditor } from "@/components/ai-agent/ai-access-settings";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FormPendingButton } from "@/components/ui/form-pending-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import {
  OVERDUE_POLICIES,
  SCRIPT_QUESTIONS,
  VEHICLE_TYPES,
  type AiActivation,
  type AiProfile,
  type OptionalQuestion,
  type OverduePolicy,
} from "@/lib/ai-agent/config";
import { effectiveQuestions } from "@/lib/ai-agent/policy";
import { describeProfile } from "@/lib/ai-agent/profile-summary";
import { cn } from "@/lib/utils";

const STEPS = [
  { title: "Sua empresa", icon: Building2 },
  { title: "Veículos", icon: Car },
  { title: "Parcelas", icon: ClipboardList },
  { title: "Limites", icon: SlidersHorizontal },
  { title: "Perguntas", icon: MessagesSquare },
  { title: "Ativação", icon: KeyRound },
  { title: "Revisão", icon: Sparkles },
] as const;

const OVERDUE_HINTS: Record<OverduePolicy, string> = {
  any: "Atende quem está pagando em dia e quem está com atraso.",
  overdue_only: "Só interessa quem já está com parcelas em atraso.",
  current_only: "Só interessa quem está com as parcelas em dia.",
};

const QUESTION_LOCK: Record<OptionalQuestion, string> = {
  vehicle_year: "Necessária pela idade do veículo",
  bank: "Necessária pelos bancos não atendidos",
  debt_amount: "Necessária pela dívida máxima",
  has_overdue_installments: "Necessária pela regra das parcelas",
};

const digitsOnly = (value: string) => value.replace(/\D/g, "");
const maskReais = (value: string) => {
  const digits = digitsOnly(value).replace(/^0+/, "").slice(0, 9);
  return digits ? `R$ ${Number(digits).toLocaleString("pt-BR")}` : "";
};
const splitList = (value: string) =>
  value
    .split(/[\n,;]+/)
    .map((item) => item.trim())
    .filter(Boolean);

type Draft = {
  company: string;
  vehicleTypes: string[];
  vehicleTypesOther: string;
  overduePolicy: OverduePolicy;
  minOverdueInstallments: string;
  minVehicleYear: string;
  manualReviewYears: string;
  maxDebtAmount: string;
  rejectedBanks: string;
  ask: Record<OptionalQuestion, boolean>;
  phrases: string[];
  notes: string;
};

function draftFrom(
  profile: AiProfile,
  company: string,
  activation: AiActivation,
): Draft {
  const known = new Set<string>(VEHICLE_TYPES);
  return {
    company,
    vehicleTypes: profile.vehicleTypes.filter((type) => known.has(type)),
    vehicleTypesOther: profile.vehicleTypes
      .filter((type) => !known.has(type))
      .join(", "),
    overduePolicy: profile.overduePolicy,
    minOverdueInstallments: profile.minOverdueInstallments
      ? String(profile.minOverdueInstallments)
      : "",
    minVehicleYear: profile.minVehicleYear ? String(profile.minVehicleYear) : "",
    manualReviewYears: String(profile.manualReviewYears),
    maxDebtAmount: profile.maxDebtAmount
      ? maskReais(String(profile.maxDebtAmount))
      : "",
    rejectedBanks: profile.rejectedBanks.join(", "),
    ask: { ...profile.ask },
    phrases: activation.phrases,
    notes: profile.notes,
  };
}

function profileFromDraft(draft: Draft): AiProfile {
  const number = (value: string) =>
    digitsOnly(value) ? Number(digitsOnly(value)) : null;
  return {
    completedAt: null,
    vehicleTypes: [...draft.vehicleTypes, ...splitList(draft.vehicleTypesOther)],
    overduePolicy: draft.overduePolicy,
    minOverdueInstallments:
      draft.overduePolicy === "current_only"
        ? null
        : number(draft.minOverdueInstallments),
    minVehicleYear: number(draft.minVehicleYear),
    manualReviewYears: Math.min(10, number(draft.manualReviewYears) ?? 0),
    maxDebtAmount: number(draft.maxDebtAmount) || null,
    rejectedBanks: splitList(draft.rejectedBanks),
    ask: draft.ask,
    notes: draft.notes,
  };
}

/** Erro do passo atual, ou null para seguir. */
function stepError(step: number, draft: Draft): string | null {
  const year = new Date().getFullYear();
  if (step === 0 && draft.company.trim().length < 2)
    return "Informe o nome da sua empresa.";
  if (
    step === 1 &&
    !draft.vehicleTypes.length &&
    !splitList(draft.vehicleTypesOther).length
  )
    return "Escolha pelo menos um tipo de veículo.";
  if (step === 2 && draft.minOverdueInstallments) {
    const value = Number(draft.minOverdueInstallments);
    if (value < 1 || value > 120)
      return "O mínimo de parcelas atrasadas precisa ser de 1 a 120.";
  }
  if (step === 3 && draft.minVehicleYear) {
    const value = Number(draft.minVehicleYear);
    if (value < 1950 || value > year + 1)
      return `O ano mínimo precisa estar entre 1950 e ${year + 1}.`;
  }
  if (step === 5) {
    const phrases = draft.phrases.map((phrase) => phrase.trim()).filter(Boolean);
    if (!phrases.length) return "Cadastre pelo menos uma frase.";
    if (phrases.some((phrase) => phrase.length < 3))
      return "Cada frase precisa de pelo menos 3 caracteres.";
  }
  return null;
}

function ChoiceCard({
  checked,
  onSelect,
  title,
  hint,
  type,
  name,
  value,
}: {
  checked: boolean;
  onSelect: () => void;
  title: string;
  hint?: string;
  type: "radio" | "checkbox";
  name: string;
  value: string;
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-start gap-3 rounded-2xl border px-4 py-3 transition-colors",
        checked
          ? "border-primary bg-primary/8 ring-1 ring-primary/30"
          : "border-border bg-card hover:bg-surface-2",
      )}
    >
      <input
        type={type}
        name={name}
        value={value}
        checked={checked}
        onChange={onSelect}
        className="mt-0.5 size-4 accent-[var(--brand-600)]"
      />
      <span className="min-w-0">
        <span className="block text-sm font-medium text-foreground">{title}</span>
        {hint ? (
          <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
            {hint}
          </span>
        ) : null}
      </span>
    </label>
  );
}

export function AiSetupWizard({
  profile,
  company,
  activation,
  onClose,
}: {
  profile: AiProfile;
  company: string;
  activation: AiActivation;
  // Presente quando o cliente está refazendo o quiz: permite sair sem salvar.
  onClose?: () => void;
}) {
  const [state, action] = useActionState(saveAiProfileAction, {} as AiAgentActionState);
  const { showToast } = useToast();
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState(() => draftFrom(profile, company, activation));
  const [handled, setHandled] = useState(state);

  useEffect(() => {
    if (state.success) showToast({ message: state.success });
    else if (state.error) showToast({ message: state.error, tone: "erro" });
  }, [showToast, state]);
  if (state !== handled) {
    setHandled(state);
    if (state.success) onClose?.();
  }

  const preview = useMemo(() => profileFromDraft(draft), [draft]);
  const defaultMinYear = new Date().getFullYear() - 10;
  const reviewMinYear = preview.minVehicleYear ?? defaultMinYear;
  const locked = effectiveQuestions({
    ...preview,
    ask: { vehicle_year: false, bank: false, debt_amount: false, has_overdue_installments: false },
  });
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  const last = step === STEPS.length - 1;
  const goNext = () => {
    const problem = stepError(step, draft);
    setError(problem);
    if (!problem) setStep(step + 1);
  };

  return (
    <Card className="mx-auto w-full max-w-3xl overflow-hidden">
      <div className="border-b border-border/60 bg-[linear-gradient(135deg,var(--brand-50),transparent)] px-5 py-5 sm:px-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-primary">
              Monte sua IA · passo {step + 1} de {STEPS.length}
            </p>
            <h2 className="mt-1 font-display text-2xl font-medium text-foreground">
              {STEPS[step].title}
            </h2>
          </div>
          {onClose ? (
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="Fechar sem salvar"
              onClick={onClose}
            >
              <X className="size-4" />
            </Button>
          ) : null}
        </div>
        <ol className="mt-5 grid grid-cols-7 gap-1.5" aria-label="Progresso">
          {STEPS.map((item, index) => (
            <li
              key={item.title}
              aria-current={index === step ? "step" : undefined}
              className={cn(
                "h-1.5 rounded-full transition-colors",
                index <= step ? "bg-primary" : "bg-border",
              )}
            >
              <span className="sr-only">{item.title}</span>
            </li>
          ))}
        </ol>
      </div>

      <CardContent className="px-5 py-6 sm:px-8">
        <form action={action} className="space-y-6">
          {/* Passo 1 — empresa */}
          <section hidden={step !== 0} className="space-y-4">
            <p className="text-sm leading-6 text-muted-foreground">
              Em poucos passos você define quem é o seu lead qualificado. A IA
              conversa com quem chega pelo anúncio, faz as perguntas e só passa
              para você quem se encaixa.
            </p>
            <div className="space-y-2">
              <Label htmlFor="wizard-company">Nome da empresa</Label>
              <Input
                id="wizard-company"
                name="company"
                value={draft.company}
                onChange={(event) => set("company", event.target.value)}
                placeholder="Ex.: Auto Compra Rápida"
                maxLength={200}
              />
            </div>
          </section>

          {/* Passo 2 — veículos */}
          <section hidden={step !== 1} className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Que tipos de veículo financiado você compra? Marque todos.
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {VEHICLE_TYPES.map((type) => (
                <ChoiceCard
                  key={type}
                  type="checkbox"
                  name="vehicleTypes"
                  value={type}
                  title={type}
                  checked={draft.vehicleTypes.includes(type)}
                  onSelect={() =>
                    set(
                      "vehicleTypes",
                      draft.vehicleTypes.includes(type)
                        ? draft.vehicleTypes.filter((item) => item !== type)
                        : [...draft.vehicleTypes, type],
                    )
                  }
                />
              ))}
            </div>
            <div className="space-y-2">
              <Label htmlFor="wizard-other-types">
                Outros <span className="text-muted-foreground">(opcional)</span>
              </Label>
              <Input
                id="wizard-other-types"
                name="vehicleTypesOther"
                value={draft.vehicleTypesOther}
                onChange={(event) => set("vehicleTypesOther", event.target.value)}
                placeholder="Ex.: Ônibus, Trator (separe por vírgula)"
                maxLength={300}
              />
            </div>
          </section>

          {/* Passo 3 — parcelas */}
          <section hidden={step !== 2} className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Qual situação de parcelas você compra?
            </p>
            <div className="space-y-2">
              {(Object.keys(OVERDUE_POLICIES) as OverduePolicy[]).map((key) => (
                <ChoiceCard
                  key={key}
                  type="radio"
                  name="overduePolicy"
                  value={key}
                  title={OVERDUE_POLICIES[key]}
                  hint={OVERDUE_HINTS[key]}
                  checked={draft.overduePolicy === key}
                  onSelect={() => set("overduePolicy", key)}
                />
              ))}
            </div>
            {draft.overduePolicy !== "current_only" ? (
              <div className="space-y-2">
                <Label htmlFor="wizard-min-overdue">
                  Mínimo de parcelas atrasadas{" "}
                  <span className="text-muted-foreground">(opcional)</span>
                </Label>
                <Input
                  id="wizard-min-overdue"
                  name="minOverdueInstallments"
                  inputMode="numeric"
                  value={draft.minOverdueInstallments}
                  onChange={(event) =>
                    set("minOverdueInstallments", digitsOnly(event.target.value).slice(0, 3))
                  }
                  placeholder="Ex.: 3"
                  className="max-w-40"
                />
                <p className="text-xs text-muted-foreground">
                  Quem tiver atraso menor que isso não é atendido.
                </p>
              </div>
            ) : null}
          </section>

          {/* Passo 4 — limites */}
          <section hidden={step !== 3} className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Limites opcionais. Deixe em branco o que não importa para você.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="wizard-min-year">Ano mínimo do veículo</Label>
                <Input
                  id="wizard-min-year"
                  name="minVehicleYear"
                  inputMode="numeric"
                  value={draft.minVehicleYear}
                  onChange={(event) =>
                    set("minVehicleYear", digitsOnly(event.target.value).slice(0, 4))
                  }
                  placeholder={`Padrão: ${defaultMinYear} (até 10 anos)`}
                />
                <p className="text-xs text-muted-foreground">
                  Em branco, vale até 10 anos de uso.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="wizard-max-debt">Dívida máxima</Label>
                <Input
                  id="wizard-max-debt"
                  name="maxDebtAmount"
                  inputMode="numeric"
                  value={draft.maxDebtAmount}
                  onChange={(event) => set("maxDebtAmount", maskReais(event.target.value))}
                  placeholder="Ex.: R$ 80.000"
                />
              </div>
            </div>
            <div className="space-y-2 rounded-2xl border border-border/60 bg-surface-2/40 p-4">
              <Label htmlFor="wizard-review-years">
                Mais antigos que o mínimo: avisar para análise manual
              </Label>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">até</span>
                <Input
                  id="wizard-review-years"
                  name="manualReviewYears"
                  inputMode="numeric"
                  value={draft.manualReviewYears}
                  onChange={(event) =>
                    set("manualReviewYears", digitsOnly(event.target.value).slice(0, 2))
                  }
                  className="w-20"
                />
                <span className="text-sm text-muted-foreground">
                  anos abaixo do mínimo
                </span>
              </div>
              <p className="text-xs leading-5 text-muted-foreground">
                {Number(draft.manualReviewYears) > 0
                  ? `Veículos de ${reviewMinYear - Math.min(10, Number(draft.manualReviewYears))} a ${reviewMinYear - 1} não são o perfil ideal, mas a IA atende e manda o lead para você marcado “análise manual”: pode ser uma oportunidade. Mais antigos que isso, a IA não responde.`
                  : "Com 0, veículos abaixo do mínimo não são atendidos."}
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="wizard-banks">Bancos que você não atende</Label>
              <Input
                id="wizard-banks"
                name="rejectedBanks"
                value={draft.rejectedBanks}
                onChange={(event) => set("rejectedBanks", event.target.value)}
                placeholder="Ex.: Banco X, Financeira Y (separe por vírgula)"
                maxLength={600}
              />
            </div>
          </section>

          {/* Passo 5 — perguntas */}
          <section hidden={step !== 4} className="space-y-4">
            <p className="text-sm text-muted-foreground">
              O que a IA pergunta ao lead, nesta ordem. Uma pergunta por vez.
            </p>
            <ul className="space-y-2">
              {(["financed", "vehicle"] as const).map((key) => (
                <li
                  key={key}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-border/60 bg-surface-2/40 px-4 py-3"
                >
                  <span className="text-sm font-medium text-foreground">
                    {SCRIPT_QUESTIONS[key]}
                  </span>
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Lock className="size-3.5" /> Sempre
                  </span>
                </li>
              ))}
              {(Object.keys(draft.ask) as OptionalQuestion[]).map((key) => (
                <li
                  key={key}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-border/60 bg-card px-4 py-3"
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-foreground">
                      {SCRIPT_QUESTIONS[key]}
                    </span>
                    {locked[key] ? (
                      <span className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                        <Lock className="size-3" /> {QUESTION_LOCK[key]}
                      </span>
                    ) : null}
                  </span>
                  <Switch
                    name={`ask_${key}`}
                    checked={draft.ask[key] || locked[key]}
                    disabled={locked[key]}
                    onChange={(event) =>
                      set("ask", { ...draft.ask, [key]: event.target.checked })
                    }
                    aria-label={SCRIPT_QUESTIONS[key]}
                  />
                  {/* Campo desabilitado não vai no form; o critério já obriga. */}
                  {locked[key] ? (
                    <input type="hidden" name={`ask_${key}`} value="on" />
                  ) : null}
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground">
              O texto de cada pergunta pode ser editado depois em “Mensagens do
              atendimento”.
            </p>
          </section>

          {/* Passo 6 — ativação */}
          <section hidden={step !== 5} className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Coloque aqui a mensagem pronta dos seus anúncios. A IA só começa a
              conversar com quem chegar por uma destas frases; o resto dos seus
              contatos não recebe nada.
            </p>
            <ActivationPhrasesEditor
              defaultPhrases={activation.phrases}
              onChange={(phrases) => set("phrases", phrases)}
              required={false}
            />
          </section>

          {/* Passo 7 — revisão */}
          <section hidden={step !== 6} className="space-y-5">
            <div className="rounded-2xl border border-primary/25 bg-primary/5 p-5">
              <p className="text-sm font-semibold text-foreground">
                Sua IA para {draft.company.trim() || "sua empresa"}
              </p>
              <ul className="mt-3 space-y-2">
                {describeProfile(preview).map((line) => (
                  <li key={line} className="flex gap-2 text-sm text-foreground">
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />
                    {line}
                  </li>
                ))}
              </ul>
            </div>
            <div className="space-y-2">
              <Label htmlFor="wizard-notes">
                Algo mais sobre o seu lead ideal?{" "}
                <span className="text-muted-foreground">(opcional)</span>
              </Label>
              <Textarea
                id="wizard-notes"
                name="notes"
                value={draft.notes}
                onChange={(event) => set("notes", event.target.value)}
                placeholder="Anotação para a sua equipe. Não muda as regras acima."
                maxLength={1000}
              />
            </div>
            <div className="flex items-start justify-between gap-4 rounded-2xl border border-border/60 bg-card px-4 py-3">
              <div>
                <p className="text-sm font-medium text-foreground">
                  Ativar o atendimento agora
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Você pode ligar ou desligar quando quiser.
                </p>
              </div>
              <Switch name="enableNow" defaultChecked aria-label="Ativar o atendimento agora" />
            </div>
          </section>

          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-5">
            <Button
              type="button"
              variant="outline"
              disabled={step === 0}
              onClick={() => {
                setError(null);
                setStep(step - 1);
              }}
            >
              <ArrowLeft className="mr-2 size-4" />
              Voltar
            </Button>
            {last ? (
              <FormPendingButton
                type="submit"
                idleLabel="Criar minha IA"
                pendingLabel="Salvando..."
              />
            ) : (
              <Button type="button" onClick={goNext}>
                Continuar
                <ArrowRight className="ml-2 size-4" />
              </Button>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
