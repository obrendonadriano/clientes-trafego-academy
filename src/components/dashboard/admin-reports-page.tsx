import { AiReportPanel } from "@/components/dashboard/ai-report-panel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
    <div className="space-y-6">
      <div>
        <p className="text-sm uppercase tracking-[0.25em] text-muted-foreground">
          Relatórios IA
        </p>
        <h3 className="mt-2 font-display text-3xl font-semibold">
          Histórico e geração de análise
        </h3>
        <p className="mt-2 max-w-3xl text-muted-foreground">
          Aqui ficam juntos o histórico do que já foi gerado e o editor de texto com IA.
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
        <Card className="border-border/60 bg-background/60">
          <CardHeader>
            <CardTitle className="font-display text-2xl">
              Histórico de relatórios
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {reports.map((report) => (
              <div
                key={report.id}
                className="rounded-2xl border border-border/60 bg-card px-4 py-3"
              >
                <p className="font-medium">{report.clientName}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {report.periodLabel}
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  {report.preview}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>

        <AiReportPanel
          initialText={aiText}
          initialWhatsapp={reports[0]?.whatsapp ?? clients[0]?.whatsapp ?? ""}
          clients={clients}
          campaigns={campaigns}
          clientUsers={clientUsers}
          permissions={permissions}
          reports={reports}
        />
      </div>
    </div>
  );
}
