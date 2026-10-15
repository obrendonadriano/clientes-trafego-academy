// URL pública do próprio site, usada para registrar webhooks no WAHA e para o
// atendimento por IA chamar a si mesmo. NEXT_PUBLIC_APP_URL tem preferência;
// sem ela (ou se for inválida/insegura), vale a origem real da requisição.
export function appUrl(request: Request | string, path: string) {
  // Aceita a requisição ou, em server actions, a origem já montada.
  const requestOrigin =
    typeof request === "string" ? request : new URL(request.url).origin;
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();

  if (!configured) {
    return new URL(path, requestOrigin).toString();
  }

  try {
    const configuredUrl = new URL(configured);
    const isLoopback =
      configuredUrl.hostname === "localhost" ||
      configuredUrl.hostname === "127.0.0.1";
    const insecureInProduction =
      process.env.NODE_ENV === "production" &&
      configuredUrl.protocol !== "https:";

    if (!isLoopback && !insecureInProduction) {
      return new URL(path, configuredUrl.origin).toString();
    }
  } catch {
    // Configuração inválida: usa a origem real e validada pelo próprio request.
  }

  return new URL(path, requestOrigin).toString();
}

export const AI_WEBHOOK_PATH = "/whatsapp/ia/waha";
