"use client";

import { useActionState } from "react";
import { CheckCircle2, CircleAlert, RefreshCw } from "lucide-react";
import { syncMetaAction } from "@/app/admin/campanhas/actions";
import { MetaSyncOverlay } from "@/components/dashboard/meta-sync-overlay";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FormPendingButton } from "@/components/ui/form-pending-button";
import type { ExchangeRateInfo } from "@/lib/meta-ads";
import type { SyncStatus } from "@/lib/types";

export type OperationCounters = {
  clientCount: number;
  activeClientCount: number;
  campaignCount: number;
  activeCampaignCount: number;
  clientUserCount: number;
  permissionCount: number;
};

type AdminSyncPanelProps = {
  syncStatus: SyncStatus | null;
  // Sem contadores o painel ocupa a largura toda (uso na aba de Configuracoes).
  counters?: OperationCounters;
  // Cotação usada na conversão para reais, com a origem dela.
  exchangeRate?: ExchangeRateInfo | null;
};

function formatDateTime(value?: string | null) {
  if (!value) {
    return "—";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(date);
}

function StatRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="dashboard-row flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <strong className="text-foreground">{value}</strong>
    </div>
  );
}

// Sub-aba "Sincronização" da seção Visão: estado da última importação manual
// da Meta, botão de atualização e contadores gerais da operação.
const RATE_SOURCE_LABEL: Record<ExchangeRateInfo["source"], string> = {
  bcb: "Banco Central (PTAX)",
  awesomeapi: "AwesomeAPI",
  fallback: "valor de emergência",
  nativo: "conta em reais",
};

export function AdminSyncPanel({
  syncStatus,
  counters,
  exchangeRate,
}: AdminSyncPanelProps) {
  const [syncState, syncMeta, isSyncing] = useActionState(syncMetaAction, {});

  const hasError = syncStatus?.status === "error";

  return (
    <>
      <MetaSyncOverlay open={isSyncing} />
      <div
        className={
          counters ? "grid gap-6 xl:grid-cols-[1.1fr_0.9fr]" : "grid gap-6"
        }
      >
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 font-display text-2xl">
            {hasError ? (
              <CircleAlert className="size-5 text-destructive" />
            ) : (
              <CheckCircle2 className="size-5 text-emerald-500" />
            )}
            Sincronização com a Meta Ads
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <StatRow
            label="Última sincronização"
            value={formatDateTime(syncStatus?.lastSuccessAt)}
          />
          <StatRow
            label="Última tentativa"
            value={formatDateTime(syncStatus?.lastAttemptAt)}
          />
          <StatRow
            label="Modo de atualização"
            value="Manual, pelo botão"
          />

          {exchangeRate && exchangeRate.source !== "nativo" ? (
            <div
              className={
                exchangeRate.source === "fallback"
                  ? "rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-600 dark:text-amber-300"
                  : "dashboard-row flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-sm"
              }
            >
              {exchangeRate.source === "fallback" ? (
                <span>
                  Nenhuma fonte de câmbio respondeu: as conversões estão usando o
                  valor de emergência de{" "}
                  <strong>
                    {new Intl.NumberFormat("pt-BR", {
                      style: "currency",
                      currency: "BRL",
                    }).format(exchangeRate.rate)}
                  </strong>{" "}
                  por dólar. Enquanto isso, os valores em reais das contas em
                  dólar ficam imprecisos.
                </span>
              ) : (
                <>
                  <span className="text-muted-foreground">
                    Dólar usado na conversão
                  </span>
                  <strong className="text-foreground">
                    {new Intl.NumberFormat("pt-BR", {
                      style: "currency",
                      currency: "BRL",
                      minimumFractionDigits: 4,
                    }).format(exchangeRate.rate)}{" "}
                    <span className="font-normal text-muted-foreground">
                      · {RATE_SOURCE_LABEL[exchangeRate.source]}
                    </span>
                  </strong>
                </>
              )}
            </div>
          ) : null}

          {syncStatus?.message ? (
            <p
              className={
                hasError
                  ? "rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
                  : "rounded-2xl border border-border/60 px-4 py-3 text-sm text-muted-foreground"
              }
            >
              {syncStatus.message}
            </p>
          ) : null}

          <div className="pt-2">
            <form action={syncMeta}>
              <FormPendingButton
                className="w-full gap-2 rounded-full"
                idleLabel="Atualizar dados da Meta"
                pendingLabel="Atualizando... pode levar alguns minutos"
              >
                <RefreshCw className="size-4 shrink-0" />
                <span>Atualizar dados da Meta</span>
              </FormPendingButton>
            </form>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              Atualiza campanhas, conjuntos, anúncios e métricas de todas as
              contas conectadas. As abas carregam o último snapshot salvo no
              Supabase, sem depender da Meta para abrir.
            </p>
          </div>

          {syncState.error ? (
            <p className="rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {syncState.error}
            </p>
          ) : null}
          {syncState.success ? (
            <p className="rounded-2xl border border-primary/20 bg-primary/10 px-4 py-3 text-sm text-primary">
              {syncState.success}
            </p>
          ) : null}
        </CardContent>
      </Card>

      {counters ? (
        <Card>
          <CardHeader>
            <CardTitle className="font-display text-2xl">
              Situação da operação
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <StatRow label="Clientes ativos" value={counters.activeClientCount} />
            <StatRow label="Clientes cadastrados" value={counters.clientCount} />
            <StatRow label="Clientes com acesso" value={counters.clientUserCount} />
            <StatRow label="Campanhas ativas" value={counters.activeCampaignCount} />
            <StatRow
              label="Campanhas cadastradas"
              value={counters.campaignCount}
            />
            <StatRow label="Permissões ativas" value={counters.permissionCount} />
          </CardContent>
        </Card>
      ) : null}

      </div>
    </>
  );
}
