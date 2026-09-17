"use client";

import { useActionState, useEffect, useState } from "react";
import {
  BellRing,
  Bot,
  CheckCircle2,
  MessageSquareText,
  PlugZap,
  RotateCcw,
  SendHorizonal,
  Settings2,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import {
  restoreAiPromptAction,
  saveAiAdvancedSettingsAction,
  saveAiPromptAction,
  saveNotificationNumberAction,
  testNotificationNumberAction,
  toggleAiAgentAction,
  type AiAgentActionState,
} from "@/app/dashboard/atendimento-ia/actions";
import { AiLeadsPanel } from "@/components/ai-agent/ai-leads-panel";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FormPendingButton } from "@/components/ui/form-pending-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { formatBrazilianWhatsapp } from "@/lib/ai-agent/shared";
import type { AiAgentPageData } from "@/lib/data/ai-agent";
import { cn } from "@/lib/utils";

const initialState: AiAgentActionState = {};

/** Mostra o retorno da action como toast, sem repetir em cada renderização. */
function useActionToast(state: AiAgentActionState) {
  const { showToast } = useToast();

  useEffect(() => {
    if (state.success) {
      showToast({ message: state.success });
      return;
    }

    if (state.error) {
      showToast({ message: state.error, tone: "erro" });
    }
  }, [showToast, state]);
}

