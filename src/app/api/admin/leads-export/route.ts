import { z } from "zod";
import { getOptionalCurrentUser } from "@/lib/auth/session";
import {
  ORIGINS,
  buildExportRows,
  exportFileName,
  type UnifiedLeadRecord,
} from "@/lib/leads-export/format";
import { buildLeadsWorkbook } from "@/lib/leads-export/workbook";
import { fetchMetaAdNames, getMetaAdsConfig } from "@/lib/meta-ads";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Exportação unificada de leads (.xlsx), só para admin.
//
// A RPC admin_export_unified_leads é chamada com a SESSÃO do usuário: a
// checagem de admin acontece no banco (auth.uid() do JWT em public.users).
// A checagem daqui é só para responder rápido; não é a barreira.
// Somente leitura: nenhuma tabela de leads é alterada.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const PAGE_SIZE = 1000;
// Teto de segurança: muito acima do volume esperado, evita laço infinito.
const MAX_ROWS = 200_000;

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const bodySchema = z
  .object({
    from: date,
    to: date,
    clientIds: z.array(z.string().uuid()).max(500).nullable(),
    origins: z.array(z.enum(ORIGINS)).max(ORIGINS.length).nullable(),
  })
  .refine((value) => value.from <= value.to, "Período inválido.");

// Brasil sem horário de verão desde 2019: o dia vai de 00:00 a 24:00 (-03:00).
const startOfDay = (day: string) => `${day}T00:00:00-03:00`;
function nextDay(day: string) {
  const next = new Date(`${day}T12:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return startOfDay(next.toISOString().slice(0, 10));
}

export async function POST(request: Request) {
  const user = await getOptionalCurrentUser();
  if (!user || user.role !== "admin" || !user.active) {
    return Response.json({ error: "Apenas administradores." }, { status: 403 });
  }

  let input: z.infer<typeof bodySchema>;
  try {
    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return Response.json(
        { error: parsed.error.issues[0]?.message ?? "Filtros inválidos." },
        { status: 400 },
      );
    }
    input = parsed.data;
  } catch {
    return Response.json({ error: "Requisição inválida." }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return Response.json({ error: "Serviço indisponível." }, { status: 503 });
  }

  // Paginação: busca todas as páginas para não perder leads.
  const records: UnifiedLeadRecord[] = [];
  for (let offset = 0; offset < MAX_ROWS; offset += PAGE_SIZE) {
    const { data, error } = await supabase.rpc("admin_export_unified_leads", {
      p_from: startOfDay(input.from),
      p_to: nextDay(input.to),
      p_client_ids: input.clientIds?.length ? input.clientIds : null,
      p_origins: input.origins?.length ? input.origins : null,
      p_limit: PAGE_SIZE,
      p_offset: offset,
    });

    if (error) {
      const forbidden = error.code === "42501";
      console.error("[leads-export] rpc_failed", { code: error.code ?? null });
      return Response.json(
        {
          error: forbidden
            ? "Apenas administradores."
            : "Não foi possível ler os leads. Confira se a migração 20261021120000 foi aplicada.",
        },
        { status: forbidden ? 403 : 500 },
      );
    }

    const page = (data as UnifiedLeadRecord[] | null) ?? [];
    records.push(...page);
    if (page.length < PAGE_SIZE) break;
  }

  await fillMissingAdNames(records);

  const rows = buildExportRows(records);
  const file = await buildLeadsWorkbook(rows);
  const name = exportFileName(input.from, input.to);

  return new Response(new Uint8Array(file), {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store",
      "X-Leads-Count": String(rows.length),
    },
  });
}

/**
 * Coexistência com referral (ID do anúncio) mas sem nome no cache de
 * métricas: busca na Marketing API e guarda em meta_ad_names para as próximas
 * exportações. Sem token ou com recusa da Meta, as colunas ficam em branco.
 */
async function fillMissingAdNames(records: UnifiedLeadRecord[]) {
  const missing = [
    ...new Set(
      records
        .filter((r) => r.origin === "Coexistência" && r.ad_id && !r.ad_name)
        .map((r) => r.ad_id as string),
    ),
  ];
  if (!missing.length) return;

  const { accessToken } = await getMetaAdsConfig().catch(() => ({ accessToken: "" }));
  if (!accessToken) return;

  const names = await fetchMetaAdNames({ adIds: missing, accessToken });
  if (!names.size) return;

  for (const record of records) {
    const found = record.ad_id ? names.get(record.ad_id) : undefined;
    if (!found || record.ad_name) continue;
    record.ad_name = found.adName;
    record.adset_name = found.adsetName;
    record.campaign_name = found.campaignName;
  }

  const admin = createSupabaseAdminClient();
  if (!admin) return;
  const { error } = await admin.from("meta_ad_names").upsert(
    [...names].map(([adId, value]) => ({
      ad_id: adId,
      ad_name: value.adName,
      adset_name: value.adsetName,
      campaign_name: value.campaignName,
      fetched_at: new Date().toISOString(),
    })),
    { onConflict: "ad_id" },
  );
  if (error) console.warn("[leads-export] ad_names_cache_failed", { code: error.code ?? null });
}
