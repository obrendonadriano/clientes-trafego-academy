import { AdminSettingsPage } from "@/components/dashboard/admin-settings-page";
import { DashboardShell } from "@/components/dashboard/shell";
import { getCurrentUser } from "@/lib/auth/session";
import { getIntegrationSettings } from "@/lib/data/queries";

export default async function AdminSettingsRoute() {
  const user = await getCurrentUser();
  const integrations = await getIntegrationSettings();

  return (
    <DashboardShell
      user={user}
      title="Configurações"
      subtitle="Gerencie aqui as conexões do sistema e vincule APIs do projeto."
    >
      <AdminSettingsPage integrations={integrations} />
    </DashboardShell>
  );
}
