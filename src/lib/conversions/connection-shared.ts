// Estado da conexão oficial, no formato que a interface consome. Sem nada de
// servidor: é importado pelo componente de cliente.
//
// O cliente não precisa entender a arquitetura. Ele vê "Conectado" e
// "Rastreamento ativo"; Dataset, WABA e token ficam no painel administrativo.

export type ConnectionStatus =
  | "not_connected"
  | "onboarding"
  | "whatsapp_connected"
  | "dataset_pending"
  | "active"
  | "attention_required"
  | "disconnected";

export type ClientConnection = {
  status: ConnectionStatus;
  phone: string | null;
  verifiedName: string | null;
  connectedAt: string | null;
  // Coexistence confirmada pela Meta: o número segue no app do celular.
  keepsBusinessApp: boolean | null;
  trackingReady: boolean;
};

export type ConnectionTone = "ok" | "progress" | "warn" | "idle";

export function connectionHeadline(status: ConnectionStatus): {
  label: string;
  tone: ConnectionTone;
} {
  switch (status) {
    case "active":
    case "whatsapp_connected":
    case "dataset_pending":
      return { label: "Conectado", tone: "ok" };
    case "onboarding":
      return { label: "Conectando", tone: "progress" };
    case "attention_required":
      return { label: "Atenção necessária", tone: "warn" };
    case "disconnected":
      return { label: "Desconectado", tone: "idle" };
    default:
      return { label: "Não conectado", tone: "idle" };
  }
}

export function trackingHeadline(connection: ClientConnection): {
  label: string;
  tone: ConnectionTone;
} {
  if (connection.status === "active" && connection.trackingReady) {
    return { label: "Ativo", tone: "ok" };
  }

  if (connection.status === "attention_required") {
    return { label: "Atenção necessária", tone: "warn" };
  }

  if (
    connection.status === "dataset_pending" ||
    connection.status === "whatsapp_connected" ||
    connection.status === "onboarding"
  ) {
    return { label: "Configurando", tone: "progress" };
  }

  return { label: "Inativo", tone: "idle" };
}

export function isConnected(status: ConnectionStatus) {
  return (
    status === "active" ||
    status === "whatsapp_connected" ||
    status === "dataset_pending"
  );
}

// (14) 99999-0000 a partir do formato internacional devolvido pela Meta.
export function formatOfficialPhone(raw: string | null) {
  if (!raw) {
    return null;
  }

  const digits = raw.replace(/\D/g, "");
  const local = digits.length > 11 && digits.startsWith("55")
    ? digits.slice(2)
    : digits;

  if (local.length === 11) {
    return local.replace(/^(\d{2})(\d{5})(\d{4})$/, "($1) $2-$3");
  }

  if (local.length === 10) {
    return local.replace(/^(\d{2})(\d{4})(\d{4})$/, "($1) $2-$3");
  }

  return raw;
}
