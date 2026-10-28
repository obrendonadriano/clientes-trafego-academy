"use client";

import { useActionState, useEffect, useState } from "react";
import { ArrowDown, ArrowUp, MessageSquareText, Plus, RotateCcw, Trash2 } from "lucide-react";
import {
  restoreAiScriptAction,
  saveAiScriptAction,
  type AiAgentActionState,
} from "@/app/dashboard/atendimento-ia/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FormPendingButton } from "@/components/ui/form-pending-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import {
  DEFAULT_SCRIPT,
  MAX_SCRIPT_STEPS,
  SCRIPT_QUESTIONS,
  SCRIPT_REPLIES,
  STEP_FIELDS,
  STEP_FIELD_LABELS,
  type AiScript,
  type ScriptQuestion,
  type ScriptReply,
  type StepField,
} from "@/lib/ai-agent/config";
import { cn } from "@/lib/utils";

const initialState: AiAgentActionState = {};

function useActionToast(state: AiAgentActionState) {
  const { showToast } = useToast();
  useEffect(() => {
    if (state.success) showToast({ message: state.success });
    else if (state.error) showToast({ message: state.error, tone: "erro" });
  }, [showToast, state]);
}

type EditableStep = { id: number; fields: StepField[]; text: string };

/**
 * Roteiro do atendimento: boas-vindas, perguntas na ordem do cliente (cada
 * uma pode pedir mais de um dado), mensagem final e a de não qualificação.
 * A IA só interpreta as respostas; o texto enviado é sempre este.
 */
