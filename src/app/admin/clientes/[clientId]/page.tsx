import { Suspense } from "react";
import { notFound } from "next/navigation";
import { AdminClientProfilePage } from "@/components/dashboard/admin-client-profile-page";
import { FormPageSkeleton } from "@/components/dashboard/skeletons";
import { PageHeader } from "@/components/shell/page-header";
import { resolveMetricsWindow } from "@/lib/data/date-range";
import { getAdminClientProfileData } from "@/lib/data/queries";
import { getClientCapiConfig } from "@/lib/data/capi";

type AdminClientProfileRouteProps = {
  params: Promise<{
    clientId: string;
  }>;
  searchParams: Promise<{ start?: string; end?: string }>;
};

async function AdminClientProfileSection({
  params,
  searchParams,
}: AdminClientProfileRouteProps) {
  const { clientId } = await params;
  const window = resolveMetricsWindow("admin", await searchParams);
  const data = await getAdminClientProfileData(clientId, window);

  if (!data) {
    notFound();
  }

  const capiConfig = await getClientCapiConfig(clientId);

  return <AdminClientProfilePage {...data} capiConfig={capiConfig} />;
}

export default function AdminClientProfileRoute({
  params,
  searchParams,
}: AdminClientProfileRouteProps) {
  return (
    <div className="flex min-w-0 flex-col gap-5">
      <PageHeader
        eyebrow="Área administrativa"
        title="Perfil do cliente"
        description="Página individual do cliente para editar dados, login, senha e campanhas liberadas."
      />

      <Suspense fallback={<FormPageSkeleton />}>
        <AdminClientProfileSection params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
