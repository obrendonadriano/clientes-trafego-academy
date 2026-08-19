import { Suspense } from "react";
import { AdminOverview } from "@/components/dashboard/admin-overview";
import { PageSectionSkeleton } from "@/components/dashboard/skeletons";
import { PageHeader } from "@/components/shell/page-header";
import { resolveMetricsWindow } from "@/lib/data/date-range";
import { getAdminOverviewData } from "@/lib/data/queries";

type AdminComparisonPageProps = {
  searchParams: Promise<{ start?: string; end?: string; cliente?: string }>;
};

async function ComparisonSection({
  searchParams,
}: {
  searchParams: AdminComparisonPageProps["searchParams"];
}) {
  const params = await searchParams;
  const window = resolveMetricsWindow("admin", params);
  const data = await getAdminOverviewData(window, params.cliente);

  return <AdminOverview view="comparativo" metricRows={data.metricRows} />;
}

export default function AdminComparisonPage({
  searchParams,
}: AdminComparisonPageProps) {
  return (
    <div className="flex min-w-0 flex-col gap-5">
      <PageHeader
        eyebrow="Área administrativa"
        title="Comparativo de períodos"
        description="Compara o período escolhido com o intervalo anterior de mesmo tamanho."
      />

      <Suspense fallback={<PageSectionSkeleton />}>
        <ComparisonSection searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
