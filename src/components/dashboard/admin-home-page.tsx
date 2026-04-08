import Link from "next/link";
import { AdminOverview } from "@/components/dashboard/admin-overview";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RawCampaignMetric } from "@/lib/types";

type AdminHomePageProps = {
  clientCount: number;
  campaignCount: number;
  clientUserCount: number;
  permissionCount: number;
  activeClientCount: number;
  activeCampaignCount: number;
  metricRows: RawCampaignMetric[];
};

export function AdminHomePage(props: AdminHomePageProps) {
  return (
    <div className="space-y-6">
      <AdminOverview {...props} />

      <div className="grid gap-4 md:grid-cols-3">
        <Link
          href="/admin/clientes"
          className="rounded-[1.75rem] border border-border/60 bg-[linear-gradient(180deg,rgba(255,255,255,0.78)_0%,rgba(244,248,243,0.95)_100%)] p-6 shadow-[0_24px_48px_-30px_rgba(8,18,29,0.25)] transition hover:-translate-y-0.5 hover:border-primary/40 hover:bg-card dark:bg-[linear-gradient(180deg,rgba(12,24,36,0.9)_0%,rgba(8,17,29,0.96)_100%)]"
        >
          <p className="text-sm text-muted-foreground">Área principal</p>
          <h3 className="mt-3 font-display text-3xl font-semibold">Clientes</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Cadastre empresa, acesso e permissões em uma única etapa.
          </p>
        </Link>
        <Link
          href="/admin/campanhas"
          className="rounded-[1.75rem] border border-border/60 bg-[linear-gradient(180deg,rgba(255,255,255,0.78)_0%,rgba(244,248,243,0.95)_100%)] p-6 shadow-[0_24px_48px_-30px_rgba(8,18,29,0.25)] transition hover:-translate-y-0.5 hover:border-primary/40 hover:bg-card dark:bg-[linear-gradient(180deg,rgba(12,24,36,0.9)_0%,rgba(8,17,29,0.96)_100%)]"
        >
          <p className="text-sm text-muted-foreground">Gestão operacional</p>
          <h3 className="mt-3 font-display text-3xl font-semibold">Campanhas</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Cadastre e organize as campanhas antes de liberá-las aos clientes.
          </p>
        </Link>
        <Link
          href="/admin/relatorios-ia"
          className="rounded-[1.75rem] border border-border/60 bg-[linear-gradient(180deg,rgba(255,255,255,0.78)_0%,rgba(244,248,243,0.95)_100%)] p-6 shadow-[0_24px_48px_-30px_rgba(8,18,29,0.25)] transition hover:-translate-y-0.5 hover:border-primary/40 hover:bg-card dark:bg-[linear-gradient(180deg,rgba(12,24,36,0.9)_0%,rgba(8,17,29,0.96)_100%)]"
        >
          <p className="text-sm text-muted-foreground">Comunicação</p>
          <h3 className="mt-3 font-display text-3xl font-semibold">Relatórios IA</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Gere análises, revise o texto e envie para WhatsApp em uma só página.
          </p>
        </Link>
      </div>

      <Card className="border-border/60 bg-background/60">
        <CardHeader>
          <CardTitle className="font-display text-2xl">Resumo rápido</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-border/60 bg-card px-4 py-4">
            <p className="text-sm text-muted-foreground">Fluxo recomendado</p>
            <p className="mt-2 font-medium">1. Criar campanhas</p>
            <p className="text-sm text-muted-foreground">2. Criar cliente</p>
            <p className="text-sm text-muted-foreground">3. Liberar visibilidade</p>
          </div>
          <div className="rounded-2xl border border-border/60 bg-card px-4 py-4">
            <p className="text-sm text-muted-foreground">Próxima ação</p>
            <p className="mt-2 font-medium">Cadastrar sua primeira campanha</p>
          </div>
          <div className="rounded-2xl border border-border/60 bg-card px-4 py-4">
            <p className="text-sm text-muted-foreground">Estrutura</p>
            <p className="mt-2 font-medium">Menu agora navega por páginas reais</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
