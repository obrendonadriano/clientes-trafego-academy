"use client";
import { useActionState } from "react";
import {
  saveAiKnowledgeAction,
  saveAiScheduleAction,
  type AiAgentActionState,
} from "@/app/dashboard/atendimento-ia/actions";
import type { AiAgentSettings } from "@/lib/ai-agent/shared";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormPendingButton } from "@/components/ui/form-pending-button";

const SECTIONS = {
  buys: "O que a empresa compra",
  doesNotBuy: "O que não compra",
  regions: "Regiões atendidas",
  hours: "Horários da equipe",
  documents: "Documentos necessários",
  rules: "Regras comerciais",
  forbiddenPromises: "Promessas proibidas",
  allowedFacts: "Outras informações confirmadas",
  escalation: "Quando chamar a equipe",
} as const;
function Feedback({ state }: { state: AiAgentActionState }) {
  return (
    <p
      role="status"
      className={
        state.error
          ? "text-sm text-destructive"
          : "text-sm text-muted-foreground"
      }
    >
      {state.error ?? state.success}
    </p>
  );
}
export function AiKnowledgeSettings({
  settings,
}: {
  settings: AiAgentSettings;
}) {
  const [state, action] = useActionState(saveAiKnowledgeAction, {});
  const kb = settings.knowledge;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Informações da empresa</CardTitle>
        <p className="text-sm text-muted-foreground">
          Cadastre somente informações confirmadas. Sem uma resposta cadastrada,
          a IA encaminha a dúvida à equipe. As regras de qualificação continuam
          definidas pelo sistema.
        </p>
      </CardHeader>
      <CardContent>
        <form action={action} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="kb-company">Nome da empresa</Label>
            <Input
              id="kb-company"
              name="company"
              defaultValue={kb.company}
              maxLength={200}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="kb-service">Como a empresa trabalha</Label>
            <Textarea
              id="kb-service"
              name="service"
              defaultValue={kb.service}
              maxLength={500}
            />
          </div>
          <details className="rounded-xl border p-4">
            <summary className="cursor-pointer font-medium">
              Editar informações e limites do atendimento
            </summary>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {Object.entries(SECTIONS).map(([key, label]) => (
                <div className="space-y-2" key={key}>
                  <Label htmlFor={`kb-${key}`}>{label}</Label>
                  <Textarea
                    id={`kb-${key}`}
                    name={key}
                    defaultValue={kb[key as keyof typeof SECTIONS].join("\n")}
                    placeholder="Um item por linha"
                    maxLength={15030}
                  />
                </div>
              ))}
            </div>
            <div className="mt-4 space-y-2">
              <Label htmlFor="kb-faq">Perguntas frequentes</Label>
              <Textarea
                id="kb-faq"
                name="faq"
                defaultValue={kb.faq
                  .map((f) => `${f.question} | ${f.answer}`)
                  .join("\n")}
                placeholder="Pergunta | Resposta confirmada (uma por linha)"
                maxLength={22000}
              />
            </div>
          </details>
          <Feedback state={state} />
          <FormPendingButton
            type="submit"
            idleLabel="Salvar informações"
            pendingLabel="Salvando..."
          />
        </form>
      </CardContent>
    </Card>
  );
}
export function AiScheduleSettings({
  settings,
}: {
  settings: AiAgentSettings;
}) {
  const [state, action] = useActionState(saveAiScheduleAction, {});
  const s = settings.businessSchedule;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Horário de atendimento</CardTitle>
        <p className="text-sm text-muted-foreground">
          Usado quando o atendimento 24 horas está desativado. Fora do horário,
          a confirmação é enviada uma vez por período fechado.
        </p>
      </CardHeader>
      <CardContent>
        <form action={action} className="space-y-4">
          <fieldset>
            <legend className="mb-2 text-sm font-medium">
              Dias de atendimento
            </legend>
            <div className="flex flex-wrap gap-3">
              {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map(
                (day, i) => (
                  <label key={day} className="flex items-center gap-1 text-sm">
                    <input
                      type="checkbox"
                      name="weekdays"
                      value={i}
                      defaultChecked={s.weekdays.includes(i)}
                    />
                    {day}
                  </label>
                ),
              )}
            </div>
          </fieldset>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="ai-start">Início</Label>
              <Input
                id="ai-start"
                name="start"
                type="time"
                defaultValue={s.start}
                required
              />
            </div>
            <div>
              <Label htmlFor="ai-end">Fim</Label>
              <Input
                id="ai-end"
                name="end"
                type="time"
                defaultValue={s.end}
                required
              />
            </div>
          </div>
          <div>
            <Label htmlFor="ai-timezone">Fuso horário</Label>
            <Input
              id="ai-timezone"
              name="timezone"
              defaultValue={s.timezone}
              placeholder="America/Sao_Paulo"
              required
            />
          </div>
          <div>
            <Label htmlFor="ai-closed-message">Mensagem fora do horário</Label>
            <Textarea
              id="ai-closed-message"
              name="offHoursMessage"
              defaultValue={s.offHoursMessage}
              maxLength={500}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Deixe em branco para não enviar confirmação. A IA só volta a
              responder a partir de uma nova mensagem no horário de atendimento.
            </p>
          </div>
          <Feedback state={state} />
          <FormPendingButton
            type="submit"
            idleLabel="Salvar horários"
            pendingLabel="Salvando..."
          />
        </form>
      </CardContent>
    </Card>
  );
}
