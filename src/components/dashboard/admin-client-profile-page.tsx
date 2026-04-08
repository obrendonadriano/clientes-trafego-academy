"use client";

import Link from "next/link";
import { useActionState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  deleteClientWorkspaceAction,
  type AdminActionState,
  updateClientWorkspaceAction,
} from "@/app/admin/actions";
import { CampaignMultiSelect } from "@/components/admin/campaign-multi-select";
import { MetricCard } from "@/components/dashboard/metric-card";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FormPendingButton } from "@/components/ui/form-pending-button";
import { summarizeMetrics } from "@/lib/dashboard-metrics";
import type { CampaignWithMetrics, Client, RawCampaignMetric, User } from "@/lib/types";

type AdminClientProfilePageProps = {
  client: Client;
  linkedUser: User | null;
  selectedCampaignIds: string[];
  allCampaigns: CampaignWithMetrics[];
  metricRows: RawCampaignMetric[];
};

const initialState: AdminActionState = {};

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatMultiplier(value: number) {
  return `${value.toFixed(2).replace(".", ",")}x`;
}

export function AdminClientProfilePage({
  client,
  linkedUser,
  selectedCampaignIds,
  allCampaigns,
  metricRows,
}: AdminClientProfilePageProps) {
  const router = useRouter();
  const [updateState, updateAction] = useActionState(updateClientWorkspaceAction, initialState);
  const [deleteState, deleteAction] = useActionState(deleteClientWorkspaceAction, initialState);

  const summary = useMemo(() => summarizeMetrics(metricRows), [metricRows]);
  const selectedCampaigns = useMemo(
    () => allCampaigns.filter((campaign) => selectedCampaignIds.includes(campaign.id)),
    [allCampaigns, selectedCampaignIds],
  );

  useEffect(() => {
    if (deleteState.success) {
      router.replace("/admin/clientes");
      router.refresh();
    }
  }, [deleteState.success, router]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.25em] text-muted-foreground">
            Perfil do cliente
          </p>
          <h3 className="mt-2 font-display text-3xl font-semibold">
            {client.companyName}
          </h3>
          <p className="mt-2 max-w-3xl text-muted-foreground">
            Edite dados da empresa, credenciais do portal e campanhas liberadas em uma única página.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Badge variant={client.active ? "success" : "secondary"}>
            {client.active ? "Cliente ativo" : "Cliente inativo"}
          </Badge>
          <Link
            href="/admin/clientes"
            className="inline-flex h-11 items-center justify-center rounded-full border border-border px-5 text-sm font-medium text-foreground transition hover:bg-accent"
          >
            Voltar para clientes
          </Link>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Campanhas liberadas"
          value={String(selectedCampaigns.length)}
          change="acessos configurados"
        />
        <MetricCard
          label="Investimento"
          value={formatCurrency(summary.amountSpent)}
          change="somando campanhas permitidas"
        />
        <MetricCard
          label="Leads"
          value={String(Math.round(summary.leads))}
          change="dados da carteira liberada"
        />
        <MetricCard
          label="ROAS médio"
          value={formatMultiplier(summary.roas)}
          change={linkedUser?.active ? "login ativo" : "login inativo"}
          positive={Boolean(linkedUser?.active)}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <Card className="border-border/60 bg-background/60">
          <CardHeader>
            <CardTitle className="font-display text-2xl">Editar cliente</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={updateAction} className="space-y-6">
              <input type="hidden" name="clientId" value={client.id} />
              <input type="hidden" name="userId" value={linkedUser?.id ?? ""} />
              <input type="hidden" name="authUserId" value={linkedUser?.authUserId ?? ""} />

              <div className="space-y-4">
                <div>
                  <p className="text-sm font-medium text-foreground">Empresa</p>
                  <div className="mt-3 grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="companyName">Nome da empresa</Label>
                      <Input id="companyName" name="companyName" defaultValue={client.companyName} required />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="contactName">Responsável</Label>
                      <Input id="contactName" name="contactName" defaultValue={client.contactName} required />
                    </div>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="whatsapp">WhatsApp</Label>
                    <Input id="whatsapp" name="whatsapp" defaultValue={client.whatsapp} required />
                  </div>
                  <label className="flex items-center gap-3 rounded-2xl border border-border/60 bg-card/60 px-4 py-3 text-sm text-foreground">
                    <input
                      type="checkbox"
                      name="clientActive"
                      defaultChecked={client.active}
                      className="size-4 rounded border-border"
                    />
                    Cliente ativo
                  </label>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="notes">Observações</Label>
                  <Textarea id="notes" name="notes" defaultValue={client.notes} />
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between gap-4">
                  <p className="text-sm font-medium text-foreground">Acesso ao portal</p>
                  <Badge variant={linkedUser?.active ? "success" : "secondary"}>
                    {linkedUser ? "Acesso existente" : "Acesso ainda não criado"}
                  </Badge>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="accountName">Nome exibido</Label>
                    <Input
                      id="accountName"
                      name="accountName"
                      defaultValue={linkedUser?.name ?? client.contactName}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="username">Login</Label>
                    <Input
                      id="username"
                      name="username"
                      defaultValue={linkedUser?.username ?? ""}
                      required
                    />
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      name="email"
                      type="email"
                      defaultValue={linkedUser?.email ?? ""}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password">
                      {linkedUser ? "Nova senha" : "Senha inicial"}
                    </Label>
                    <Input
                      id="password"
                      name="password"
                      type="password"
                      placeholder={linkedUser ? "Preencha só se quiser alterar" : "Defina a senha de acesso"}
                    />
                  </div>
                </div>

                <label className="flex items-center gap-3 rounded-2xl border border-border/60 bg-card/60 px-4 py-3 text-sm text-foreground">
                  <input
                    type="checkbox"
                    name="accessActive"
                    defaultChecked={linkedUser?.active ?? true}
                    className="size-4 rounded border-border"
                  />
                  Login ativo para o cliente
                </label>
              </div>

              <div className="space-y-3">
                <p className="text-sm font-medium text-foreground">
                  Campanhas liberadas para esse cliente
                </p>
                <CampaignMultiSelect
                  campaigns={allCampaigns}
                  selectedIds={selectedCampaignIds}
                />
              </div>

              {updateState.error ? (
                <p className="rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                  {updateState.error}
                </p>
              ) : null}

              {updateState.success ? (
                <p className="rounded-2xl border border-primary/20 bg-primary/10 px-4 py-3 text-sm text-primary">
                  {updateState.success}
                </p>
              ) : null}

              <div className="flex flex-wrap gap-3">
                <FormPendingButton size="lg" idleLabel="Salvar alterações" pendingLabel="Salvando alterações...">
                  Salvar alterações
                </FormPendingButton>
              </div>
            </form>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="border-border/60 bg-background/60">
            <CardHeader>
              <CardTitle className="font-display text-2xl">Resumo do perfil</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <div className="rounded-2xl border border-border/60 bg-card px-4 py-3">
                Login atual:{" "}
                <strong className="text-foreground">
                  {linkedUser?.email ?? "Ainda sem acesso criado"}
                </strong>
              </div>
              <div className="rounded-2xl border border-border/60 bg-card px-4 py-3">
                WhatsApp: <strong className="text-foreground">{client.whatsapp}</strong>
              </div>
              <div className="rounded-2xl border border-border/60 bg-card px-4 py-3">
                Campanhas selecionadas:{" "}
                <strong className="text-foreground">{selectedCampaigns.length}</strong>
              </div>
              <div className="rounded-2xl border border-border/60 bg-card px-4 py-3">
                Leads somados:{" "}
                <strong className="text-foreground">{Math.round(summary.leads)}</strong>
              </div>
            </CardContent>
          </Card>

          <Card className="border-destructive/30 bg-background/60">
            <CardHeader>
              <CardTitle className="font-display text-2xl text-destructive">
                Excluir cliente
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Esta ação remove o cliente, o usuário de acesso e as permissões vinculadas.
              </p>

              {deleteState.error ? (
                <p className="rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                  {deleteState.error}
                </p>
              ) : null}

              {deleteState.success ? (
                <p className="rounded-2xl border border-primary/20 bg-primary/10 px-4 py-3 text-sm text-primary">
                  {deleteState.success}
                </p>
              ) : null}

              <form action={deleteAction} className="space-y-3">
                <input type="hidden" name="clientId" value={client.id} />
                <input type="hidden" name="userId" value={linkedUser?.id ?? ""} />
                <input type="hidden" name="authUserId" value={linkedUser?.authUserId ?? ""} />
                <FormPendingButton
                  variant="outline"
                  className="w-full rounded-2xl border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                  idleLabel="Excluir cliente"
                  pendingLabel="Excluindo cliente..."
                >
                  Excluir cliente
                </FormPendingButton>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
