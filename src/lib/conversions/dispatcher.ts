import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { graphUrl } from "@/lib/meta/conversions-config";
import { openSecret } from "@/lib/meta/secret-box";
import {
  buildRequestBody,
  PayloadRejected,
  readMetaOutcome,
  type QueueRow,
} from "@/lib/conversions/capi-payload";

// Worker da fila de conversões. Substitui o workflow do n8n.
//
// A reserva atômica continua no banco (`capi_fetch_queue` usa SKIP LOCKED), o
// que impede dois processos de enviarem o mesmo evento. Aqui só resta buscar,
// montar, enviar uma vez e gravar o resultado.
//
// Nunca reenviar um evento já confirmado, nunca rejuvenescer `event_time` e
// nunca tratar timeout como falha limpa: tudo isso é decidido no SQL e em
// `readMetaOutcome`.

const SEND_TIMEOUT_MS = 20_000;

// Interruptor de ativação. O envio à Meta fica DESLIGADO até que alguém ligue
// explicitamente, para que a migração possa ser aplicada e a aplicação possa
// ser publicada em staging sem que um único evento saia para produção.
//
// Enquanto está desligado, os eventos continuam sendo acumulados na fila com
// as datas originais — nada é perdido, só não é enviado.
export function isDispatcherEnabled() {
  return process.env.CONVERSIONS_DISPATCHER_ENABLED?.trim() === "true";
}

export type DispatchSummary = {
  claimed: number;
  sent: number;
  failed: number;
  skipped: number;
  notice?: string;
};

async function sendEvent(row: QueueRow, accessToken: string) {
  let status: number | null = null;
  let body: unknown = null;

  try {
    const response = await fetch(
      graphUrl(`/${encodeURIComponent(row.dataset_id as string)}/events`),
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(buildRequestBody(row)),
        cache: "no-store",
        signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
      },
    );

    status = response.status;
    const text = await response.text();

    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = null;
    }
  } catch (error) {
    return readMetaOutcome({
      networkError:
        error instanceof Error && error.name === "TimeoutError"
          ? "tempo esgotado"
          : "falha de rede",
    });
  }

  return readMetaOutcome({ status, body });
}

export async function dispatchConversionEvents(
  limit = 25,
): Promise<DispatchSummary> {
  const admin = createSupabaseAdminClient();
  const summary: DispatchSummary = { claimed: 0, sent: 0, failed: 0, skipped: 0 };

  if (!isDispatcherEnabled()) {
    return {
      ...summary,
      notice:
        "Envio desligado (CONVERSIONS_DISPATCHER_ENABLED). A fila continua acumulando com as datas originais.",
    };
  }

  if (!admin) {
    return { ...summary, notice: "Supabase de serviço não configurado." };
  }

  const { data, error } = await admin.rpc("capi_fetch_queue", {
    p_limit: Math.max(1, Math.min(limit, 50)),
  });

  if (error) {
    return { ...summary, notice: error.message };
  }

  const rows = (data as QueueRow[] | null) ?? [];
  summary.claimed = rows.length;

  // Sequencial de propósito: a reserva é por evento e um lote paralelo grande
  // só aproxima o limite de requisições da Meta sem ganho real.
  for (const row of rows) {
    let outcome: { ok: boolean; retryable: boolean; response: string };
    let rejectedBeforeSending = false;

    try {
      if (!row.access_token) {
        throw new PayloadRejected("Cliente sem credencial da Meta.");
      }

      const token = openSecret(row.access_token);
      outcome = await sendEvent(row, token);
    } catch (error) {
      // Payload inválido e credencial ilegível são definitivos: insistir não
      // resolve e só gastaria tentativas.
      rejectedBeforeSending = true;
      outcome = {
        ok: false,
        retryable: false,
        response:
          error instanceof Error
            ? error.message.slice(0, 500)
            : "Evento não pôde ser montado.",
      };
    }

    if (outcome.ok) {
      summary.sent += 1;
    } else if (rejectedBeforeSending) {
      summary.skipped += 1;
    } else {
      summary.failed += 1;
    }

    const { error: markError } = await admin.rpc("capi_mark_result", {
      p_lead_id: row.lead_id,
      p_event_id: row.event_id,
      p_ok: outcome.ok,
      p_resposta: outcome.response,
      p_retryable: outcome.retryable,
    });

    if (markError) {
      // A reserva vence sozinha em 30 minutos e vira conciliação manual. É o
      // comportamento correto: não sabemos se a Meta recebeu.
      summary.notice = markError.message;
      break;
    }
  }

  return summary;
}

// Dispara a fila sem bloquear a resposta ao usuário. Usada depois de mover um
// cartão no Kanban e depois de um lead novo chegar pelo webhook.
export async function dispatchQuietly(limit = 10) {
  try {
    return await dispatchConversionEvents(limit);
  } catch (error) {
    console.error("[conversoes] falha ao drenar a fila", {
      message: error instanceof Error ? error.message : "erro desconhecido",
    });
    return null;
  }
}
