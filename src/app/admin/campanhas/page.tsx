import { Suspense } from "react";
import { AdminCampaignsPage } from "@/components/dashboard/admin-campaigns-page";
import { PageSectionSkeleton } from "@/components/dashboard/skeletons";
import { resolveMetricsWindow } from "@/lib/data/date-range";
import { getAdLevelData } from "@/lib/data/ad-levels";
import { getAdminCampaignsData } from "@/lib/data/queries";

type AdminCampaignsRouteProps = {
  searchParams: Promise<{
    start?: string;
    end?: string;
    cliente?: string;
    nivel?: string;
    periodo?: string;
    comparar?: string;
  }>;
};

async function AdminCampaignsSection({
  searchParams,
}: {
  searchParams: AdminCampaignsRouteProps["searchParams"];
}) {
  const params = await searchParams;
  const window = resolveMetricsWindow("admin", params);
  const adLevelWindow = resolveMetricsWindow("admin", {
    ...params,
    comparar: "nenhum",
  });
  const [data, adSets, ads] = await Promise.all([
    getAdminCampaignsData(window, params.cliente),
    getAdLevelData("adset", adLevelWindow, params.cliente),
    getAdLevelData("ad", adLevelWindow, params.cliente),
  ]);

  return (
    <AdminCampaignsPage
      campaigns={data.campaigns}
      metricRows={data.metricRows}
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

export default function AdminCampaignsRoute({
  searchParams,
}: AdminCampaignsRouteProps) {
  return (
    <Suspense fallback={<PageSectionSkeleton />}>
      <AdminCampaignsSection searchParams={searchParams} />
    </Suspense>
  );
}
