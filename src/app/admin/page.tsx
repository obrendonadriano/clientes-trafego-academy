import { AdminHomePage } from "@/components/dashboard/admin-home-page";
import { DashboardShell } from "@/components/dashboard/shell";
import { getCurrentUser } from "@/lib/auth/session";
import { getAdminViewData } from "@/lib/data/queries";

export default async function AdminPage() {
  const user = await getCurrentUser();
  const data = await getAdminViewData();

  return (
    <DashboardShell
      user={user}
      title="Dashboard geral"
      subtitle="Visão executiva da operação, com atalhos para clientes, campanhas e relatórios."
    >
      <AdminHomePage
        clientCount={data.clients.length}
        campaignCount={data.campaigns.length}
        clientUserCount={data.clientUsers.length}
        permissionCount={data.permissions.length}
        activeClientCount={data.clients.filter((client) => client.active).length}
        activeCampaignCount={
          data.campaigns.filter((campaign) => campaign.status === "Ativa").length
        }
        metricRows={data.metricRows}
      />
    </DashboardShell>
  );
}
