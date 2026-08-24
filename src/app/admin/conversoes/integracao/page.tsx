import { Suspense } from "react";
import Link from "next/link";
import { CircleAlert, CircleCheck, CircleSlash } from "lucide-react";
import { ListSkeleton } from "@/components/dashboard/skeletons";
import { PageHeader } from "@/components/shell/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { getCapiOverview } from "@/lib/data/capi";

async function CapiOverviewSection() {
  const { clients, notice } = await getCapiOverview();

  const prontos = clients.filter(
    (client) => client.capiAtivo && client.tokenConfigurado,
  ).length;
  const naFila = clients.reduce((soma, client) => soma + client.leadsNaFila, 0);
  const pendentes = clients.reduce(
    (soma, client) => soma + client.leadsPendentes,
    0,
  );

  return (
    <div className="min-w-0 space-y-4">
      {notice ? (
        <p className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-600 dark:text-amber-300">
          {notice}
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="py-5">
            <p className="text-sm text-muted-foreground">Clientes enviando</p>
            <p className="mt-2 font-display text-3xl font-semibold text-foreground">
              {prontos}
              <span className="text-base font-normal text-muted-foreground">
                {" "}
                de {clients.length}
              </span>
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-5">
            <p className="text-sm text-muted-foreground">
              Leads aguardando avaliação
            </p>
            <p className="mt-2 font-display text-3xl font-semibold text-foreground">
              {pendentes}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-5">
            <p className="text-sm text-muted-foreground">Na fila de envio</p>
            <p className="mt-2 font-display text-3xl font-semibold text-foreground">
              {naFila}
            </p>
          </CardContent>
        </Card>
      </div>

      {clients.length === 0 ? (
        <Card>
          <CardContent className="px-6 py-12 text-center text-sm text-muted-foreground">
            Nenhum cliente para mostrar.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="min-w-0 overflow-x-auto">
              <table className="w-full min-w-[46rem] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border/60 text-left text-xs uppercase tracking-[0.08em] text-muted-foreground dark:border-white/10">
                    <th className="px-4 py-3 font-medium">Cliente</th>
                    <th className="px-4 py-3 font-medium">Configuração</th>
                    <th className="px-4 py-3 font-medium">Envio</th>
                    <th className="px-4 py-3 text-right font-medium">
                      Aguardando
                    </th>
                    <th className="px-4 py-3 text-right font-medium">Na fila</th>
                    <th className="w-24 px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {clients.map((client) => {
                    const completo =
                      Boolean(client.datasetId) &&
                      Boolean(client.pageId) &&
                      client.tokenConfigurado;

                    return (
                      <tr
                        key={client.clientId}
                        className="border-b border-border/40 last:border-b-0 dark:border-white/[0.06]"
                      >
                        <td className="max-w-[16rem] px-4 py-3">
                          <span className="block truncate text-foreground">
                            {client.clientName}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {completo ? (
                            <span className="inline-flex items-center gap-1.5 text-sm text-emerald-600 dark:text-emerald-400">
                              <CircleCheck className="size-4" />
                              Completa
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                              <CircleAlert className="size-4" />
                              {!client.datasetId
                                ? "Falta o Dataset"
                                : !client.pageId
                                  ? "Falta a Página"
                                  : "Falta o token"}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {client.capiAtivo ? (
                            <Badge variant="success">Ativo</Badge>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                              <CircleSlash className="size-4" />
                              Desligado
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right text-foreground">
                          {client.leadsPendentes}
                        </td>
                        <td className="px-4 py-3 text-right text-foreground">
                          {client.leadsNaFila}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Link
                            href={`/admin/clientes/${client.clientId}`}
                            className="text-sm text-primary underline-offset-4 hover:underline"
                          >
                            Configurar
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function CapiOverviewRoute() {
  return (
    <div className="flex min-w-0 flex-col gap-5">
      <PageHeader
        eyebrow="Área administrativa"
        title="Integração com o Meta"
        description="Quem está configurado, quem está enviando e quantos leads esperam avaliação ou envio."
      />

      <Suspense fallback={<ListSkeleton />}>
        <CapiOverviewSection />
      </Suspense>
    </div>
  );
}
