import { Badge } from "@/components/ui/badge";
import { CampaignWithMetrics } from "@/lib/types";

type CampaignsTableProps = {
  campaigns: CampaignWithMetrics[];
};

export function CampaignsTable({ campaigns }: CampaignsTableProps) {
  return (
    <div className="overflow-hidden rounded-3xl border border-border/60 bg-background/60">
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-border/60 bg-muted/60 text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Campanha</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Investido</th>
              <th className="px-4 py-3 font-medium">Cliques</th>
              <th className="px-4 py-3 font-medium">CTR</th>
              <th className="px-4 py-3 font-medium">Leads</th>
              <th className="px-4 py-3 font-medium">CPL</th>
              <th className="px-4 py-3 font-medium">ROAS</th>
            </tr>
          </thead>
          <tbody>
            {campaigns.length > 0 ? (
              campaigns.map((campaign) => (
                <tr key={campaign.id} className="border-b border-border/40 last:border-b-0">
                  <td className="px-4 py-4">
                    <div>
                      <p className="font-medium">{campaign.name}</p>
                      <p className="text-muted-foreground">{campaign.platform}</p>
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <Badge variant={campaign.status === "Ativa" ? "success" : "secondary"}>
                      {campaign.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-4">{campaign.metrics.amountSpent}</td>
                  <td className="px-4 py-4">{campaign.metrics.clicks}</td>
                  <td className="px-4 py-4">{campaign.metrics.ctr}</td>
                  <td className="px-4 py-4">{campaign.metrics.leads}</td>
                  <td className="px-4 py-4">{campaign.metrics.costPerLead}</td>
                  <td className="px-4 py-4">{campaign.metrics.roas}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td
                  colSpan={8}
                  className="px-4 py-8 text-center text-sm text-muted-foreground"
                >
                  Nenhuma campanha com métricas para o período selecionado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
