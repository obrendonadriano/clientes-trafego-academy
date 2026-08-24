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
  type WahaSession,
} from "@/lib/waha";

export async function POST(request: Request) {
  let clientId: string | null = null;

  try {
    ({ clientId } = await authenticateWhatsappRequest(request));
    const config = await getWahaConfig();
    const existing = await getWhatsappSessionRecord(clientId);
    const currentStatus = toWahaSessionStatus(existing?.status);

    if (
      existing?.session_name &&
      (currentStatus === "STARTING" ||
        currentStatus === "SCAN_QR_CODE" ||
        currentStatus === "WORKING")
    ) {
      return Response.json({ status: currentStatus });
    }

    const record = await ensureWhatsappSessionRecord(clientId);

    await updateWhatsappSessionRecord(clientId, {
      status: "STARTING",
      ultimo_erro: null,
    });

    const appOrigin = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
    const webhookUrl = new URL("/whatsapp/webhook", appOrigin).toString();
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

    return Response.json({ status });
  } catch (error) {
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
