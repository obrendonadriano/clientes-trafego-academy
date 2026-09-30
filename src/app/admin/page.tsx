import { Suspense } from "react";
import { AdminOverview } from "@/components/dashboard/admin-overview";
import { PageSectionSkeleton } from "@/components/dashboard/skeletons";
import { PageHeader } from "@/components/shell/page-header";
import { resolveMetricsWindow } from "@/lib/data/date-range";
import { getAdminOverviewData } from "@/lib/data/queries";

type AdminPageProps = {
  searchParams: Promise<{ start?: string; end?: string; cliente?: string }>;
};

async function AdminHomeSection({
  searchParams,
}: {
  searchParams: AdminPageProps["searchParams"];
}) {
  const params = await searchParams;
  const window = resolveMetricsWindow("admin", params);
  const data = await getAdminOverviewData(window, params.cliente);

  return (
    <AdminOverview
      view="geral"
      metricRows={data.metricRows}
      counts={{
        clientCount: data.clientCount,
        activeClientCount: data.activeClientCount,
        campaignCount: data.campaignCount,
        activeCampaignCount: data.activeCampaignCount,
      }}
    />
  );
}

export default function AdminPage({ searchParams }: AdminPageProps) {
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader
        title="Dashboard geral"
        description="Acompanhe o desempenho de todos os clientes e campanhas da Tráfego Academy."
      />

      <Suspense fallback={<PageSectionSkeleton />}>
        <AdminHomeSection searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
