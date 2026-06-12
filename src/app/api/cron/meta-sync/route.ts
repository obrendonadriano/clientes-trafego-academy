import { NextRequest, NextResponse } from "next/server";
import { runMetaSync } from "@/lib/sync/meta-sync";

export const dynamic = "force-dynamic";
// Sincronização completa (campanhas + métricas) pode passar de 1 minuto em
// contas grandes; estende o limite da function na Vercel.
export const maxDuration = 300;

function isAuthorized(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    return false;
  }

  const authorizationHeader = request.headers.get("authorization");
  return authorizationHeader === `Bearer ${cronSecret}`;
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json(
      { ok: false, error: "Nao autorizado para executar a sincronizacao automatica." },
      { status: 401 },
    );
  }

  try {
    const result = await runMetaSync();

    return NextResponse.json({
      ok: true,
      message: "Sincronizacao automatica concluida com sucesso.",
      ...result,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Falha inesperada na sincronizacao automatica.",
      },
      { status: 500 },
    );
  }
}
