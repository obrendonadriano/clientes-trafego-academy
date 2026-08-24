import {
  authenticateWhatsappRequest,
  getWhatsappSessionRecord,
  updateWhatsappSessionRecord,
  whatsappErrorResponse,
} from "@/lib/whatsapp-server";
import { getWahaConfig, wahaFetchJson } from "@/lib/waha";

export async function POST(request: Request) {
  try {
    const { clientId } = await authenticateWhatsappRequest(request);
    const config = await getWahaConfig();
    const record = await getWhatsappSessionRecord(clientId);

    if (record?.session_name) {
      await wahaFetchJson<unknown>(
        config,
        `/api/sessions/${encodeURIComponent(record.session_name)}/logout`,
        { method: "POST" },
      );
    }

    if (record) {
      await updateWhatsappSessionRecord(clientId, {
        status: "STOPPED",
        desconectado_em: new Date().toISOString(),
        ultimo_erro: null,
      });
    }

    return Response.json({ status: "STOPPED" });
  } catch (error) {
    return whatsappErrorResponse(error);
  }
}
