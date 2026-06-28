import { Suspense } from "react";
import { ClientCampaignsPage } from "@/components/dashboard/client-campaigns-page";
import { DashboardShell } from "@/components/dashboard/shell";
import { FilterBarSkeleton, TableSkeleton } from "@/components/dashboard/skeletons";
import { getCurrentUser } from "@/lib/auth/session";
import { resolveMetricsWindow } from "@/lib/data/date-range";
import { getClientPortalData } from "@/lib/data/queries";
import type { User } from "@/lib/types";

type DashboardCampaignsPageProps = {
  searchParams: Promise<{ start?: string; end?: string }>;
};

async function CampaignsSection({
  user,
  searchParams,
}: {
  user: User;
  searchParams: DashboardCampaignsPageProps["searchParams"];
}) {
  const window = resolveMetricsWindow(user.role, await searchParams);
  const data = await getClientPortalData(user, window);

  return (
    <ClientCampaignsPage
      campaigns={data.campaigns}
      metricRows={data.metricRows}
      syncStatus={data.syncStatus}
    />
  );
}

export default async function DashboardCampaignsPage({
  searchParams,
}: DashboardCampaignsPageProps) {
  const user = await getCurrentUser();

  return (
    <DashboardShell
      user={user}
      title={`Campanhas de ${user.clientName ?? user.name}`}
      subtitle="Tabela dedicada para acompanhar somente as campanhas liberadas para esta conta."
    >
      <Suspense
        fallback={
          <div className="space-y-6">
            <FilterBarSkeleton />
            <TableSkeleton />
          </div>
        }
      >
        <CampaignsSection user={user} searchParams={searchParams} />
      </Suspense>
    </DashboardShell>
  );
}
