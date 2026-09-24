import { Suspense } from "react";
import { ConversionsPage } from "@/components/conversions/conversions-page";
import { WhatsappConnectionExperience } from "@/components/whatsapp/whatsapp-connection-experience";
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

  const tab = (
    QUALIFICATION_TABS.some((t) => t.key === params.aba) ? params.aba : "todos"
  ) as QualificationTab;
  const period = (
    PERIOD_OPTIONS.some((p) => p.key === params.periodo) ? params.periodo : "30"
  ) as PeriodOption;
  const clientId = user.role === "admin" ? (params.cliente ?? null) : null;

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
    <div className="space-y-5">
      {user.role === "client" ? (
        <details
          id="whatsapp"
          className="rounded-2xl border border-border/70 p-4"
        >
          <summary className="cursor-pointer text-sm font-medium">
            Conectar ou gerenciar WhatsApp
          </summary>
          <div className="mt-4">
            <WhatsappConnectionExperience purpose="conversions" />
          </div>
        </details>
      ) : null}
      <ConversionsPage
        data={data}
        tab={tab}
        period={period}
        isAdmin={user.role === "admin"}
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
        eyebrow="Área do cliente"
        title="Conversões"
        description="Acompanhe os contatos das campanhas até a compra do veículo. Arraste cada lead para a etapa correspondente."
      />

      <Suspense fallback={<ListSkeleton />}>
        <ConversionsSection searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
