import { AiAllPlansCard } from "@/components/admin/ai-all-plans-card";
import { AdminSettingsPage } from "@/components/dashboard/admin-settings-page";
import { PageHeader } from "@/components/shell/page-header";
import { getAiAllPlans } from "@/lib/ai-agent/store";
import { getIntegrationSettings } from "@/lib/data/queries";
import { ensureLegacyAccountMigrated, listMetaAdAccounts } from "@/lib/meta/accounts";

export default async function AdminSettingsRoute() {
  // Migra a conta principal antiga para a lista antes de exibir.
  await ensureLegacyAccountMigrated();
  const [integrations, metaAccounts, aiAllPlans] = await Promise.all([
    getIntegrationSettings(),
    listMetaAdAccounts(),
    getAiAllPlans().catch(() => false),
  ]);

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <PageHeader
        eyebrow="Área administrativa"
        title="Conexões e integrações"
        description="Credenciais das conexões do sistema: Meta Ads, DeepSeek, WhatsApp via WAHA e a base principal do projeto."
      />

      <AiAllPlansCard enabled={aiAllPlans} />

      <AdminSettingsPage
        view="integracoes"
        integrations={integrations}
        metaAccounts={metaAccounts}
      />
    </div>
  );
}
