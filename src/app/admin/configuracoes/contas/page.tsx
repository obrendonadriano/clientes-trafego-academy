import { AdminSettingsPage } from "@/components/dashboard/admin-settings-page";
import { PageHeader } from "@/components/shell/page-header";
import { getIntegrationSettings } from "@/lib/data/queries";
import { ensureLegacyAccountMigrated, listMetaAdAccounts } from "@/lib/meta/accounts";

export default async function MetaAccountsRoute() {
  await ensureLegacyAccountMigrated();
  const [integrations, metaAccounts] = await Promise.all([
    getIntegrationSettings(),
    listMetaAdAccounts(),
  ]);

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <PageHeader
        eyebrow="Área administrativa"
        title="Contas de anúncio da Meta"
        description="Contas conectadas à Business Manager, com o token e o estado de cada uma."
      />

      <AdminSettingsPage
        view="contas"
        integrations={integrations}
        metaAccounts={metaAccounts}
      />
    </div>
  );
}
