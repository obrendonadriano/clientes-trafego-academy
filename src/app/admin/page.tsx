import { Suspense } from "react";
import { AdminHomePage } from "@/components/dashboard/admin-home-page";
import { DashboardShell } from "@/components/dashboard/shell";
import { PageSectionSkeleton } from "@/components/dashboard/skeletons";
import { getCurrentUser } from "@/lib/auth/session";
import { resolveMetricsWindow } from "@/lib/data/date-range";
import { getAdminOverviewData } from "@/lib/data/queries";

type AdminPageProps = {
  searchParams: Promise<{ start?: string; end?: string }>;
};

async function AdminHomeSection({
  searchParams,
}: {
  searchParams: AdminPageProps["searchParams"];
}) {
  const window = resolveMetricsWindow("admin", await searchParams);
  const data = await getAdminOverviewData(window);

  return (
    <AdminHomePage
      clientCount={data.clientCount}
      campaignCount={data.campaignCount}
      clientUserCount={data.clientUserCount}
      permissionCount={data.permissionCount}
      activeClientCount={data.activeClientCount}
      activeCampaignCount={data.activeCampaignCount}
      metricRows={data.metricRows}
    />
  );
}

export default async function AdminPage({ searchParams }: AdminPageProps) {
  const user = await getCurrentUser();

  return (
    <DashboardShell
      user={user}
      title="Dashboard geral"
      subtitle="Visão executiva da operação, com atalhos para clientes, campanhas e relatórios."
    >
      <Suspense fallback={<PageSectionSkeleton />}>
        <AdminHomeSection searchParams={searchParams} />
      </Suspense>
    </DashboardShell>
  );
}
