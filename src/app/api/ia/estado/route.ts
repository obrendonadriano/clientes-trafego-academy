import { NextResponse } from "next/server";
import { getOptionalCurrentUser } from "@/lib/auth/session";
import { getAiLiveFingerprint, getClientAiAccess } from "@/lib/ai-agent/store";
import { toAiAccessState, type AiAccessState } from "@/lib/ai-agent/shared";
import { isSupabaseAdminConfigured } from "@/lib/env";

export type AiLiveStateResponse = {
  access: AiAccessState;
  fingerprint: string | null;
};

const NO_STORE = { "Cache-Control": "private, no-store" };

/**
 * Estado atual do Atendimento IA do cliente logado: acesso (mesma regra da
 * página e das actions) e a impressão digital dos dados. A tela consulta
 * isto em intervalos e ao voltar para a aba; só recarrega se algo mudou.
 * Sessão é validada aqui — a resposta nunca carrega dado de outra conta.
 */
export async function GET() {
  const user = await getOptionalCurrentUser();

  if (!user || user.role !== "client" || !user.active) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: NO_STORE });
  }

  if (!user.clientId || !isSupabaseAdminConfigured()) {
    return NextResponse.json(
      { access: "not_configured", fingerprint: null } satisfies AiLiveStateResponse,
      { headers: NO_STORE },
    );
  }

  try {
    const access = toAiAccessState((await getClientAiAccess(user.clientId)).decision);
    const fingerprint =
      access === "allowed" ? await getAiLiveFingerprint(user.clientId) : null;

    return NextResponse.json({ access, fingerprint } satisfies AiLiveStateResponse, {
      headers: NO_STORE,
    });
  } catch {
    // 503: a tela mantém o que já mostra e tenta de novo depois.
    return NextResponse.json({ error: "unavailable" }, { status: 503, headers: NO_STORE });
  }
}
