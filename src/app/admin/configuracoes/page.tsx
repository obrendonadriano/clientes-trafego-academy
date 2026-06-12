import { AdminSettingsPage } from "@/components/dashboard/admin-settings-page";
import { DashboardShell } from "@/components/dashboard/shell";
import { getCurrentUser } from "@/lib/auth/session";
import { getIntegrationSettings } from "@/lib/data/queries";
import { ensureLegacyAccountMigrated, listMetaAdAccounts } from "@/lib/meta/accounts";

export default async function AdminSettingsRoute() {
  const user = await getCurrentUser();
  // Migra a conta principal antiga para a lista antes de exibir.
  await ensureLegacyAccountMigrated();
  const [integrations, metaAccounts] = await Promise.all([
    getIntegrationSettings(),
    listMetaAdAccounts(),
  ]);

  return (
    <DashboardShell
      user={user}
      title="Configurações"
      subtitle="Gerencie aqui as conexões do sistema e vincule APIs do projeto."
    >
      <AdminSettingsPage integrations={integrations} metaAccounts={metaAccounts} />
    </DashboardShell>
  );
}
