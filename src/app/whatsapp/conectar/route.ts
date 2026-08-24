import {
  authenticateWhatsappRequest,
  ensureWhatsappSessionRecord,
  getWhatsappSessionRecord,
  updateWhatsappSessionRecord,
  whatsappErrorResponse,
} from "@/lib/whatsapp-server";
import {
  getWahaConfig,
  toWahaSessionStatus,
  wahaFetchJson,
  WahaRequestError,
  type WahaSession,
} from "@/lib/waha";

function getWebhookUrl(request: Request) {
  const requestOrigin = new URL(request.url).origin;
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();

  if (!configured) {
    return new URL("/whatsapp/webhook", requestOrigin).toString();
  }

  try {
    const configuredUrl = new URL(configured);
    const isLoopback =
      configuredUrl.hostname === "localhost" ||
      configuredUrl.hostname === "127.0.0.1";
    const insecureInProduction =
      process.env.NODE_ENV === "production" && configuredUrl.protocol !== "https:";

    if (!isLoopback && !insecureInProduction) {
      return new URL("/whatsapp/webhook", configuredUrl.origin).toString();
    }
  } catch {
    // Configuração inválida: usa a origem real e validada pelo próprio request.
  }

  return new URL("/whatsapp/webhook", requestOrigin).toString();
}

export async function POST(request: Request) {
  let clientId: string | null = null;

  try {
    ({ clientId } = await authenticateWhatsappRequest(request));
    console.info("[whatsapp/conectar] solicitação autenticada");
    const config = await getWahaConfig();
    const existing = await getWhatsappSessionRecord(clientId);
    const currentStatus = toWahaSessionStatus(existing?.status);

    if (
      existing?.session_name &&
      (currentStatus === "STARTING" ||
        currentStatus === "SCAN_QR_CODE" ||
        currentStatus === "WORKING")
    ) {
      try {
        const remote = await wahaFetchJson<WahaSession>(
          config,
          `/api/sessions/${encodeURIComponent(existing.session_name)}`,
          { method: "GET" },
        );
        const remoteStatus = toWahaSessionStatus(remote.status);
        await updateWhatsappSessionRecord(clientId, {
          status: remoteStatus,
          ultimo_erro:
            remoteStatus === "FAILED" ? "A sessão WAHA informou uma falha." : null,
        });

        if (
          remoteStatus === "STARTING" ||
          remoteStatus === "SCAN_QR_CODE" ||
          remoteStatus === "WORKING"
        ) {
          return Response.json({ status: remoteStatus });
        }
      } catch (error) {
        if (!(error instanceof WahaRequestError && error.status === 404)) {
          throw error;
        }
        // A linha existe no banco, mas a sessão ainda não existe no WAHA.
      }
    }

    const record = await ensureWhatsappSessionRecord(clientId);

    await updateWhatsappSessionRecord(clientId, {
      status: "STARTING",
      ultimo_erro: null,
    });

    const webhookUrl = getWebhookUrl(request);
    const session = await wahaFetchJson<WahaSession>(
      config,
      "/api/sessions/start",
      {
        method: "POST",
        body: JSON.stringify({
          name: record.session_name,
          config: {
            metadata: { source: "trafegoacademy" },
            webhooks: [
              {
                url: webhookUrl,
                events: ["session.status"],
                hmac: { key: config.webhookSecret },
                retries: {
                  policy: "exponential",
                  delaySeconds: 2,
                  attempts: 10,
                },
              },
            ],
          },
        }),
      },
    );

    const status = session.status
      ? toWahaSessionStatus(session.status)
      : "STARTING";
    await updateWhatsappSessionRecord(clientId, {
      status,
      ultimo_erro: status === "FAILED" ? "O WAHA não iniciou a sessão." : null,
    });
    console.info("[whatsapp/conectar] WAHA respondeu", { status });

    return Response.json({ status });
  } catch (error) {
    console.error("[whatsapp/conectar] falha", {
      name: error instanceof Error ? error.name : "UnknownError",
      message: error instanceof Error ? error.message : "Erro desconhecido",
    });
    if (clientId) {
      try {
        await updateWhatsappSessionRecord(clientId, {
          status: "FAILED",
          ultimo_erro:
            error instanceof Error ? error.message : "Falha ao iniciar a sessão.",
        });
      } catch {
        // Mantém o erro original da operação.
      }
    }

    return whatsappErrorResponse(error);
  }
}
