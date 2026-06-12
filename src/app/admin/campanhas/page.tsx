import { Suspense } from "react";
import { AdminCampaignsPage } from "@/components/dashboard/admin-campaigns-page";
import { DashboardShell } from "@/components/dashboard/shell";
import { PageSectionSkeleton } from "@/components/dashboard/skeletons";
import { getCurrentUser } from "@/lib/auth/session";
import { resolveMetricsWindow } from "@/lib/data/date-range";
import { getAdminCampaignsData } from "@/lib/data/queries";

type AdminCampaignsRouteProps = {
  searchParams: Promise<{ start?: string; end?: string }>;
};

async function AdminCampaignsSection({
  searchParams,
}: {
  searchParams: AdminCampaignsRouteProps["searchParams"];
}) {
  const window = resolveMetricsWindow("admin", await searchParams);
  const data = await getAdminCampaignsData(window);

  return (
    <AdminCampaignsPage campaigns={data.campaigns} metricRows={data.metricRows} />
  );
}

export default async function AdminCampaignsRoute({
  searchParams,
}: AdminCampaignsRouteProps) {
  const user = await getCurrentUser();

  return (
    <DashboardShell user={user}>
      <Suspense fallback={<PageSectionSkeleton />}>
        <AdminCampaignsSection searchParams={searchParams} />
      </Suspense>
    </DashboardShell>
  );
}
