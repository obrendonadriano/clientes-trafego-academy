import {
  authenticateWhatsappRequest,
  getWhatsappSessionRecord,
  updateWhatsappSessionRecord,
  WhatsappApiError,
  whatsappErrorResponse,
} from "@/lib/whatsapp-server";
import {
  getWahaConfig,
  toWahaSessionStatus,
  wahaFetchJson,
  wahaPhoneNumber,
  type WahaSession,
} from "@/lib/waha";

type WahaQrResponse = {
  mimetype?: string;
  data?: string;
};

export async function GET(request: Request) {
  try {
    const { clientId } = await authenticateWhatsappRequest(request);
    const config = await getWahaConfig();
    const record = await getWhatsappSessionRecord(clientId);

    if (!record?.session_name) {
      throw new WhatsappApiError(
        "Inicie a conexão antes de solicitar o código QR.",
        409,
      );
    }

    const sessionName = encodeURIComponent(record.session_name);
    const session = await wahaFetchJson<WahaSession>(
      config,
      `/api/sessions/${sessionName}`,
      { method: "GET" },
    );
    const status = toWahaSessionStatus(session.status);
    const now = new Date().toISOString();

    await updateWhatsappSessionRecord(clientId, {
      status,
      phone_number: status === "WORKING" ? wahaPhoneNumber(session) : record.phone_number,
      push_name: status === "WORKING" ? session.me?.pushName ?? null : record.push_name,
      conectado_em: status === "WORKING" ? record.conectado_em ?? now : record.conectado_em,
      desconectado_em: status === "STOPPED" ? now : record.desconectado_em,
      ultimo_erro: status === "FAILED" ? "A sessão WAHA informou uma falha." : null,
    });

    if (status !== "SCAN_QR_CODE") {
      return Response.json({ status });
    }

    const qr = await wahaFetchJson<WahaQrResponse>(
      config,
      `/api/${sessionName}/auth/qr`,
      { method: "GET" },
    );

    if (!qr.data) {
      throw new WhatsappApiError("O código QR ainda não está disponível.", 409);
    }

    const image = qr.data.startsWith("data:image/")
      ? qr.data
      : `data:${qr.mimetype || "image/png"};base64,${qr.data}`;

    return Response.json({ status, qr: image });
  } catch (error) {
    return whatsappErrorResponse(error);
  }
}
