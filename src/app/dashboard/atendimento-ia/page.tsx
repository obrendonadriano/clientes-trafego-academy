import { Suspense } from "react";
import { AiAgentPage } from "@/components/ai-agent/ai-agent-page";
import { AiPlanLock } from "@/components/ai-agent/ai-plan-lock";
import { WhatsappConnectionExperience } from "@/components/whatsapp/whatsapp-conversions-experience";
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

  // A conexão do WhatsApp envolve a página: sem ela, o que aparece é o
  // onboarding/QR, porque nada do resto funciona antes disso. É a mesma
  // sessão WAHA de sempre, agora com casa própria — Conversões virou área
  // só do admin.
  //
  // O Plano Essencial continua conectando o WhatsApp normalmente (o
  // pipeline de leads depende disso) e vê a área de IA desfocada, sem
  // clique e com o aviso de upgrade. O bloqueio real está nas server
  // actions e no banco.
  return (
    <WhatsappConnectionExperience>
      {data.plan === "complete" ? (
        <AiAgentPage data={data} interactive />
      ) : (
        <AiPlanLock>
          <AiAgentPage data={data} interactive={false} />
        </AiPlanLock>
      )}
    </WhatsappConnectionExperience>
  );
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
