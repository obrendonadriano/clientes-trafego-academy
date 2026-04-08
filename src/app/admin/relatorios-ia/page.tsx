import { AdminReportsPage } from "@/components/dashboard/admin-reports-page";
import { DashboardShell } from "@/components/dashboard/shell";
import { getCurrentUser } from "@/lib/auth/session";
import { getAdminViewData } from "@/lib/data/queries";
import { generateMockGeminiAnalysis } from "@/lib/services/gemini";

export default async function AdminReportsRoute() {
  const user = await getCurrentUser();
  const data = await getAdminViewData();

  return (
    <DashboardShell
      user={user}
      title="Relatórios IA"
      subtitle="Histórico de relatórios e geração de análise ficam juntos na mesma página."
    >
      <AdminReportsPage
        reports={data.reports}
        aiText={generateMockGeminiAnalysis()}
        clients={data.clients}
        campaigns={data.campaigns}
        clientUsers={data.clientUsers}
        permissions={data.permissions}
      />
    </DashboardShell>
  );
}
