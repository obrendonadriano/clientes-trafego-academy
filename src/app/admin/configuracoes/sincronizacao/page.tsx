import { AdminSyncPanel } from "@/components/dashboard/admin-sync-panel";
import { PageHeader } from "@/components/shell/page-header";
import { getCurrentUser } from "@/lib/auth/session";
import { getAppShellData } from "@/lib/data/queries";
import { getExchangeRateInfo } from "@/lib/meta-ads";

export default async function SettingsSyncRoute() {
  const user = await getCurrentUser();
  const [{ syncStatus }, exchangeRate] = await Promise.all([
    getAppShellData(user),
    getExchangeRateInfo("USD"),
  ]);

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <PageHeader
        eyebrow="Área administrativa"
        title="Sincronização"
        description="Atualização manual dos dados da Meta Ads e estado da última importação."
      />

      <AdminSyncPanel syncStatus={syncStatus} exchangeRate={exchangeRate} />
    </div>
  );
}
