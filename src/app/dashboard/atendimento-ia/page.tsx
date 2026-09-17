import { Suspense } from "react";
import { AiAgentPage } from "@/components/ai-agent/ai-agent-page";
import { AiPlanLock } from "@/components/ai-agent/ai-plan-lock";
import { ListSkeleton } from "@/components/dashboard/skeletons";
import { PageHeader } from "@/components/shell/page-header";
import { getCurrentUser } from "@/lib/auth/session";
import { getAiAgentPageData } from "@/lib/data/ai-agent";

async function AiAgentSection() {
  const user = await getCurrentUser();
  const data = await getAiAgentPageData(user);

  if (data.unavailable) {
    return (
      <p className="rounded-2xl border border-border/60 bg-card px-4 py-6 text-sm text-muted-foreground">
        O atendimento por IA ainda não está disponível nesta conta. Fale com a
        Tráfego Academy.
      </p>
    );
  }

  // O Plano Essencial vê a tela inteira — desfocada, sem clique e com o aviso
  // de upgrade. O bloqueio real está nas server actions e no banco.
  if (data.plan !== "complete") {
    return (
      <AiPlanLock>
        <AiAgentPage data={data} interactive={false} />
      </AiPlanLock>
    );
  }

  return <AiAgentPage data={data} interactive />;
}

export default function AiAgentRoute() {
  return (
    <div className="flex min-w-0 flex-col gap-5">
      <PageHeader
        eyebrow="Área do cliente"
        title="Atendimento IA"
        description="Automatize a qualificação dos seus leads pelo WhatsApp."
      />

      <Suspense fallback={<ListSkeleton />}>
        <AiAgentSection />
      </Suspense>
    </div>
  );
}
