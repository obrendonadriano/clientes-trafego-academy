"use client";

import Link from "next/link";
import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { ClientCreateForm } from "@/components/admin/client-create-form";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type {
  CampaignPermission,
  CampaignWithMetrics,
  Client,
  User,
} from "@/lib/types";

type AdminClientsPageProps = {
  clients: Client[];
  campaigns: CampaignWithMetrics[];
  permissions: CampaignPermission[];
  clientUsers: User[];
};

export function AdminClientsPage({
  clients,
  campaigns,
  permissions,
  clientUsers,
}: AdminClientsPageProps) {
  const [query, setQuery] = useState("");

  const clientCards = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return clients
      .filter(
        (client) =>
          !normalizedQuery ||
          client.companyName.toLowerCase().includes(normalizedQuery) ||
          client.contactName.toLowerCase().includes(normalizedQuery),
      )
      .map((client) => {
        const linkedUser = clientUsers.find(
          (clientUser) => clientUser.clientId === client.id,
        );
        const allowedCampaignCount = linkedUser
          ? permissions.filter((permission) => permission.userId === linkedUser.id)
              .length
          : 0;

        return { client, linkedUser, allowedCampaignCount };
      });
  }, [clientUsers, clients, permissions, query]);

  return (
    <div className="min-w-0 space-y-6 overflow-hidden">
      <div>
        <p className="text-sm uppercase tracking-[0.25em] text-muted-foreground">
          Clientes
        </p>
        <h3 className="mt-2 font-display text-3xl font-semibold text-foreground">
          Criar e editar clientes
        </h3>
        <p className="mt-2 max-w-3xl leading-7 text-muted-foreground">
          Esta área tem duas funções: cadastrar um novo cliente (empresa, acesso
          ao portal e campanhas em um único fluxo) e editar clientes existentes.
        </p>
      </div>

      <div className="grid min-w-0 gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <div className="min-w-0 xl:sticky xl:top-6 xl:self-start">
          <ClientCreateForm campaigns={campaigns} />
        </div>

        <Card className="min-w-0 overflow-hidden border-border/60 bg-background/60 xl:self-start">
          <CardHeader className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="font-display text-2xl">
                Clientes cadastrados
              </CardTitle>
              <Badge variant="secondary">{clients.length}</Badge>
            </div>
            <div className="relative min-w-0">
              <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-11"
                placeholder="Buscar por empresa ou responsável"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
          </CardHeader>
          <CardContent className="min-w-0 space-y-3 overflow-hidden">
            {clientCards.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border/60 px-4 py-8 text-center text-sm text-muted-foreground">
                {query
                  ? "Nenhum cliente encontrado com essa busca."
                  : "Nenhum cliente cadastrado ainda. Crie o primeiro ao lado."}
              </div>
            ) : null}
            {clientCards.map(({ client, linkedUser, allowedCampaignCount }) => (
              <div
                key={client.id}
                className="dashboard-row min-w-0 rounded-2xl border px-4 py-4"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-foreground">{client.companyName}</p>
                    <p className="text-sm text-muted-foreground">{client.contactName}</p>
                    <p className="mt-2 min-w-0 text-sm text-muted-foreground">
                      Login:{" "}
                      <strong className="break-all text-foreground">
                        {linkedUser?.email || "Ainda sem acesso criado"}
                      </strong>
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={client.active ? "success" : "secondary"}>
                      {client.active ? "Ativo" : "Inativo"}
                    </Badge>
                    <Link
                      href={`/admin/clientes/${client.id}`}
                      className="inline-flex h-9 items-center justify-center rounded-full border border-border/70 bg-background/50 px-4 text-sm font-medium text-foreground transition hover:bg-muted/70 dark:border-white/10 dark:bg-white/[0.035] dark:hover:bg-white/[0.08]"
                    >
                      Editar
                    </Link>
                  </div>
                </div>
                <div className="mt-3 flex min-w-0 flex-wrap gap-2 text-xs text-muted-foreground">
                  <span className="max-w-full break-words rounded-full bg-muted/70 dark:bg-white/[0.045] px-3 py-1">
                    {allowedCampaignCount} campanha
                    {allowedCampaignCount === 1 ? "" : "s"} liberada
                    {allowedCampaignCount === 1 ? "" : "s"}
                  </span>
                  <span className="max-w-full break-all rounded-full bg-muted/70 dark:bg-white/[0.045] px-3 py-1">
                    {client.whatsapp}
                  </span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
