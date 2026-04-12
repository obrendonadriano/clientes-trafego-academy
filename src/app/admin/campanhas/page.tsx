import { AdminCampaignsPage } from "@/components/dashboard/admin-campaigns-page";
import { DashboardShell } from "@/components/dashboard/shell";
import { getCurrentUser } from "@/lib/auth/session";
import { getAdminViewData } from "@/lib/data/queries";

export default async function AdminCampaignsRoute() {
  const user = await getCurrentUser();
  const data = await getAdminViewData();

  return (
    <DashboardShell
      user={user}
      title="Campanhas"
      subtitle="Gerencie as campanhas do sistema antes de liberá-las para cada cliente."
    >
      <AdminCampaignsPage
        campaigns={data.campaigns}
        metricRows={data.metricRows}
      />
    </DashboardShell>
  );
}
