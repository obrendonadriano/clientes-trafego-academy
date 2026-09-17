import { Suspense } from "react";
import { redirect } from "next/navigation";
import {
  AdminAiAgentOverview,
  type AdminAiAgentRow,
} from "@/components/ai-agent/admin-ai-agent-overview";
import { ListSkeleton } from "@/components/dashboard/skeletons";
import { PageHeader } from "@/components/shell/page-header";
import { getCurrentUser } from "@/lib/auth/session";
import { toClientPlanType } from "@/lib/ai-agent/shared";
import { aiAdminClient } from "@/lib/ai-agent/store";
import { isSupabaseAdminConfigured } from "@/lib/env";

type OverviewRow = {
  client_id: string;
  nome_empresa: string;
  plan_type: string | null;
  ai_enabled: boolean;
  notification_whatsapp: string | null;
  whatsapp_status: string | null;
  whatsapp_phone: string | null;
  total_conversations: number | string;
  qualified_conversations: number | string;
};

async function loadRows(): Promise<AdminAiAgentRow[] | null> {
  if (!isSupabaseAdminConfigured()) {
    return null;
  }

  // A RPC é security definer e valida o admin no próprio banco; aqui usamos a
  // service role apenas para ler o consolidado de todos os clientes.
  const { data, error } = await aiAdminClient().rpc("admin_ai_agent_overview");

  if (error) {
    console.error("[admin/ia] falha ao carregar visão geral", {
      code: error.code,
      message: error.message,
    });
    return null;
  }

  return ((data as OverviewRow[] | null) ?? []).map((row) => ({
    clientId: row.client_id,
    companyName: row.nome_empresa,
    planType: toClientPlanType(row.plan_type),
    aiEnabled: row.ai_enabled,
    notificationWhatsapp: row.notification_whatsapp,
    whatsappStatus: row.whatsapp_status,
    whatsappPhone: row.whatsapp_phone,
    totalConversations: Number(row.total_conversations) || 0,
    qualifiedConversations: Number(row.qualified_conversations) || 0,
  }));
}

async function AdminAiAgentSection() {
  const user = await getCurrentUser();

  if (user.role !== "admin") {
    redirect("/dashboard");
  }

  const rows = await loadRows();

  if (!rows) {
    return (
      <p className="rounded-2xl border border-border/60 bg-card px-4 py-6 text-sm text-muted-foreground">
        Não foi possível carregar o painel do Atendimento IA. Confira se as
        migrações do banco foram aplicadas — o detalhe do erro fica no log do
        servidor.
      </p>
    );
  }

  return <AdminAiAgentOverview rows={rows} />;
}

export default function AdminAiAgentRoute() {
  return (
    <div className="flex min-w-0 flex-col gap-5">
      <PageHeader
        eyebrow="Área administrativa"
        title="Atendimento IA dos clientes"
        description="Quem tem o Plano Completo, quem já ligou a IA e quantos leads ela qualificou."
      />

      <Suspense fallback={<ListSkeleton />}>
        <AdminAiAgentSection />
      </Suspense>
    </div>
  );
}
