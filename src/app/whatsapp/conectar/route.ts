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
    let remoteExists = false;
    const webhookUrl = getWebhookUrl(request);

    function sessionPayload(sessionName: string) {
      const webhooks = [
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
      ];

      if (config.leadsWebhookUrl) {
        webhooks.push({
          url: config.leadsWebhookUrl,
          events: ["message"],
          hmac: { key: config.webhookSecret },
          customHeaders: [
            {
              name: "X-TrafegoAcademy-Secret",
              value: config.webhookSecret,
            },
          ],
          retries: {
            policy: "exponential",
            delaySeconds: 2,
            attempts: 10,
          },
        } as (typeof webhooks)[number] & {
          customHeaders: { name: string; value: string }[];
        });
      }

      return {
        name: sessionName,
        config: {
          metadata: { source: "trafegoacademy" },
          webhooks,
        },
      };
    }

    if (existing?.session_name) {
      try {
        const remote = await wahaFetchJson<WahaSession>(
          config,
          `/api/sessions/${encodeURIComponent(existing.session_name)}`,
          { method: "GET" },
        );
        remoteExists = true;
        const sessionPath = `/api/sessions/${encodeURIComponent(existing.session_name)}`;
        await wahaFetchJson<WahaSession>(config, sessionPath, {
          method: "PUT",
          body: JSON.stringify(sessionPayload(existing.session_name)),
        });
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

    if (!record.session_name) {
      throw new WahaRequestError("Não foi possível gerar o identificador da sessão WAHA.");
    }

    await updateWhatsappSessionRecord(clientId, {
      status: "STARTING",
      ultimo_erro: null,
    });

    const payload = sessionPayload(record.session_name);

    let session: WahaSession;

    if (remoteExists) {
      const sessionPath = `/api/sessions/${encodeURIComponent(record.session_name!)}`;
      await wahaFetchJson<WahaSession>(config, sessionPath, {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      session = await wahaFetchJson<WahaSession>(
        config,
        `${sessionPath}/restart`,
        { method: "POST" },
      );
    } else {
      session = await wahaFetchJson<WahaSession>(config, "/api/sessions", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    }

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
