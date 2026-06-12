import { Suspense } from "react";
import { AdminClientsPage } from "@/components/dashboard/admin-clients-page";
import { DashboardShell } from "@/components/dashboard/shell";
import { FormPageSkeleton } from "@/components/dashboard/skeletons";
import { getCurrentUser } from "@/lib/auth/session";
import { getAdminClientsListData } from "@/lib/data/queries";

async function AdminClientsSection() {
  const data = await getAdminClientsListData();

  return (
    <AdminClientsPage
      clients={data.clients}
      campaigns={data.campaigns}
      permissions={data.permissions}
      clientUsers={data.clientUsers}
    />
  );
}

export default async function AdminClientsRoute() {
  const user = await getCurrentUser();

  return (
    <DashboardShell
      user={user}
      title="Clientes"
      subtitle="Cadastre clientes, acesso ao portal e campanhas permitidas em um único fluxo."
    >
      <Suspense fallback={<FormPageSkeleton />}>
        <AdminClientsSection />
      </Suspense>
    </DashboardShell>
  );
}
