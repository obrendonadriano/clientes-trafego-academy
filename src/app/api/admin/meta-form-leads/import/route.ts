import { z } from "zod";
import { getOptionalCurrentUser } from "@/lib/auth/session";
import { parseMetaLeadsCsv } from "@/lib/leads-export/meta-csv";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Importação do CSV de leads de formulário baixado do Gerenciador de Anúncios.
//
// O admin escolhe o cliente e sobe o arquivo (UTF-16, TAB). A gravação passa
// pela RPC admin_import_meta_form_leads com a SESSÃO do usuário: a checagem de
// admin acontece no banco. Lead já importado (mesmo ID) não duplica.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_BYTES = 15 * 1024 * 1024;
const CHUNK = 500;

export async function POST(request: Request) {
  const user = await getOptionalCurrentUser();
  if (!user || user.role !== "admin" || !user.active) {
    return Response.json({ error: "Apenas administradores." }, { status: 403 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "Envie o arquivo pelo formulário." }, { status: 400 });
  }

  const clientId = z.string().uuid().safeParse(form.get("clientId"));
  if (!clientId.success) {
    return Response.json({ error: "Escolha o cliente." }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return Response.json({ error: "Escolha o arquivo CSV." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return Response.json({ error: "Arquivo maior que 15 MB." }, { status: 413 });
  }

  const parsed = parseMetaLeadsCsv(new Uint8Array(await file.arrayBuffer()));
  if (!parsed.rows.length) {
    return Response.json(
      {
        error:
          "Nenhum lead encontrado. Use o CSV baixado do Gerenciador de Anúncios (colunas id e created_time).",
        rejected: parsed.rejected.slice(0, 20),
      },
      { status: 400 },
    );
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return Response.json({ error: "Serviço indisponível." }, { status: 503 });
  }

  let inserted = 0;
  let skipped = 0;
  for (let index = 0; index < parsed.rows.length; index += CHUNK) {
    const { data, error } = await supabase.rpc("admin_import_meta_form_leads", {
      p_client_id: clientId.data,
      p_rows: parsed.rows.slice(index, index + CHUNK),
    });
    if (error) {
      const forbidden = error.code === "42501";
      console.error("[meta-form-leads] import_failed", { code: error.code ?? null });
      return Response.json(
        {
          error: forbidden
            ? "Apenas administradores."
            : "Falha ao gravar os leads. Confira se a migração 20261021120000 foi aplicada.",
          inserted,
          skipped,
        },
        { status: forbidden ? 403 : 500 },
      );
    }
    const result = (data ?? {}) as { inserted?: number; skipped?: number };
    inserted += Number(result.inserted ?? 0);
    skipped += Number(result.skipped ?? 0);
  }

  return Response.json({
    inserted,
    // Já existiam (mesmo ID de lead): não foram duplicados.
    skipped,
    rejected: parsed.rejected.length,
    rejectedSample: parsed.rejected.slice(0, 20),
    questions: parsed.questions,
  });
}
