import { LeadsExportPanel } from "@/components/admin/leads-export-panel";
import { MetaCsvImportCard } from "@/components/admin/meta-csv-import-card";
import { PageHeader } from "@/components/shell/page-header";
import { getCurrentUser } from "@/lib/auth/session";
import { getSegmentLabel } from "@/lib/segments";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";

// Exportação unificada de leads e importação do CSV de formulários da Meta.
// O layout do admin já barra quem não é admin; a barreira real está nas RPCs
// (auth.uid() em public.users), chamadas com a sessão do usuário.

const NICHES = ["veiculo_quitacao", "veiculo_atrasado"];

export default async function LeadsExportRoute() {
  const user = await getCurrentUser();
  if (user.role !== "admin") redirect("/dashboard");

  const admin = createSupabaseAdminClient();
  const { data } = admin
    ? await admin
        .from("clients")
        .select("id, nome_empresa, segmento")
        .in("segmento", NICHES)
        .order("nome_empresa")
    : { data: [] };

  const clients = ((data as { id: string; nome_empresa: string | null; segmento: string | null }[] | null) ?? []).map(
    (client) => ({
      id: client.id,
      name: client.nome_empresa ?? "Sem nome",
      segment: getSegmentLabel(client.segmento) ?? "",
    }),
  );

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <PageHeader
        eyebrow="Área administrativa"
        title="Exportar leads"
        description="Planilha única com os leads dos clientes de futura quitação e de compra de veículos financiados: Coexistência, WAHA (legado), Atendimento IA e formulários da Meta."
      />
      <LeadsExportPanel clients={clients} />
      <MetaCsvImportCard clients={clients} />
    </div>
  );
}
