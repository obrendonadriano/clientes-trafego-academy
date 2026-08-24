export const WHATSAPP_SESSION_STATUSES = [
  "NAO_CRIADA",
  "STOPPED",
  "STARTING",
  "SCAN_QR_CODE",
  "WORKING",
  "FAILED",
] as const;

export type WhatsappSessionStatus =
  (typeof WHATSAPP_SESSION_STATUSES)[number];

export type WhatsappSession = {
  clientId: string;
  status: WhatsappSessionStatus;
  phoneNumber: string | null;
  pushName: string | null;
  connectedAt: string | null;
  disconnectedAt: string | null;
  lastError: string | null;
};

export type WhatsappSessionRow = {
  client_id: string;
  status: string | null;
  phone_number: string | null;
  push_name: string | null;
  conectado_em: string | null;
  desconectado_em: string | null;
  ultimo_erro: string | null;
};

export const WHATSAPP_SESSION_COLUMNS =
  "client_id, status, phone_number, push_name, conectado_em, desconectado_em, ultimo_erro";

export function isWhatsappSessionStatus(
  value: unknown,
): value is WhatsappSessionStatus {
  return (
    typeof value === "string" &&
    WHATSAPP_SESSION_STATUSES.some((status) => status === value)
  );
}

export function mapWhatsappSessionRow(
  row: WhatsappSessionRow,
): WhatsappSession {
  return {
    clientId: row.client_id,
    status: isWhatsappSessionStatus(row.status) ? row.status : "FAILED",
    phoneNumber: row.phone_number,
    pushName: row.push_name,
    connectedAt: row.conectado_em,
    disconnectedAt: row.desconectado_em,
    lastError: row.ultimo_erro,
  };
}

export function formatWhatsappPhone(phone: string | null | undefined) {
  if (!phone) {
    return null;
  }

  const digits = phone.replace(/\D/g, "");
  const local = digits.length > 11 && digits.startsWith("55")
    ? digits.slice(2)
    : digits;

  if (local.length === 11) {
    return local.replace(/^(\d{2})(\d{5})(\d{4})$/, "($1) $2-$3");
  }

  if (local.length === 10) {
    return local.replace(/^(\d{2})(\d{4})(\d{4})$/, "($1) $2-$3");
  }

  return phone;
}

