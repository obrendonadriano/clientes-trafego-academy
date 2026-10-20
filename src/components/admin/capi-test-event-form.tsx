"use client";

import { useActionState } from "react";
import { FlaskConical } from "lucide-react";
import {
  sendCapiTestEventAction,
  type CapiTestResult,
} from "@/app/admin/conversoes/capi-test-actions";
import { FormPendingButton } from "@/components/ui/form-pending-button";
import { Input } from "@/components/ui/input";

/**
 * Envia UM LeadSubmitted ao Test Events do Dataset com a credencial salva do
 * cliente, antes de ligar CONVERSIONS_DISPATCHER_ENABLED. Mostra a resposta
 * exata da Meta; o token nunca chega ao navegador.
 */
export function CapiTestEventForm({ clientId }: { clientId: string }) {
  const [state, action] = useActionState(
    sendCapiTestEventAction,
    {} as CapiTestResult,
  );
  const result = state.result;

  return (
    <details className="mt-3 rounded-xl border border-border/60 bg-muted/10 p-3 text-xs">
      <summary className="flex cursor-pointer items-center gap-1.5 font-medium text-foreground">
        <FlaskConical className="size-3.5" />
        Evento de teste (Test Events)
      </summary>
      <form action={action} className="mt-3 space-y-2">
        <input type="hidden" name="clientId" value={clientId} />
        <p className="leading-5 text-muted-foreground">
          Envia um LeadSubmitted com o payload do sistema e o ctwa_clid do lead
          mais recente. Pegue o código em Gerenciador de Eventos → Dataset →
          Eventos de teste.
        </p>
        <Input
          name="testEventCode"
          placeholder="TEST12345"
          aria-label="Código de teste do Dataset"
          className="h-9 max-w-48 font-mono"
          required
        />
        <label className="flex items-start gap-2 leading-5 text-muted-foreground">
          <input type="checkbox" name="confirm" className="mt-0.5" required />
          Entendo que eventos de teste também entram na medição da Meta.
        </label>
        <FormPendingButton
          type="submit"
          variant="outline"
          className="h-9"
          idleLabel="Enviar evento de teste"
          pendingLabel="Enviando..."
        />
      </form>
      {state.error ? (
        <p role="alert" className="mt-2 text-destructive">
          {state.error}
        </p>
      ) : null}
      {result ? (
        <div
          role="status"
          className={
            result.accepted
              ? "mt-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-2"
              : "mt-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-2"
          }
        >
          <p className="font-medium text-foreground">
            {result.accepted
              ? `Meta aceitou: events_received ${result.eventsReceived}`
              : "Meta não confirmou o recebimento"}
          </p>
          <pre className="mt-1 whitespace-pre-wrap break-all font-mono text-[11px] text-muted-foreground">
            {JSON.stringify(
              {
                httpStatus: result.httpStatus,
                events_received: result.eventsReceived,
                fbtrace_id: result.fbtraceId,
                code: result.metaCode,
                subcode: result.subcode,
                message: result.message,
                dataset: result.datasetId,
                credencial: result.credentialSource,
                enviado_em: result.sentAt,
              },
              null,
              2,
            )}
          </pre>
        </div>
      ) : null}
    </details>
  );
}
