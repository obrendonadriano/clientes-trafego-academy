import { Suspense } from "react";
import { AdBudgetPanel } from "@/components/admin/ad-budget-panel";
import { PageSectionSkeleton } from "@/components/dashboard/skeletons";
import { PageHeader } from "@/components/shell/page-header";
import { getAdBudgetReport, isControlConfigured } from "@/lib/data/ad-budget";

// Sempre lê o controle na hora: pagamento lançado agora já tem que aparecer.
export const dynamic = "force-dynamic";

async function BudgetSection() {
  if (!isControlConfigured()) {
    return (
      <p className="rounded-2xl border border-dashed border-border/60 px-4 py-8 text-center text-sm text-muted-foreground">
        O sistema de controle não está configurado. Defina CONTROLE_SUPABASE_URL e
        CONTROLE_SUPABASE_SECRET_KEY nas variáveis de ambiente.
      </p>
    );
  }

  const result = await getAdBudgetReport().then(
    (report) => ({ report, error: null }),
    (error: unknown) => ({
      report: null,
      error:
        error instanceof Error
          ? error.message
          : "Não foi possível montar o relatório.",
    }),
  );

  if (!result.report) {
    return (
      <p className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-6 text-sm text-red-600">
        {result.error}
      </p>
    );
  }

  return <AdBudgetPanel report={result.report} />;
}

export default function AdminBudgetPage() {
  return (
    <div className="flex min-w-0 flex-col gap-5">
      <PageHeader
        eyebrow="Área administrativa"
        title="Verba x gasto"
        description="Quanto cada cliente pagou de verba e quanto a Meta cobrou, para achar campanha gastando além do combinado."
      />

      <Suspense fallback={<PageSectionSkeleton />}>
        <BudgetSection />
      </Suspense>
    </div>
  );
}
