import { Suspense } from "react";
import { notFound } from "next/navigation";
import { AdminClientProfilePage } from "@/components/dashboard/admin-client-profile-page";
import { DashboardShell } from "@/components/dashboard/shell";
import { FormPageSkeleton } from "@/components/dashboard/skeletons";
import { getCurrentUser } from "@/lib/auth/session";
import { resolveMetricsWindow } from "@/lib/data/date-range";
import { getAdminClientProfileData } from "@/lib/data/queries";

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

  return <AdminClientProfilePage {...data} />;
}

export default async function AdminClientProfileRoute({
  params,
  searchParams,
}: AdminClientProfileRouteProps) {
  const user = await getCurrentUser();

  return (
    <DashboardShell
      user={user}
      title="Perfil do cliente"
      subtitle="Página individual do cliente para editar dados, login, senha e campanhas liberadas."
    >
      <Suspense fallback={<FormPageSkeleton />}>
        <AdminClientProfileSection params={params} searchParams={searchParams} />
      </Suspense>
    </DashboardShell>
  );
}
