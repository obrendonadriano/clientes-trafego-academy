import { dispatchConversionEvents } from "@/lib/conversions/dispatcher";
import { safeEqualHex } from "@/lib/meta/secret-box";

// Drenagem periódica da fila de conversões. Substitui o agendamento do n8n.
//
// Protegida pela mesma chave já usada por /api/sync-meta, para não inventar um
// segredo novo. Agende em qualquer cron (Vercel Cron, GitHub Actions, cron do
// servidor) — a reserva atômica no banco garante que execuções sobrepostas não
// enviem o mesmo evento duas vezes.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(request: Request) {
  const expected = process.env.SYNC_SECRET_KEY?.trim();

  if (!expected) {
    return false;
  }

  const header =
    request.headers.get("x-sync-key") ??
    (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");

  return safeEqualHex(header, expected);
}

async function run(request: Request) {
  if (!authorized(request)) {
    return Response.json({ error: "não autorizado" }, { status: 401 });
  }

  const summary = await dispatchConversionEvents(50);
  return Response.json(summary);
}

export async function POST(request: Request) {
  return run(request);
}

// Alguns agendadores só fazem GET.
export async function GET(request: Request) {
  return run(request);
}
