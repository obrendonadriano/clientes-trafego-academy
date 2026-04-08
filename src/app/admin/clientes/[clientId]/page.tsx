import { notFound } from "next/navigation";
import { AdminClientProfilePage } from "@/components/dashboard/admin-client-profile-page";
import { DashboardShell } from "@/components/dashboard/shell";
import { getCurrentUser } from "@/lib/auth/session";
import { getAdminClientProfileData } from "@/lib/data/queries";

type AdminClientProfileRouteProps = {
  params: Promise<{
    clientId: string;
  }>;
};

export default async function AdminClientProfileRoute({
  params,
}: AdminClientProfileRouteProps) {
  const { clientId } = await params;
  const user = await getCurrentUser();
  const data = await getAdminClientProfileData(clientId);

  if (!data) {
    notFound();
  }

  return (
    <DashboardShell
      user={user}
      title={data.client.companyName}
      subtitle="Página individual do cliente para editar dados, login, senha e campanhas liberadas."
    >
      <AdminClientProfilePage {...data} />
    </DashboardShell>
  );
}
