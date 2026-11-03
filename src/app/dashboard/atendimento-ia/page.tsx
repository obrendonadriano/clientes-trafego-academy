import { Suspense } from "react";
import { AiAgentPage } from "@/components/ai-agent/ai-agent-page";
import { AiAccessErrorNotice, AiLiveSync } from "@/components/ai-agent/ai-live-sync";
import { AiPlanLock } from "@/components/ai-agent/ai-plan-lock";
import { WhatsappConnectionExperience } from "@/components/whatsapp/whatsapp-connection-experience";
import { ListSkeleton } from "@/components/dashboard/skeletons";
import { PageHeader } from "@/components/shell/page-header";
import { getCurrentUser } from "@/lib/auth/session";
import { getAiAgentPageData, type AiAgentPageData } from "@/lib/data/ai-agent";

function AiAgentContent({ data }: { data: AiAgentPageData }) {
  switch (data.access) {
    case "error":
      return <AiAccessErrorNotice />;

    case "not_configured":
      return (
        <p className="rounded-2xl border border-border/60 bg-card px-4 py-6 text-sm text-muted-foreground">
          O atendimento por IA ainda não está disponível nesta conta. Fale com a
          Tráfego Academy.
        </p>
      );

    case "denied_segment":
      return (
        <p className="rounded-2xl border border-border/60 bg-card px-4 py-6 text-sm text-muted-foreground">
          O atendimento por IA é específico para compra e aquisição de veículos
          financiados e não está disponível para o segmento desta conta. Fale
          com a Tráfego Academy.
        </p>
      );

    // Plano sem IA: a área aparece inteira, desfocada, sem clique e com o
    // convite de upgrade. O bloqueio real está nas server actions e no banco.
    case "denied_plan":
      return (
        <AiPlanLock>
          <AiAgentPage data={data} interactive={false} />
        </AiPlanLock>
      );

    // Com acesso, a conexão envolve a página: sem WhatsApp aparece o
    // onboarding/QR, porque nada do resto funciona antes disso.
    case "allowed":
      return (
        <WhatsappConnectionExperience>
          <AiAgentPage data={data} interactive />
        </WhatsappConnectionExperience>
      );
  }
}

async function AiAgentSection() {
  const user = await getCurrentUser();
  // Acesso decidido no servidor, nesta mesma requisição: não existe um
  // "estado inicial negado" enquanto a checagem roda — até lá é o skeleton.
  const data = await getAiAgentPageData(user);

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <AiLiveSync access={data.access} fingerprint={data.fingerprint} />
      <AiAgentContent data={data} />
    </div>
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
