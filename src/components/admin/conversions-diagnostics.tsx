import { formatDistanceToNowStrict, isValid, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CircleAlert, CircleCheck, CircleSlash } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import {
  connectionHeadline,
  formatOfficialPhone,
} from "@/lib/conversions/connection-shared";
import type { AdminConnectionOverview } from "@/lib/data/whatsapp-connection";
import { cn } from "@/lib/utils";

// Diagnóstico por cliente. Mostra tudo que o gestor precisa para saber se a
// integração está viva — e nada que revele um token.

function ago(value: string | null) {
  if (!value) return "—";
  const parsed = parseISO(value);
  if (!isValid(parsed)) return "—";
  return `há ${formatDistanceToNowStrict(parsed, { locale: ptBR })}`;
}

function Mark({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-sm",
        ok ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground",
      )}
    >
      {ok ? (
        <CircleCheck className="size-4" aria-hidden />
      ) : (
        <CircleSlash className="size-4" aria-hidden />
      )}
      {label}
    </span>
  );
}

export function ConversionsDiagnostics({
  overview,
}: {
  overview: AdminConnectionOverview;
}) {
  const { clients, signup, notice } = overview;
  const active = clients.filter((client) => client.status === "active").length;
  const migrated = clients.filter(
    (client) => client.ingestMode === "official_meta",
  ).length;
  const queued = clients.reduce((sum, client) => sum + client.leadsNaFila, 0);
  const failing = clients.reduce(
    (sum, client) => sum + client.eventosComErro,
    0,
  );

  return (
    <div className="min-w-0 space-y-4">
      {notice ? (
        <p className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm">
          {notice}
        </p>
      ) : null}

      {!signup.ready ? (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm">
          <p className="font-medium">Ação necessária na Meta</p>
          <p className="mt-1 text-muted-foreground">
            O botão “Conectar WhatsApp Business” não aparece para os clientes
            enquanto faltar configuração. Pendente:{" "}
            <span className="font-mono text-xs">
              {signup.missing.join(", ")}
            </span>
            . Consulte <code>docs/conversoes-whatsapp-meta.md</code>.
          </p>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardContent className="py-5">
            <p className="text-sm text-muted-foreground">
              Clientes com conversões ativas
            </p>
            <p className="mt-2 font-display text-3xl font-semibold">
              {active}
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
              Migrados para a Meta oficial
            </p>
            <p className="mt-2 font-display text-3xl font-semibold">
              {migrated}
              <span className="text-base font-normal text-muted-foreground">
                {" "}
                de {clients.length}
              </span>
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              O restante continua captando pelo fluxo antigo.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-5">
            <p className="text-sm text-muted-foreground">
              Eventos na fila de envio
            </p>
            <p className="mt-2 font-display text-3xl font-semibold">{queued}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-5">
            <p className="text-sm text-muted-foreground">
              Eventos aguardando conciliação
            </p>
            <p className="mt-2 font-display text-3xl font-semibold">
              {failing}
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
        <div className="grid gap-4 xl:grid-cols-2">
          {clients.map((client) => {
            const status = connectionHeadline(client.status);
            const phone = formatOfficialPhone(client.displayPhoneNumber);

            return (
              <Card key={client.clientId}>
                <CardContent className="space-y-3 py-5">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="min-w-0 truncate font-semibold">
                      {client.clientName}
                    </h3>
                    <span
                      className={cn(
                        "shrink-0 rounded-full px-2.5 py-1 text-xs font-medium",
                        status.tone === "ok" &&
                          "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
                        status.tone === "warn" &&
                          "bg-red-500/10 text-red-700 dark:text-red-300",
                        status.tone === "progress" &&
                          "bg-amber-500/10 text-amber-700 dark:text-amber-300",
                        status.tone === "idle" && "bg-muted text-muted-foreground",
                      )}
                    >
                      {status.label}
                    </span>
                  </div>

                  <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                    <div>
                      <dt className="text-muted-foreground">Conta de anúncios</dt>
                      <dd>Tráfego Academy</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Captação</dt>
                      <dd>
                        {client.ingestMode === "official_meta"
                          ? "Meta oficial"
                          : "WAHA (legado)"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Número</dt>
                      <dd>{phone ?? "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">WABA ID</dt>
                      <dd className="truncate font-mono">
                        {client.wabaId ?? "—"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Phone number ID</dt>
                      <dd className="truncate font-mono">
                        {client.phoneNumberId ?? "—"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Dataset</dt>
                      <dd className="truncate font-mono">
                        {client.datasetId ?? "—"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Coexistence</dt>
                      <dd>
                        {client.isOnBizApp === true
                          ? `Ativo${client.platformType ? ` (${client.platformType})` : ""}`
                          : client.isOnBizApp === false
                            ? "Número fora do app"
                            : "Não informado"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Último webhook</dt>
                      <dd>{ago(client.lastWebhookAt)}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Último lead</dt>
                      <dd>{ago(client.lastLeadAt)}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Última conversão</dt>
                      <dd>{ago(client.lastConversionAt)}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">
                        Aguardando avaliação
                      </dt>
                      <dd>{client.leadsPendentes}</dd>
                    </div>
                  </dl>

                  <div className="flex flex-wrap gap-x-4 gap-y-1">
                    <Mark ok={client.webhookSubscribed} label="Webhook" />
                    <Mark
                      ok={client.tokenConfigurado}
                      label="Credencial salva"
                    />
                    <Mark ok={client.capiAtivo} label="Envio ativo" />
                  </div>

                  {client.eventosComErro > 0 ? (
                    <p className="inline-flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-300">
                      <CircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                      {client.eventosComErro} evento(s) aguardando conciliação no
                      Gerenciador de Eventos antes de qualquer reenvio.
                    </p>
                  ) : null}

                  {client.lastError ? (
                    <p className="rounded-lg bg-muted/40 px-2 py-1.5 text-xs text-muted-foreground">
                      {client.lastError}
                    </p>
                  ) : null}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
