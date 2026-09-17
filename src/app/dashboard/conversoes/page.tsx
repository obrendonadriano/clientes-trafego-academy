import { Suspense } from "react";
import { redirect } from "next/navigation";
import { ConversionsPage } from "@/components/conversions/conversions-page";
import { ListSkeleton } from "@/components/dashboard/skeletons";
import { PageHeader } from "@/components/shell/page-header";
import { getCurrentUser } from "@/lib/auth/session";
import { getConversionLeads } from "@/lib/data/conversions";
import {
  PERIOD_OPTIONS,
  QUALIFICATION_TABS,
  type PeriodOption,
  type QualificationTab,
} from "@/lib/conversions/shared";
import { getAppShellData } from "@/lib/data/queries";

type ConversionsRouteProps = {
  searchParams: Promise<{
    aba?: string;
    periodo?: string;
    cliente?: string;
    pagina?: string;
  }>;
};

async function ConversionsSection({
  searchParams,
}: {
  searchParams: ConversionsRouteProps["searchParams"];
}) {
  const params = await searchParams;
  const user = await getCurrentUser();

  // Conversoes e area administrativa. O cliente acompanha os leads da IA
  // em Atendimento IA, e a conexao do WhatsApp mora la tambem.
  if (user.role === "client") {
    redirect("/dashboard/atendimento-ia");
  }

  const tab = (QUALIFICATION_TABS.some((t) => t.key === params.aba)
    ? params.aba
    : "pendente") as QualificationTab;
  const period = (PERIOD_OPTIONS.some((p) => p.key === params.periodo)
    ? params.periodo
    : "30") as PeriodOption;
  const clientId = params.cliente ?? null;

  const [data, shell] = await Promise.all([
    getConversionLeads(user, {
      tab,
      period,
      clientId,
      page: Number(params.pagina) || 1,
    }),
    getAppShellData(user),
  ]);

  return (
    <ConversionsPage
      data={data}
      tab={tab}
      period={period}
      isAdmin
      clients={shell.clients}
      selectedClientId={clientId}
    />
  );
}

export default function ConversionsRoute({
  searchParams,
}: ConversionsRouteProps) {
  return (
    <div className="flex min-w-0 flex-col gap-5">
      <PageHeader
        eyebrow="Área do cliente"
        title="Conversões"
        description="Os leads que chegaram das suas campanhas. Marque quais foram bons para o Meta buscar mais pessoas parecidas."
      />

      <Suspense fallback={<ListSkeleton />}>
        <ConversionsSection searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
