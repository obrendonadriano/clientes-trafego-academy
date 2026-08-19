import { Suspense } from "react";
import { ClientDashboard } from "@/components/dashboard/client-dashboard";
import { PageSectionSkeleton } from "@/components/dashboard/skeletons";
import { PageHeader } from "@/components/shell/page-header";
import { getCurrentUser } from "@/lib/auth/session";
import { resolveMetricsWindow } from "@/lib/data/date-range";
import { getClientPortalData } from "@/lib/data/queries";
import type { User } from "@/lib/types";

type DashboardPageProps = {
  searchParams: Promise<{ start?: string; end?: string }>;
};

async function DashboardSection({
  user,
  searchParams,
}: {
  user: User;
  searchParams: DashboardPageProps["searchParams"];
}) {
  const window = resolveMetricsWindow(user.role, await searchParams);
  const data = await getClientPortalData(user, window);

  return <ClientDashboard {...data} />;
}

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const user = await getCurrentUser();

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <PageHeader
        eyebrow="Área do cliente"
        title={`Dashboard de ${user.clientName ?? user.name}`}
        description="Visualização simples, profissional e restrita às campanhas liberadas para este cliente."
      />

      <Suspense fallback={<PageSectionSkeleton />}>
        <DashboardSection user={user} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
