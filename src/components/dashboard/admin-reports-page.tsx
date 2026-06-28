import { Sparkles } from "lucide-react";
import { AiReportPanel } from "@/components/dashboard/ai-report-panel";
import type {
  CampaignWithMetrics,
  CampaignPermission,
  Client,
  ReportHistoryItem,
  User,
} from "@/lib/types";

type AdminReportsPageProps = {
  reports: ReportHistoryItem[];
  aiText: string;
  clients: Client[];
  campaigns: CampaignWithMetrics[];
  clientUsers: User[];
  permissions: CampaignPermission[];
};

export function AdminReportsPage({
  reports,
  aiText,
  clients,
  campaigns,
  clientUsers,
  permissions,
}: AdminReportsPageProps) {
  return (
    <div className="min-w-0 space-y-6">
      <div className="flex items-center gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-primary/12 text-primary">
          <Sparkles className="size-5" />
        </span>
        <div className="min-w-0">
          <p className="text-sm uppercase tracking-[0.25em] text-muted-foreground">
            Análise com IA
          </p>
          <h3 className="font-display text-3xl font-semibold">
            Gerar relatório para o cliente
          </h3>
        </div>
      </div>

      <AiReportPanel
        initialText={aiText}
        initialWhatsapp={reports[0]?.whatsapp ?? clients[0]?.whatsapp ?? ""}
        clients={clients}
        campaigns={campaigns}
        clientUsers={clientUsers}
        permissions={permissions}
      />
    </div>
  );
}
