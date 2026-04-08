import { AdminClientsPage } from "@/components/dashboard/admin-clients-page";
import { DashboardShell } from "@/components/dashboard/shell";
import { getCurrentUser } from "@/lib/auth/session";
import { getAdminViewData } from "@/lib/data/queries";

export default async function AdminClientsRoute() {
  const user = await getCurrentUser();
  const data = await getAdminViewData();

  return (
    <DashboardShell
      user={user}
      title="Clientes"
      subtitle="Cadastre clientes, acesso ao portal e campanhas permitidas em um único fluxo."
    >
      <AdminClientsPage
        clients={data.clients}
        campaigns={data.campaigns}
        permissions={data.permissions}
        clientUsers={data.clientUsers}
        metricRows={data.metricRows}
      />
    </DashboardShell>
  );
}