export function AiScriptEditor({ script }: { script: AiScript }) {
  const [saveState, saveAction] = useActionState(saveAiScriptAction, initialState);
  const [restoreState, restoreAction] = useActionState(restoreAiScriptAction, initialState);
  useActionToast(saveState);
  useActionToast(restoreState);

  const initialSteps = (script.steps ?? DEFAULT_SCRIPT.steps ?? []).map((step, index) => ({
    id: index,
    fields: [...step.fields],
    text: step.text,
  }));
  const [steps, setSteps] = useState<EditableStep[]>(initialSteps);
  const [nextId, setNextId] = useState(initialSteps.length);
  const [notQualifiedOn, setNotQualifiedOn] = useState(script.notQualified.enabled);

  // Depois de salvar/restaurar, o servidor manda o roteiro novo: recarrega.
  const serverKey = JSON.stringify(script);
  const [seenKey, setSeenKey] = useState(serverKey);
  if (serverKey !== seenKey) {
    setSeenKey(serverKey);
    const fresh = (script.steps ?? DEFAULT_SCRIPT.steps ?? []).map((step, index) => ({
      id: index,
      fields: [...step.fields],
      text: step.text,
    }));
    setSteps(fresh);
    setNextId(fresh.length);
    setNotQualifiedOn(script.notQualified.enabled);
  }

  const used = new Set(steps.flatMap((step) => step.fields));
  const update = (id: number, change: Partial<EditableStep>) =>
    setSteps((list) => list.map((step) => (step.id === id ? { ...step, ...change } : step)));
  const move = (index: number, delta: number) =>
    setSteps((list) => {
      const target = index + delta;
      if (target < 0 || target >= list.length) return list;
      const copy = [...list];
      [copy[index], copy[target]] = [copy[target], copy[index]];
      return copy;
    });

  return (
    <Card className="min-w-0">
      <CardHeader className="flex items-center gap-3">
        <div className="rounded-2xl bg-primary/12 p-3 text-primary">
          <MessageSquareText className="size-5" strokeWidth={1.75} />
        </div>
        <div>
          <CardTitle className="font-display text-xl">Roteiro do atendimento</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            A IA só entende as respostas e segue este roteiro. O texto que sai no
            WhatsApp é sempre o seu. <code className="font-mono">{"{empresa}"}</code> vira
            o nome da sua empresa e <code className="font-mono">[nome]</code>, o nome do lead.
          </p>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <form key={serverKey} action={saveAction} className="space-y-6">
          <div className="space-y-1.5">
            <Label htmlFor="script-welcome">
              Boas-vindas <span className="text-muted-foreground">(1ª mensagem, opcional)</span>
            </Label>
            <Textarea
              id="script-welcome"
              name="welcome"
              defaultValue={script.welcome}
              maxLength={1000}
              className="min-h-20"
            />
            <p className="text-xs text-muted-foreground">
              Vai num balão separado, logo antes da primeira pergunta.
            </p>
          </div>

          <fieldset className="space-y-3">
            <legend className="text-sm font-medium">Perguntas, na ordem</legend>
            <ol className="space-y-3">
              {steps.map((step, index) => (
                <li key={step.id} className="space-y-2 rounded-2xl border border-border/60 bg-card p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 text-xs font-semibold text-primary">
                      Pergunta {index + 1}
                      {step.fields.length === 0 ? (
                        <span className="rounded-full bg-muted px-2 py-0.5 font-medium text-muted-foreground">
                          Pergunta livre
                        </span>
                      ) : null}
                    </span>
                    <span className="flex items-center gap-1">
                      <Button type="button" variant="outline" size="icon" className="size-8" aria-label="Subir pergunta" disabled={index === 0} onClick={() => move(index, -1)}>
                        <ArrowUp className="size-4" />
                      </Button>
                      <Button type="button" variant="outline" size="icon" className="size-8" aria-label="Descer pergunta" disabled={index === steps.length - 1} onClick={() => move(index, 1)}>
                        <ArrowDown className="size-4" />
                      </Button>
                      <Button type="button" variant="outline" size="icon" className="size-8 text-[#b42318]" aria-label="Remover pergunta" disabled={steps.length === 1} onClick={() => setSteps((list) => list.filter((item) => item.id !== step.id))}>
                        <Trash2 className="size-4" />
                      </Button>
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5" role="group" aria-label={`Dados da pergunta ${index + 1}`}>
                    {STEP_FIELDS.map((field) => {
                      const active = step.fields.includes(field);
                      const taken = !active && used.has(field);
                      return (
                        <button
                          key={field}
                          type="button"
                          disabled={taken}
                          aria-pressed={active}
                          onClick={() =>
                            update(step.id, {
                              fields: active
                                ? step.fields.filter((item) => item !== field)
                                : [...step.fields, field],
                            })
                          }
                          className={cn(
                            "rounded-full border px-2.5 py-1 text-xs font-medium transition",
                            active
                              ? "border-primary/30 bg-primary/12 text-primary"
                              : "border-border/60 text-muted-foreground hover:bg-accent",
                            taken && "cursor-not-allowed opacity-40",
                          )}
                          title={taken ? "Já é pedido em outra pergunta" : undefined}
                        >
                          {STEP_FIELD_LABELS[field]}
                        </button>
                      );
                    })}
                  </div>
                  <Input
                    aria-label={`Texto da pergunta ${index + 1}`}
                    value={step.text}
                    onChange={(event) => update(step.id, { text: event.target.value })}
                    maxLength={500}
                    placeholder="Ex.: Qual é o modelo e ano do veículo?"
                  />
                </li>
              ))}
            </ol>
            {steps.length < MAX_SCRIPT_STEPS ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setSteps((list) => [...list, { id: nextId, fields: [], text: "" }]);
                  setNextId(nextId + 1);
                }}
              >
                <Plus className="mr-2 size-4" />
                Adicionar pergunta
              </Button>
            ) : null}
            <p className="text-xs leading-5 text-muted-foreground">
              Marque quais dados cada pergunta pede. Se o lead responder só parte
              (ex.: o modelo sem o ano), a IA pergunta só o que faltou. Nome e
              cidade são opcionais: sem resposta, a IA segue em frente. Sem
              nenhum dado marcado, é uma pergunta livre: a IA faz a pergunta,
              guarda a resposta como veio e ela aparece na notificação do lead.
            </p>
            <input
              type="hidden"
              name="steps"
              value={JSON.stringify(steps.map(({ fields, text }) => ({ fields, text })))}
            />
          </fieldset>

          <div className="space-y-1.5">
            <Label htmlFor="script-r-qualified">Mensagem final (lead qualificado)</Label>
            <Textarea
              id="script-r-qualified"
              name="r_qualified"
              defaultValue={script.replies.qualified}
              maxLength={500}
              className="min-h-16"
            />
          </div>

          <div className="space-y-2 rounded-2xl border border-border/60 p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-foreground">Mensagem para quem não se encaixa</p>
                <p className="text-xs text-muted-foreground">
                  Quitado, sem veículo ou fora dos critérios. Desligada, a IA não responde.
                </p>
              </div>
              <Switch
                name="notQualifiedEnabled"
                checked={notQualifiedOn}
                onChange={(event) => setNotQualifiedOn(event.target.checked)}
                aria-label="Enviar mensagem para quem não se encaixa"
              />
            </div>
            <Textarea
              name="notQualifiedText"
              defaultValue={script.notQualified.text}
              maxLength={1500}
              className={cn("min-h-40", !notQualifiedOn && "opacity-60")}
              aria-label="Texto da mensagem de não qualificação"
            />
          </div>

          <details className="rounded-xl border p-4">
            <summary className="cursor-pointer text-sm font-medium">Mais mensagens</summary>
            <div className="mt-4 space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="script-greeting" className="text-xs">Saudação curta (sem boas-vindas)</Label>
                  <Input id="script-greeting" name="greeting" defaultValue={script.greeting} maxLength={80} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="script-acknowledge" className="text-xs">Confirmação ao receber um dado (opcional)</Label>
                  <Input id="script-acknowledge" name="acknowledge" defaultValue={script.acknowledge} maxLength={80} />
                </div>
              </div>
              <p className="text-xs font-medium text-foreground">
                Perguntas individuais (usadas quando o lead responde só parte)
              </p>
              {Object.entries(SCRIPT_QUESTIONS).map(([key, label]) => (
                <div className="space-y-1" key={key}>
                  <Label htmlFor={`script-q-${key}`} className="text-xs">{label}</Label>
                  <Input
                    id={`script-q-${key}`}
                    name={`q_${key}`}
                    defaultValue={script.questions[key as ScriptQuestion]}
                    maxLength={500}
                    required
                  />
                </div>
              ))}
              <p className="text-xs font-medium text-foreground">Respostas para cada situação</p>
              {Object.entries(SCRIPT_REPLIES)
                .filter(([key]) => key !== "qualified")
                .map(([key, label]) => (
                  <div className="space-y-1" key={key}>
                    <Label htmlFor={`script-r-${key}`} className="text-xs">{label}</Label>
                    <Textarea
                      id={`script-r-${key}`}
                      name={`r_${key}`}
                      defaultValue={script.replies[key as ScriptReply]}
                      maxLength={500}
                      required
                      className="min-h-14"
                    />
                  </div>
                ))}
            </div>
          </details>

          <FormPendingButton type="submit" idleLabel="Salvar roteiro" pendingLabel="Salvando..." />
        </form>

        <form action={restoreAction}>
          <FormPendingButton
            type="submit"
            variant="outline"
            idleLabel="Restaurar roteiro padrão"
            pendingLabel="Restaurando..."
          >
            <RotateCcw className="mr-2 size-4" />
            Restaurar roteiro padrão
          </FormPendingButton>
        </form>
      </CardContent>
    </Card>
  );
}
