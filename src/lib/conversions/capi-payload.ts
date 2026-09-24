// Montagem do corpo enviado à Conversions API e leitura da resposta da Meta.
//
// Este arquivo é propositalmente sem dependências: os testes o executam direto
// no Node, sem bundler, e ele não pode tocar em banco, rede ou `server-only`.
//
// Regras que o negócio impõe e que o código precisa garantir:
//   - LeadSubmitted e QualifiedLead pertencem ao contexto de Business Messaging
//     e viajam com o ctwa_clid original e o WABA. Custom events não são aceitos
//     nesse canal, então a lista de eventos é fechada.
//   - VehicleAcquired é a aquisição fechada por contrato, fora da conversa:
//     action_source "other" e correspondência por telefone em SHA-256.
//   - O valor pago pelo veículo é custo de aquisição. Ele nunca vira `value`,
//     receita ou custom_data. Dívida, parcelas, placa, condição financeira e
//     observações internas jamais entram no payload.

// Allowlist estrita. A CAPI de Business Messaging aceita uma lista fechada de
// eventos e NÃO aceita evento personalizado; Purchase está nessa lista oficial.
// VehicleAcquired é personalizado e por isso só existe fora desse canal.
export const MESSAGING_EVENTS = [
  "LeadSubmitted",
  "QualifiedLead",
  "Purchase",
] as const;
export const OFFLINE_EVENTS = ["VehicleAcquired"] as const;

// Só o fechamento de quem VENDE carrega dinheiro. O custo de aquisição de um
// veículo nunca vira receita, então nenhum outro evento aceita custom_data.
const EVENTS_WITH_VALUE = ["Purchase"] as const;

// Identifica a integração para a Meta, como a documentação recomenda.
export const PARTNER_AGENT = "trafegoacademy-dashboard";

export type QueueRow = {
  lead_id: string;
  dataset_id: string | null;
  waba_id: string | null;
  access_token: string | null;
  event_name: string;
  event_id: string;
  event_time: number | string;
  action_source: string;
  user_data: Record<string, unknown> | null;
  custom_data?: Record<string, unknown> | null;
  tentativas?: number;
  credential_source?: string | null;
};

export type ServerEvent = {
  event_name: string;
  event_time: number;
  event_id: string;
  action_source: string;
  messaging_channel?: string;
  user_data: Record<string, unknown>;
  custom_data?: { currency: string; value: number };
};

export class PayloadRejected extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PayloadRejected";
  }
}

const SHA256_HEX = /^[a-f0-9]{64}$/;

