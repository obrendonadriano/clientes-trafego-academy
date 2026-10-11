// Leitura do corpo do webhook oficial e gravação de cada mensagem pela RPC
// `meta_ingest_ad_lead`. Fica separado da rota para ser testado contra o SQL
// real: sem dependências, a RPC chega por parâmetro.
//
// Uma falha de gravação NÃO interrompe o lote: as demais mensagens do mesmo
// payload continuam sendo processadas, e só no fim a rota decide a resposta.
// Se qualquer gravação falhou, a rota responde 500 e a Meta reentrega o
// payload inteiro — o que já tinha entrado não duplica, porque a RPC é
// idempotente por wa_message_id e ctwa_clid.
//
// Falha PERMANENTE (uma mensagem que o banco sempre recusa) não é tratada
// aqui: a Meta vai reentregar o payload repetidamente, e a idempotência
// garante que isso não duplica nem corrompe nada. Esse caso pede diagnóstico
// operacional pelo log — que identifica o item pelo wa_message_id e pelo
// phone_number_id, sem telefone, token ou segredo.
//
// Este módulo não lê env, não abre Supabase, não envia nada à Meta e não
// conhece segredos: a rota injeta a RPC e cuida de assinatura, after() e HTTP.

export type Referral = {
  source_url?: string;
  source_id?: string;
  source_type?: string;
  ctwa_clid?: string;
};

export type WebhookMessage = {
  id?: string;
  from?: string;
  timestamp?: string;
  referral?: Referral;
};

export type WebhookValue = {
  metadata?: { phone_number_id?: string; display_phone_number?: string };
  contacts?: { wa_id?: string; profile?: { name?: string } }[];
  messages?: WebhookMessage[];
};

export type WebhookBody = {
  object?: string;
  entry?: { id?: string; changes?: { field?: string; value?: WebhookValue }[] }[];
};

export type IngestArgs = {
  p_phone_number_id: string | null;
  p_waba_id: string | null;
  p_wa_message_id: string | null;
  p_telefone: string;
  p_ctwa_clid: string | null;
  p_nome: string | null;
  p_ad_source_id: string | null;
  p_ad_source_url: string | null;
  p_ad_source_type: string | null;
  p_event_time: string | null;
};

export type IngestRpc = (
  args: IngestArgs,
) => PromiseLike<{ data: unknown; error: { message: string } | null }>;

export type IngestOutcome = {
  createdLead: boolean;
  processed: number;
  failed: number;
};

export type IngestFailureLog = {
  message: string;
  wa_message_id: string | null;
  phone_number_id: string | null;
};

type Logger = (label: string, detail: IngestFailureLog) => void;

export async function ingestWebhookMessages(
  body: WebhookBody,
  ingest: IngestRpc,
  logError: Logger = console.error,
): Promise<IngestOutcome> {
  const outcome: IngestOutcome = { createdLead: false, processed: 0, failed: 0 };

  for (const entry of body.entry ?? []) {
    const wabaId = entry.id ?? null;

    for (const change of entry.changes ?? []) {
      if (change.field !== "messages") {
        continue;
      }

      const value = change.value ?? {};
      const phoneNumberId = value.metadata?.phone_number_id ?? null;

      for (const message of value.messages ?? []) {
        const referral = message.referral;
        const phone = message.from ?? null;

        if (!phone) {
          continue;
        }

        const contact = (value.contacts ?? []).find(
          (item) => item.wa_id === phone,
        );
        // O horário original do evento vem da Meta. Ele é preservado no banco
        // e enviado como event_time; nunca é substituído por "agora".
        const seconds = Number(message.timestamp);
        const eventTime = Number.isFinite(seconds) && seconds > 0
          ? new Date(seconds * 1000).toISOString()
          : null;

        let result: Awaited<ReturnType<IngestRpc>>;

        try {
          result = await ingest({
            p_phone_number_id: phoneNumberId,
            p_waba_id: wabaId,
            p_wa_message_id: message.id ?? null,
            p_telefone: phone,
            // Sem ctwa_clid a RPC apenas registra o webhook e não cria lead.
            p_ctwa_clid: referral?.ctwa_clid ?? null,
            p_nome: contact?.profile?.name ?? null,
            p_ad_source_id: referral?.source_id ?? null,
            p_ad_source_url: referral?.source_url ?? null,
            p_ad_source_type: referral?.source_type ?? null,
            p_event_time: eventTime,
          });
        } catch (error) {
          result = {
            data: null,
            error: { message: error instanceof Error ? error.message : "falha de rede" },
          };
        }

        if (result.error) {
          // Mensagem do erro e identificadores do item; nunca o corpo do
          // webhook, o telefone do lead nem credenciais.
          logError("[conversoes/webhook] ingestão recusada", {
            message: result.error.message,
            wa_message_id: message.id ?? null,
            phone_number_id: phoneNumberId,
          });
          outcome.failed += 1;
          continue;
        }

        outcome.processed += 1;
        const row = (Array.isArray(result.data) ? result.data[0] : result.data) as
          | { novo?: boolean }
          | null
          | undefined;

        if (row?.novo) {
          outcome.createdLead = true;
        }
      }
    }
  }

  return outcome;
}

// O que a rota faz com o resultado do lote.
//   dispatch  lead novo gravado: o envio é tentado já, mesmo que outra
//             mensagem do mesmo payload tenha falhado;
//   status    500 se qualquer gravação falhou (a Meta reentrega o payload; o
//             que já entrou não duplica), 200 se todas foram gravadas.
export function planWebhookResponse(outcome: IngestOutcome): {
  status: 200 | 500;
  dispatch: boolean;
} {
  return {
    status: outcome.failed > 0 ? 500 : 200,
    dispatch: outcome.createdLead,
  };
}