export function AiAgentPage({
  data,
  interactive,
}: {
  data: AiAgentPageData;
  // Falso no Plano Essencial: a tela aparece inteira, mas inerte.
  interactive: boolean;
}) {
  return (
    <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
      <div className="min-w-0 space-y-5">
        <StatusCard data={data} interactive={interactive} />
        <PromptCard data={data} />
        <AiLeadsPanel
          conversations={data.conversations}
          interactive={interactive}
        />
      </div>

      <div className="min-w-0 space-y-5">
        <NotificationCard data={data} />
        <AdvancedCard data={data} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Card 1 — Status
// ---------------------------------------------------------------------------

function StatusCard({
  data,
  interactive,
}: {
  data: AiAgentPageData;
  interactive: boolean;
}) {
  const [state, formAction] = useActionState(toggleAiAgentAction, initialState);
  useActionToast(state);

  const { settings, whatsappConnected, whatsappPhone, totals } = data;
  const canEnable = whatsappConnected && interactive;

  return (
    <Card className="min-w-0">
      <CardHeader className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              "rounded-2xl p-3",
              settings.enabled
                ? "bg-primary/12 text-primary"
                : "bg-muted text-muted-foreground",
            )}
          >
            <Bot className="size-5" strokeWidth={1.75} />
          </div>
          <div>
            <CardTitle className="font-display text-xl">
              Atendimento por IA
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              {settings.enabled
                ? "IA atendendo automaticamente"
                : "Atendimento automático desativado"}
            </p>
          </div>
        </div>

        <form action={formAction}>
          <input
            type="hidden"
            name="enabled"
            value={settings.enabled ? "false" : "true"}
          />
          <button
            type="submit"
            disabled={!canEnable && !settings.enabled}
            aria-label={
              settings.enabled
                ? "Desativar atendimento por IA"
                : "Ativar atendimento por IA"
            }
            className="flex items-center gap-3 rounded-2xl border border-border/60 bg-background/60 px-4 py-2.5 text-sm font-medium transition enabled:hover:border-primary/30 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <span>{settings.enabled ? "ATIVADO" : "DESATIVADO"}</span>
            <span
              className={cn(
                "relative h-7 w-12 rounded-full transition-colors",
                settings.enabled ? "bg-primary" : "bg-muted dark:bg-white/15",
                "after:absolute after:left-1 after:top-1 after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow-sm after:transition-transform after:content-['']",
                settings.enabled && "after:translate-x-5",
              )}
            />
          </button>
        </form>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-border/60 bg-background/60 px-4 py-3">
            <p className="text-xs text-muted-foreground">WhatsApp</p>
            <p className="mt-1 flex items-center gap-2 font-medium text-foreground">
              <span aria-hidden="true">{whatsappConnected ? "🟢" : "🔴"}</span>
              {whatsappConnected ? "Conectado" : "Desconectado"}
            </p>
            {whatsappPhone ? (
              <p className="mt-0.5 text-xs text-muted-foreground">
                {formatBrazilianWhatsapp(whatsappPhone)}
              </p>
            ) : null}
          </div>

          <div className="rounded-2xl border border-border/60 bg-background/60 px-4 py-3">
            <p className="text-xs text-muted-foreground">Leads atendidos</p>
            <p className="mt-1 font-display text-xl text-foreground">
              {totals.total}
            </p>
          </div>

          <div className="rounded-2xl border border-border/60 bg-background/60 px-4 py-3">
            <p className="text-xs text-muted-foreground">Qualificados</p>
            <p className="mt-1 font-display text-xl text-foreground">
              {totals.qualified}
            </p>
          </div>
        </div>

        {!whatsappConnected ? (
          <p className="flex items-start gap-2 rounded-2xl border border-amber-500/30 bg-amber-500/[0.12] px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
            <PlugZap className="mt-0.5 size-4 shrink-0" />
            <span>
              Conecte seu WhatsApp antes de ativar o atendimento automático.
            </span>
          </p>
        ) : null}

        {settings.disabledByPlanAt && !settings.enabled ? (
          <p className="flex items-start gap-2 rounded-2xl border border-border/60 bg-background/60 px-4 py-3 text-sm text-muted-foreground">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            <span>
              A IA foi desativada por mudança de plano. Suas configurações,
              prompt e histórico continuam salvos.
            </span>
          </p>
        ) : null}

        <p className="flex items-start gap-2 text-xs leading-5 text-muted-foreground">
          <Sparkles className="mt-0.5 size-3.5 shrink-0" />
          {settings.alwaysOn
            ? "Atendimento 24 horas por dia, 7 dias por semana."
            : "Atendimento fora do modo 24 horas."}
        </p>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Card 2 — WhatsApp de notificação
// ---------------------------------------------------------------------------

function NotificationCard({ data }: { data: AiAgentPageData }) {
  const [saveState, saveAction] = useActionState(
    saveNotificationNumberAction,
    initialState,
  );
  const [testState, testAction] = useActionState(
    testNotificationNumberAction,
    initialState,
  );

  useActionToast(saveState);
  useActionToast(testState);

  const [value, setValue] = useState(() =>
    formatBrazilianWhatsapp(data.settings.notificationWhatsapp),
  );

  const error =
    saveState.fieldErrors?.notificationWhatsapp ??
    testState.fieldErrors?.notificationWhatsapp;

  return (
    <Card className="min-w-0">
      <CardHeader className="flex items-center gap-3">
        <div className="rounded-2xl bg-primary/12 p-3 text-primary">
          <BellRing className="size-5" strokeWidth={1.75} />
        </div>
        <div>
          <CardTitle className="font-display text-xl">
            WhatsApp para receber leads
          </CardTitle>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <p className="text-sm leading-6 text-muted-foreground">
          Quando a IA identificar um lead qualificado, enviaremos
          automaticamente um resumo para este número.
        </p>

        <form action={saveAction} className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="notificationWhatsapp">Número pessoal</Label>
            <Input
              id="notificationWhatsapp"
              name="notificationWhatsapp"
              inputMode="tel"
              autoComplete="tel"
              placeholder="(14) 99999-9999"
              value={value}
              onChange={(event) => setValue(event.target.value)}
            />
            {error ? <p className="text-xs text-destructive">{error}</p> : null}
          </div>

          <FormPendingButton
            type="submit"
            className="w-full"
            idleLabel="Salvar número"
            pendingLabel="Salvando..."
          />
        </form>

        <form action={testAction}>
          <input type="hidden" name="notificationWhatsapp" value={value} />
          <FormPendingButton
            type="submit"
            variant="outline"
            className="w-full"
            idleLabel="Testar número de notificação"
            pendingLabel="Enviando..."
          >
            <SendHorizonal className="mr-2 size-4" />
            Testar número de notificação
          </FormPendingButton>
        </form>

        {data.settings.notificationWhatsapp ? (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <CheckCircle2 className="size-3.5 text-emerald-500" />
            Salvo como {formatBrazilianWhatsapp(data.settings.notificationWhatsapp)}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Card 3 — Prompt
// ---------------------------------------------------------------------------

function PromptCard({ data }: { data: AiAgentPageData }) {
  const [saveState, saveAction] = useActionState(saveAiPromptAction, initialState);
  const [restoreState, restoreAction] = useActionState(
    restoreAiPromptAction,
    initialState,
  );

  useActionToast(saveState);
  useActionToast(restoreState);

  // `key` faz o textarea recarregar o valor do servidor quando o prompt muda
  // (salvar ou restaurar), sem precisar espelhar o texto em estado.
  const promptKey = data.settings.prompt.length + data.settings.prompt.slice(0, 32);

  return (
    <Card className="min-w-0">
      <CardHeader className="flex items-center gap-3">
        <div className="rounded-2xl bg-primary/12 p-3 text-primary">
          <MessageSquareText className="size-5" strokeWidth={1.75} />
        </div>
        <div>
          <CardTitle className="font-display text-xl">Prompt da IA</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            As instruções que definem como a IA conversa e o que ela coleta.
          </p>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        <form action={saveAction} className="space-y-3">
          <Textarea
            key={promptKey}
            id="prompt"
            name="prompt"
            defaultValue={data.settings.prompt}
            className="min-h-[22rem] font-mono text-[0.8125rem] leading-6"
            spellCheck={false}
          />

          {saveState.fieldErrors?.prompt ? (
            <p className="text-xs text-destructive">
              {saveState.fieldErrors.prompt}
            </p>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <FormPendingButton
              type="submit"
              idleLabel="Salvar alterações"
              pendingLabel="Salvando..."
            />
          </div>
        </form>

        <form action={restoreAction}>
          <FormPendingButton
            type="submit"
            variant="outline"
            idleLabel="Restaurar prompt padrão"
            pendingLabel="Restaurando..."
          >
            <RotateCcw className="mr-2 size-4" />
            Restaurar prompt padrão
          </FormPendingButton>
        </form>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Card 4 — Configurações avançadas
// ---------------------------------------------------------------------------

function secondsValue(ms: number) {
  return String(Math.round(ms / 100) / 10);
}

function AdvancedCard({ data }: { data: AiAgentPageData }) {
  const [state, formAction] = useActionState(
    saveAiAdvancedSettingsAction,
    initialState,
  );
  useActionToast(state);

  const { settings } = data;

  return (
    <Card className="min-w-0">
      <CardHeader className="flex items-center gap-3">
        <div className="rounded-2xl bg-primary/12 p-3 text-primary">
          <Settings2 className="size-5" strokeWidth={1.75} />
        </div>
        <CardTitle className="font-display text-xl">
          Configurações de atendimento
        </CardTitle>
      </CardHeader>

      <CardContent>
        <form action={formAction} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <SecondsField
              label="Delay mínimo"
              name="delayMin"
              defaultValue={secondsValue(settings.delayMinMs)}
              error={state.fieldErrors?.delayMinMs}
            />
            <SecondsField
              label="Delay máximo"
              name="delayMax"
              defaultValue={secondsValue(settings.delayMaxMs)}
              error={state.fieldErrors?.delayMaxMs}
            />
            <SecondsField
              label="Entre mensagens (mín.)"
              name="messageGapMin"
              defaultValue={secondsValue(settings.messageGapMinMs)}
              error={state.fieldErrors?.messageGapMinMs}
            />
            <SecondsField
              label="Entre mensagens (máx.)"
              name="messageGapMax"
              defaultValue={secondsValue(settings.messageGapMaxMs)}
              error={state.fieldErrors?.messageGapMaxMs}
            />
            <SecondsField
              label="Agrupar mensagens do lead"
              name="debounce"
              defaultValue={secondsValue(settings.debounceMs)}
              error={state.fieldErrors?.debounceMs}
              className="sm:col-span-2"
              hint="Tempo de silêncio antes de a IA responder uma sequência de mensagens."
            />
          </div>

          <ToggleRow
            name="alwaysOn"
            label="Atendimento 24 horas"
            hint="A IA responde a qualquer hora do dia."
            defaultChecked={settings.alwaysOn}
          />
          <ToggleRow
            name="typingEnabled"
            label='Enviar status "digitando"'
            hint="Mostra que está digitando antes de cada mensagem."
            defaultChecked={settings.typingEnabled}
          />
          <ToggleRow
            name="notifyQualified"
            label="Notificar leads qualificados"
            hint="Envia o resumo para o seu WhatsApp pessoal."
            defaultChecked={settings.notifyQualified}
          />

          <FormPendingButton
            type="submit"
            className="w-full"
            idleLabel="Salvar configurações"
            pendingLabel="Salvando..."
          />
        </form>
      </CardContent>
    </Card>
  );
}

function SecondsField({
  label,
  name,
  defaultValue,
  error,
  hint,
  className,
}: {
  label: string;
  name: string;
  defaultValue: string;
  error?: string;
  hint?: string;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0 space-y-2", className)}>
      <Label htmlFor={name}>{label}</Label>
      <div className="relative">
        <Input
          id={name}
          name={name}
          type="number"
          min={0}
          max={60}
          step={0.5}
          defaultValue={defaultValue}
          className="pr-10"
        />
        <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
          s
        </span>
      </div>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

function ToggleRow({
  name,
  label,
  hint,
  defaultChecked,
}: {
  name: string;
  label: string;
  hint: string;
  defaultChecked: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-2xl border border-border/60 bg-background/60 px-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{hint}</p>
      </div>
      <Switch name={name} defaultChecked={defaultChecked} aria-label={label} />
    </div>
  );
}

export function AiAgentPlanBadge({ enabled }: { enabled: boolean }) {
  return (
    <Badge variant={enabled ? "success" : "secondary"}>
      {enabled ? "IA ativa" : "IA desativada"}
    </Badge>
  );
}
