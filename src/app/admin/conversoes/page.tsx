import { Suspense } from "react";
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

  const tab = (QUALIFICATION_TABS.some((t) => t.key === params.aba)
    ? params.aba
    : "todos") as QualificationTab;
  const period = (PERIOD_OPTIONS.some((p) => p.key === params.periodo)
    ? params.periodo
    : "30") as PeriodOption;
  const clientId = user.role === "admin" ? (params.cliente ?? null) : null;

  const [data, shell] = await Promise.all([
    getConversionLeads(user, {
      tab,
      period,
      clientId,
      page: Number(params.pagina) || 1,
    }),
    user.role === "admin"
      ? getAppShellData(user)
      : Promise.resolve({
          clients: [],
          campaigns: [],
          syncStatus: null,
          whatsappSession: null,
        }),
  ]);

  return (
    <div className="space-y-5">
      <ConversionsPage
        data={data}
        tab={tab}
        period={period}
        isAdmin
        clients={shell.clients}
        selectedClientId={clientId}
      />
    </div>
  );
}

export default function ConversionsRoute({
  searchParams,
}: ConversionsRouteProps) {
  return (
    <div className="flex min-w-0 flex-col gap-5">
      <PageHeader
        eyebrow="Área administrativa"
        title="Conversões"
        description="Acompanhe a qualificação dos leads e as compras de veículos de cada cliente."
      />

      <Suspense fallback={<ListSkeleton />}>
        <ConversionsSection searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