export function buildServerEvent(row: QueueRow): ServerEvent {
  const messaging = row.action_source === "business_messaging";
  const eventTime = Number(row.event_time);

  if (!Number.isSafeInteger(eventTime) || eventTime <= 0) {
    throw new PayloadRejected(
      `Evento ${row.event_id} sem horário válido. A data original nunca é substituída por agora.`,
    );
  }

  const allowed = messaging
    ? (MESSAGING_EVENTS as readonly string[]).includes(row.event_name)
    : row.action_source === "other" &&
      (OFFLINE_EVENTS as readonly string[]).includes(row.event_name);

  if (!allowed) {
    throw new PayloadRejected(
      `Evento ${row.event_name} não é válido para action_source ${row.action_source}.`,
    );
  }

  if (!row.dataset_id) {
    throw new PayloadRejected(
      `Evento ${row.event_id} sem Dataset: o cliente ainda não concluiu a configuração.`,
    );
  }

  const source = row.user_data ?? {};

  if (messaging) {
    const clickId = source.ctwa_clid;
    const waba = source.whatsapp_business_account_id;

    if (typeof clickId !== "string" || !clickId) {
      throw new PayloadRejected(
        `Evento ${row.event_id} sem ctwa_clid: não há vínculo com um anúncio.`,
      );
    }

    if (typeof waba !== "string" || !waba) {
      throw new PayloadRejected(`Evento ${row.event_id} sem WABA de origem.`);
    }

    const event: ServerEvent = {
      event_name: row.event_name,
      event_time: eventTime,
      event_id: row.event_id,
      action_source: "business_messaging",
      messaging_channel: "whatsapp",
      // Só os identificadores do anúncio. Nada do CRM viaja junto.
      user_data: { ctwa_clid: clickId, whatsapp_business_account_id: waba },
    };

    if ((EVENTS_WITH_VALUE as readonly string[]).includes(row.event_name)) {
      const custom = row.custom_data ?? {};
      const value = Number(custom.value);
      const currency = String(custom.currency ?? "");

      if (!Number.isFinite(value) || value <= 0) {
        throw new PayloadRejected(
          `Evento ${row.event_id} sem valor de venda válido.`,
        );
      }

      if (!/^[A-Z]{3}$/.test(currency)) {
        throw new PayloadRejected(`Evento ${row.event_id} sem moeda válida.`);
      }

      event.custom_data = { currency, value };
    }

    return event;
  }

  const hashes = source.ph;

  if (
    !Array.isArray(hashes) ||
    hashes.length === 0 ||
    !hashes.every((hash) => typeof hash === "string" && SHA256_HEX.test(hash))
  ) {
    throw new PayloadRejected(
      `Evento ${row.event_id} sem telefone em SHA-256 para correspondência.`,
    );
  }

  // Aquisição de veículo: nenhum valor acompanha o evento, em nenhuma hipótese.
  return {
    event_name: row.event_name,
    event_time: eventTime,
    event_id: row.event_id,
    action_source: "other",
    user_data: { ph: hashes },
  };
}

// `partner_agent` fica no nível superior do corpo, ao lado de `data`, como o
// exemplo oficial da Conversions API para Business Messaging mostra.
export function buildRequestBody(row: QueueRow) {
  return { data: [buildServerEvent(row)], partner_agent: PARTNER_AGENT };
}

export type MetaOutcome = {
  ok: boolean;
  retryable: boolean;
  response: string;
};

// Só é sucesso quando a Meta acusa o recebimento. Uma resposta ambígua (falha
// de rede, timeout, corpo ilegível) NUNCA é retentável automaticamente: a
// deduplicação de Business Messaging é responsabilidade da integração, e
// reenviar às cegas duplicaria a conversão.
export function readMetaOutcome(input: {
  status?: number | null;
  body?: unknown;
  networkError?: string | null;
}): MetaOutcome {
  if (input.networkError) {
    return {
      ok: false,
      retryable: false,
      response: `Envio sem confirmação (${input.networkError}). Conferir no Gerenciador de Eventos antes de reenviar.`,
    };
  }

  const status = input.status ?? 0;
  const body = (input.body ?? {}) as {
    events_received?: number;
    error?: { message?: string; code?: number; is_transient?: boolean };
  };

  if (status >= 200 && status < 300) {
    if (Number(body.events_received) >= 1) {
      return { ok: true, retryable: false, response: "events_received=1" };
    }

    return {
      ok: false,
      retryable: false,
      response: `A Meta respondeu ${status} sem confirmar o recebimento. Conferir no Gerenciador de Eventos.`,
    };
  }

  const code = body.error?.code;
  const message = body.error?.message ?? `HTTP ${status}`;
  // Limite de requisições: a Meta não processou o evento, então repetir é seguro.
  const rateLimited = code === 4 || code === 17 || code === 32 || code === 613;

  if (rateLimited || status === 429) {
    return {
      ok: false,
      retryable: true,
      response: `Limite da Meta atingido: ${message}`.slice(0, 500),
    };
  }

  // 5xx e is_transient são ambíguos: a requisição pode ter sido processada.
  // Vão para conciliação manual em vez de retentativa automática.
  return {
    ok: false,
    retryable: false,
    response: `Recusado pela Meta: ${message}`.slice(0, 500),
  };
}
