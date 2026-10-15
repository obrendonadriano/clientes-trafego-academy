import "server-only";

import { getClientSegment } from "@/lib/ai-agent/store";
import { AI_WEBHOOK_PATH, appUrl } from "@/lib/app-url";
import { hasAiAttendanceSegment } from "@/lib/segments";
import { getWahaConfig, wahaFetchJson, WahaRequestError } from "@/lib/waha";
import { buildWahaSessionPayload } from "@/lib/waha-session-config";
import { listWhatsappSessionRecords } from "@/lib/whatsapp-server";

/**
 * Reaplica os webhooks em todas as sessões do WAHA, sem o cliente precisar
 * clicar em conectar. É a mesma configuração do /whatsapp/conectar: tira o
 * Atendimento IA do n8n e aponta para o site. O WAHA reinicia a sessão ao
 * receber a configuração nova, sem pedir QR de novo.
 */
export async function refreshAllWahaWebhooks(origin: string) {
  const config = await getWahaConfig();
  const sessions = await listWhatsappSessionRecords();
  const result = { updated: 0, missing: 0, failed: 0 };

  for (const session of sessions) {
    if (!session.session_name) continue;
    const path = `/api/sessions/${encodeURIComponent(session.session_name)}`;

    try {
      await wahaFetchJson(config, path, { method: "GET" });
    } catch (error) {
      if (error instanceof WahaRequestError && error.status === 404) {
        // Sessão só existe no banco: recebe a configuração ao conectar.
        result.missing += 1;
      } else {
        result.failed += 1;
      }
      continue;
    }

    try {
      const aiWebhookUrl = hasAiAttendanceSegment(
        await getClientSegment(session.client_id),
      )
        ? appUrl(origin, AI_WEBHOOK_PATH)
        : null;

      await wahaFetchJson(config, path, {
        method: "PUT",
        body: JSON.stringify(
          buildWahaSessionPayload({
            sessionName: session.session_name,
            webhookSecret: config.webhookSecret,
            statusWebhookUrl: appUrl(origin, "/whatsapp/webhook"),
            leadsWebhookUrl: config.leadsWebhookUrl,
            aiWebhookUrl,
          }),
        ),
      });
      result.updated += 1;
    } catch {
      result.failed += 1;
    }
  }

  return result;
}
