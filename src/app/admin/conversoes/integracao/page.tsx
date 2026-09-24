import { Suspense } from "react";
import { ConversionsDiagnostics } from "@/components/admin/conversions-diagnostics";
import { ListSkeleton } from "@/components/dashboard/skeletons";
import { PageHeader } from "@/components/shell/page-header";
import { getAdminConnectionOverview } from "@/lib/data/whatsapp-connection";

async function DiagnosticsSection() {
  const overview = await getAdminConnectionOverview();
  return <ConversionsDiagnostics overview={overview} />;
}

export default function ConversionsIntegrationRoute() {
  return (
    <div className="flex min-w-0 flex-col gap-5">
      <PageHeader
        eyebrow="Área administrativa"
        title="Integração com o Meta"
        description="WhatsApp oficial, Dataset e fila de conversões de cada cliente. Todos usam a conta de anúncios da Tráfego Academy, com sinais isolados."
      />

      <Suspense fallback={<ListSkeleton />}>
        <DiagnosticsSection />
      </Suspense>
    </div>
  );
}
