import { Suspense } from "react";
import { ConversionsPage } from "@/components/conversions/conversions-page";
import { WhatsappOfficialConnection } from "@/components/conversions/whatsapp-official-connection";
import { ListSkeleton } from "@/components/dashboard/skeletons";
import { PageHeader } from "@/components/shell/page-header";
import { getCurrentUser } from "@/lib/auth/session";
import { getConversionLeads } from "@/lib/data/conversions";
import { getClientWhatsappConnection } from "@/lib/data/whatsapp-connection";
import {
  PERIOD_OPTIONS,
  QUALIFICATION_TABS,
  type PeriodOption,
  type QualificationTab,
} from "@/lib/conversions/shared";
import { getAppShellData } from "@/lib/data/queries";

type ConversionsRouteProps = {
  searchParams: Promise<{
    aba?: string;
    periodo?: string;
    cliente?: string;
    pagina?: string;
  }>;
};

async function ConversionsSection({
  searchParams,
}: {
  searchParams: ConversionsRouteProps["searchParams"];
}) {
  const params = await searchParams;
  const user = await getCurrentUser();

  const tab = (
    QUALIFICATION_TABS.some((t) => t.key === params.aba) ? params.aba : "todos"
  ) as QualificationTab;
  const period = (
    PERIOD_OPTIONS.some((p) => p.key === params.periodo) ? params.periodo : "30"
  ) as PeriodOption;
  const clientId = user.role === "admin" ? (params.cliente ?? null) : null;

  // Conversões não depende do plano de Atendimento IA: qualquer cliente com
  // acesso ao portal pode conectar o WhatsApp e acompanhar o funil.
  const [data, shell, whatsapp] = await Promise.all([
    getConversionLeads(user, {
      tab,
      period,
      clientId,
      page: Number(params.pagina) || 1,
    }),
    getAppShellData(user),
    user.role === "client"
      ? getClientWhatsappConnection(user)
      : Promise.resolve(null),
  ]);

  return (
    <div className="space-y-5">
      {whatsapp ? (
        <div id="whatsapp">
          <WhatsappOfficialConnection
            connection={whatsapp.connection}
            appId={whatsapp.signup.ready ? whatsapp.signup.appId : undefined}
            configId={
              whatsapp.signup.ready ? whatsapp.signup.configId : undefined
            }
            graphVersion={
              whatsapp.signup.ready ? whatsapp.signup.graphVersion : undefined
            }
            unavailableReason={
              whatsapp.signup.ready
                ? undefined
                : "A conexão com o WhatsApp Business ainda está sendo liberada pela Tráfego Academy. Você será avisado quando estiver disponível."
            }
          />
        </div>
      ) : null}
      <ConversionsPage
        data={data}
        tab={tab}
        period={period}
        isAdmin={user.role === "admin"}
        clients={shell.clients}
        selectedClientId={clientId}
      />
    </div>
  );
}

export default function ConversionsRoute({
  searchParams,
}: ConversionsRouteProps) {
  return (
    <div className="flex min-w-0 flex-col gap-5">
      <PageHeader
        eyebrow="Área do cliente"
        title="Conversões"
        description="Acompanhe os contatos dos anúncios até a compra do veículo. Arraste cada lead para a etapa correspondente."
      />

      <Suspense fallback={<ListSkeleton />}>
        <ConversionsSection searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
