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

// Saudação pelo horário de Brasília, como no topo do design.
function greeting() {
  const hour = Number(
    new Intl.DateTimeFormat("pt-BR", {
      hour: "numeric",
      hourCycle: "h23",
      timeZone: "America/Sao_Paulo",
    }).format(new Date()),
  );

  if (hour < 12) return "Bom dia";
  if (hour < 18) return "Boa tarde";
  return "Boa noite";
}

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const user = await getCurrentUser();
  const firstName = user.name.trim().split(/\s+/)[0] || user.name;

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader
        title={`${greeting()}, ${firstName} 👋`}
        description={`Acompanhe o desempenho das campanhas de ${user.clientName ?? user.name}.`}
      />

      <Suspense fallback={<PageSectionSkeleton />}>
        <DashboardSection user={user} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
