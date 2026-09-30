import { Suspense } from "react";
import { AdminCampaignsPage } from "@/components/dashboard/admin-campaigns-page";
import { PageSectionSkeleton } from "@/components/dashboard/skeletons";
import { resolveMetricsWindow } from "@/lib/data/date-range";
import { getAdLevelData, type AdLevelData } from "@/lib/data/ad-levels";
import { getAdminCampaignsData } from "@/lib/data/queries";

// Conjuntos/anúncios não seguram a página: começam junto com as campanhas e
// são entregues por streaming. Uma falha vira aviso na aba, nunca erro solto.
function settleAdLevel(promise: Promise<AdLevelData>): Promise<AdLevelData> {
  return promise.catch((error: unknown) => {
    console.error("[campanhas] falha ao ler conjuntos/anúncios", error);
    return {
      rows: [],
      notice: "Não foi possível carregar agora. Atualize a página em instantes.",
    };
  });
}

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
  const adSets = settleAdLevel(getAdLevelData("adset", adLevelWindow, params.cliente));
  const ads = settleAdLevel(getAdLevelData("ad", adLevelWindow, params.cliente));
  const data = await getAdminCampaignsData(window, params.cliente);

  return (
    <AdminCampaignsPage
      campaigns={data.campaigns}
      metricRows={data.metricRows}
      adSets={adSets}
      ads={ads}
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
