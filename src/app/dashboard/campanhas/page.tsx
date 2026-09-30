import { Suspense } from "react";
import { ClientCampaignsPage } from "@/components/dashboard/client-campaigns-page";
import { TableSkeleton } from "@/components/dashboard/skeletons";
import { PageHeader } from "@/components/shell/page-header";
import { getCurrentUser } from "@/lib/auth/session";
import { resolveMetricsWindow } from "@/lib/data/date-range";
import { getAdLevelData, type AdLevelData } from "@/lib/data/ad-levels";
import { getCampaignIdsForUser, getClientPortalData } from "@/lib/data/queries";
import type { User } from "@/lib/types";

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
  const authorizedCampaignIds = getCampaignIdsForUser(user).then((ids) => [...ids]);
  const adSets = settleAdLevel(
    authorizedCampaignIds.then((ids) =>
      getAdLevelData("adset", adLevelWindow, null, undefined, ids),
    ),
  );
  const ads = settleAdLevel(
    authorizedCampaignIds.then((ids) =>
      getAdLevelData("ad", adLevelWindow, null, undefined, ids),
    ),
  );
  const data = await getClientPortalData(user, window);

  return (
    <ClientCampaignsPage
      campaigns={data.campaigns}
      metricRows={data.metricRows}
      syncStatus={data.syncStatus}
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
