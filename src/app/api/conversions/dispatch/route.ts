import { dispatchConversionEvents } from "@/lib/conversions/dispatcher";
import { authorizeDispatch } from "@/lib/conversions/dispatch-auth";

// Drenagem periódica da fila de conversões. Substitui o agendamento do n8n.
//
// Agendada a cada 5 minutos pelo GitHub Actions
// (.github/workflows/conversions-dispatch.yml), já que o plano Hobby da Vercel
// não aceita esse intervalo. Aceita `Authorization: Bearer <CRON_SECRET>` —
// pronto para a Vercel Cron se o plano mudar — e a SYNC_SECRET_KEY de sempre.
// A reserva atômica no banco garante que execuções sobrepostas não enviem o
// mesmo evento duas vezes.
//
// Com CONVERSIONS_DISPATCHER_ENABLED diferente de "true", a execução volta
// sem tocar na fila: o cron roda, mas nada é reservado nem enviado.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function run(request: Request) {
  if (!authorizeDispatch(request.headers)) {
    return Response.json({ error: "não autorizado" }, { status: 401 });
  }

  const summary = await dispatchConversionEvents(50);
  return Response.json(summary);
}

export async function POST(request: Request) {
  return run(request);
}

// A Vercel Cron (se um dia for usada) chama com GET.
export async function GET(request: Request) {
  return run(request);
}
