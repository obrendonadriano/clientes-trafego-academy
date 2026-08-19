import { Suspense } from "react";
import { ReportsHistory } from "@/components/dashboard/reports-history";
import { ListSkeleton } from "@/components/dashboard/skeletons";
import { PageHeader } from "@/components/shell/page-header";
import { getReportsPageData } from "@/lib/data/queries";

async function ReportsHistorySection() {
  const data = await getReportsPageData();

  return <ReportsHistory reports={data.reports} />;
}

export default function AdminReportsHistoryRoute() {
  return (
    <div className="flex min-w-0 flex-col gap-5">
      <PageHeader
        eyebrow="Área administrativa"
        title="Histórico de relatórios"
        description="Tudo o que já foi gerado pela IA, com o texto completo para copiar ou reenviar."
      />

      <Suspense fallback={<ListSkeleton />}>
        <ReportsHistorySection />
      </Suspense>
    </div>
  );
}
