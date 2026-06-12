import { Suspense } from "react";
import { AdminReportsPage } from "@/components/dashboard/admin-reports-page";
import { DashboardShell } from "@/components/dashboard/shell";
import { FormPageSkeleton } from "@/components/dashboard/skeletons";
import { getCurrentUser } from "@/lib/auth/session";
import { getReportsPageData } from "@/lib/data/queries";

async function AdminReportsSection() {
  const data = await getReportsPageData();

  return (
    <AdminReportsPage
      reports={data.reports}
      aiText=""
      clients={data.clients}
      campaigns={data.campaigns}
      clientUsers={data.clientUsers}
      permissions={data.permissions}
    />
  );
}

export default async function AdminReportsRoute() {
  const user = await getCurrentUser();

  return (
    <DashboardShell
      user={user}
      title="Relatórios IA"
      subtitle="Histórico de relatórios e geração de análise ficam juntos na mesma página."
    >
      <Suspense fallback={<FormPageSkeleton />}>
        <AdminReportsSection />
      </Suspense>
    </DashboardShell>
  );
}
