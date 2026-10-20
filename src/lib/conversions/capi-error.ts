// Leitura da resposta de erro da Conversions API gravada em capi_resposta.
//
// Existem dois formatos na base: o JSON do workflow legado do n8n
// ({"status":400,"code":190,"error_subcode":null,"fbtrace_id":"...","detail":"..."})
// e o texto do dispatcher do site ("Recusado pela Meta: ..."). Sem
// dependências: roda no navegador e nos testes.

export type CapiErrorDetails = {
  // Explicação curta para quem lê o cartão.
  summary: string;
  httpStatus: number | null;
  code: number | null;
  subcode: number | null;
  fbtraceId: string | null;
  detail: string | null;
  // Texto original quando não é JSON (ou para conferência).
  raw: string;
};

const CODE_HINTS: Record<number, string> = {
  190: "Token de acesso inválido ou expirado.",
  102: "Sessão da Meta expirada.",
  100: "Parâmetro inválido no evento enviado.",
  10: "Permissão negada pela Meta.",
  200: "Permissão negada pela Meta.",
  4: "Limite de chamadas da Meta atingido.",
  17: "Limite de chamadas da Meta atingido.",
  32: "Limite de chamadas da Meta atingido.",
  613: "Limite de chamadas da Meta atingido.",
  1: "Erro temporário da Meta.",
  2: "Erro temporário da Meta.",
};

function hintFor(code: number | null) {
  if (code === null) return null;
  if (CODE_HINTS[code]) return CODE_HINTS[code];
  if (code >= 200 && code <= 299) return "Permissão negada pela Meta.";
  return null;
}

const toNumber = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? value : null;
const toText = (value: unknown) =>
  typeof value === "string" && value.trim() ? value.trim() : null;

export function readCapiError(raw: string | null | undefined): CapiErrorDetails {
  const text = (raw ?? "").trim();
  const empty: CapiErrorDetails = {
    summary: "A Meta não devolveu detalhes do erro.",
    httpStatus: null,
    code: null,
    subcode: null,
    fbtraceId: null,
    detail: null,
    raw: text,
  };
  if (!text) return empty;

  if (text.startsWith("{")) {
    try {
      const data = JSON.parse(text) as Record<string, unknown>;
      const code = toNumber(data.code);
      const detail = toText(data.detail) ?? toText(data.message);
      return {
        summary: hintFor(code) ?? detail ?? "A Meta recusou o evento.",
        httpStatus: toNumber(data.status),
        code,
        subcode: toNumber(data.error_subcode),
        fbtraceId: toText(data.fbtrace_id),
        detail,
        raw: text,
      };
    } catch {
      // Não era JSON válido: segue como texto.
    }
  }

  return { ...empty, summary: text };
}
