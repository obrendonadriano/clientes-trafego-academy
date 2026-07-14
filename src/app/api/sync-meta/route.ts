import { NextRequest, NextResponse } from "next/server";
import { importAllMetaCampaigns, runMetaSync } from "@/lib/sync/meta-sync";

// Rota "botão apertável por API": executa exatamente o mesmo código dos botões
// "Importar campanhas" e "Importar métricas" da página /admin/campanhas, na
// mesma ordem, aguardando concluir. Sobrevive a qualquer deploy (é código do
// projeto) e não depende de cookie/sessão — protegida por chave secreta.
export const dynamic = "force-dynamic";
// A importação completa pode passar de 1 minuto em contas grandes.
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const secret = process.env.SYNC_SECRET_KEY;

  if (!secret || request.headers.get("x-sync-key") !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    // 1) Botão "Importar campanhas"
    await importAllMetaCampaigns();
    // 2) Botão "Importar métricas" (também reimporta campanhas, idempotente)
    await runMetaSync();

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Falha inesperada ao sincronizar a Meta Ads.",
      },
      { status: 500 },
    );
  }
}
