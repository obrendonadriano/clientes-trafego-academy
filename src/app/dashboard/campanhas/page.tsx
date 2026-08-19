import { Suspense } from "react";
import { ClientCampaignsPage } from "@/components/dashboard/client-campaigns-page";
import { TableSkeleton } from "@/components/dashboard/skeletons";
import { PageHeader } from "@/components/shell/page-header";
import { getCurrentUser } from "@/lib/auth/session";
import { resolveMetricsWindow } from "@/lib/data/date-range";
import { getAdLevelData } from "@/lib/data/ad-levels";
import { getCampaignIdsForUser, getClientPortalData } from "@/lib/data/queries";
import type { User } from "@/lib/types";

type DashboardCampaignsPageProps = {
  searchParams: Promise<{
    start?: string;
    end?: string;
    nivel?: string;
    periodo?: string;
    comparar?: string;
  }>;
};

async function CampaignsSection({
  user,
  searchParams,
}: {
  user: User;
  searchParams: DashboardCampaignsPageProps["searchParams"];
}) {
  const params = await searchParams;
  const window = resolveMetricsWindow(user.role, params);
  const adLevelWindow = resolveMetricsWindow(user.role, {
    ...params,
    comparar: "nenhum",
  });
  const [data, authorizedCampaignIds] = await Promise.all([
    getClientPortalData(user, window),
    getCampaignIdsForUser(user),
  ]);
  const [adSets, ads] = await Promise.all([
    getAdLevelData("adset", adLevelWindow, null, undefined, [...authorizedCampaignIds]),
    getAdLevelData("ad", adLevelWindow, null, undefined, [...authorizedCampaignIds]),
  ]);

  return (
    <ClientCampaignsPage
      campaigns={data.campaigns}
      metricRows={data.metricRows}
      syncStatus={data.syncStatus}
      adSets={adSets.rows}
      adSetsNotice={adSets.notice}
      ads={ads.rows}
      adsNotice={ads.notice}
      initialLevel={
        params.nivel === "adset" || params.nivel === "ad"
          ? params.nivel
          : "campaign"
      }
    />
  );
}

export default async function DashboardCampaignsPage({
  searchParams,
}: DashboardCampaignsPageProps) {
  const user = await getCurrentUser();

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <PageHeader
        eyebrow="Área do cliente"
        title={`Campanhas de ${user.clientName ?? user.name}`}
        description="Tabela dedicada para acompanhar somente as campanhas liberadas para esta conta."
      />

      <Suspense fallback={<TableSkeleton />}>
        <CampaignsSection user={user} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
