const response = $json;
const context = $('Um lead por vez').item.json;
const status = Number(response.statusCode ?? 0);
const body = response.body ?? response;
const ok = status >= 200 && status < 300 && Number(body.events_received) === 1 && !body.error;
// Only an explicit rejection is safe to retry. A timeout / 5xx might have been
// accepted before the response was lost. Do not blindly duplicate messaging events.
const retryable = !ok && status >= 400 && status < 500 && Boolean(body.error)
  && (status === 429 || body.error.is_transient === true);
return [{ json: {
  lead_id: context.lead_id,
  event_id: context.event_id,
  ok,
  retryable,
  resposta: JSON.stringify({
    status,
    events_received: body.events_received ?? 0,
    code: body.error?.code ?? null,
    error_subcode: body.error?.error_subcode ?? null,
    fbtrace_id: body.fbtrace_id ?? body.error?.fbtrace_id ?? null,
    detail: ok ? 'Evento recebido pela Meta; atribuição ainda depende da Meta.'
      : retryable ? 'Rejeição temporária; nova tentativa agendada.'
      : 'Envio não confirmado. Conferir no Gerenciador de Eventos antes de reenviar.',
  }),
} }];
