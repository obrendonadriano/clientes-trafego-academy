import { Suspense } from "react";
import { AdminSyncPanel } from "@/components/dashboard/admin-sync-panel";
import { FormPageSkeleton } from "@/components/dashboard/skeletons";
import { PageHeader } from "@/components/shell/page-header";
import { getCurrentUser } from "@/lib/auth/session";
import { resolveMetricsWindow } from "@/lib/data/date-range";
import { getAdminOverviewData, getAppShellData } from "@/lib/data/queries";
import { getExchangeRateInfo } from "@/lib/meta-ads";

type AdminSyncPageProps = {
  searchParams: Promise<{ start?: string; end?: string; cliente?: string }>;
};

async function SyncSection({
  searchParams,
}: {
  searchParams: AdminSyncPageProps["searchParams"];
}) {
  const params = await searchParams;
  const window = resolveMetricsWindow("admin", params);
  const user = await getCurrentUser();
  const [data, shell, exchangeRate] = await Promise.all([
    getAdminOverviewData(window, params.cliente),
    getAppShellData(user),
    getExchangeRateInfo("USD"),
  ]);

  return (
    <AdminSyncPanel
      syncStatus={shell.syncStatus}
      exchangeRate={exchangeRate}
      counters={{
        clientCount: data.clientCount,
        activeClientCount: data.activeClientCount,
        campaignCount: data.campaignCount,
        activeCampaignCount: data.activeCampaignCount,
        clientUserCount: data.clientUserCount,
        permissionCount: data.permissionCount,
      }}
    />
  );
}

export default function AdminSyncPage({ searchParams }: AdminSyncPageProps) {
  return (
    <div className="flex min-w-0 flex-col gap-5">
      <PageHeader
        eyebrow="Área administrativa"
        title="Sincronização"
        description="Estado da importação da Meta Ads e números gerais da operação."
      />

      <Suspense fallback={<FormPageSkeleton />}>
        <SyncSection searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
