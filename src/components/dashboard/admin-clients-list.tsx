"use client";

import Link from "next/link";
import { ChevronRight, Hash, Mail, Megaphone, Phone, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import type {
  CampaignPermission,
  CampaignWithMetrics,
  Client,
  User,
} from "@/lib/types";

export type ClientsFilter = "todos" | "sem-acesso";

type AdminClientsListProps = {
  clients: Client[];
  permissions: CampaignPermission[];
  clientUsers: User[];
  campaigns: CampaignWithMetrics[];
  // Vem da sub-aba ativa (?filtro=sem-acesso).
  filter?: ClientsFilter;
};

export function AdminClientsList({
  clients,
  permissions,
  clientUsers,
  campaigns,
  filter = "todos",
}: AdminClientsListProps) {
  const [query, setQuery] = useState("");

  const clientCards = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const automaticCampaignIdsByClient = new Map<string, Set<string>>();

    for (const campaign of campaigns) {
      if (!campaign.clientId) {
        continue;
      }

      const ids = automaticCampaignIdsByClient.get(campaign.clientId) ?? new Set();
      ids.add(campaign.id);
      automaticCampaignIdsByClient.set(campaign.clientId, ids);
    }

    return clients
      .map((client) => {
        const linkedUser = clientUsers.find(
          (clientUser) => clientUser.clientId === client.id,
        );
        const manualCampaignIds = linkedUser
          ? permissions
              .filter((permission) => permission.userId === linkedUser.id)
              .map((permission) => permission.campaignId)
          : [];
        const automaticCampaignIds = automaticCampaignIdsByClient.get(client.id) ?? [];
        const allowedCampaignCount = new Set([
          ...manualCampaignIds,
          ...automaticCampaignIds,
        ]).size;

        return { client, linkedUser, allowedCampaignCount };
      })
      .filter(({ client, linkedUser }) => {
        if (filter === "sem-acesso" && linkedUser) {
          return false;
        }

        return (
          !normalizedQuery ||
          client.companyName.toLowerCase().includes(normalizedQuery) ||
          client.contactName.toLowerCase().includes(normalizedQuery)
        );
      });
  }, [campaigns, clientUsers, clients, filter, permissions, query]);

  return (
    <div className="min-w-0 space-y-4 overflow-hidden">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-0 flex-1 sm:max-w-md">
          <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-11"
            placeholder="Buscar por empresa ou responsável"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <Badge variant="secondary">
          {clientCards.length} {clientCards.length === 1 ? "cliente" : "clientes"}
        </Badge>
      </div>

      {clientCards.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border/60 px-4 py-12 text-center text-sm text-muted-foreground">
          {query
            ? "Nenhum cliente encontrado com essa busca."
            : filter === "sem-acesso"
              ? "Todos os clientes já têm acesso ao portal."
              : "Nenhum cliente cadastrado ainda. Use a aba Novo cliente."}
        </div>
      ) : null}

      <div className="grid min-w-0 gap-3 xl:grid-cols-2">
        {clientCards.map(({ client, linkedUser, allowedCampaignCount }) => (
          <Link
            key={client.id}
            href={`/admin/clientes/${client.id}`}
            aria-label={`Editar cliente ${client.companyName}`}
            className="dashboard-row group block min-w-0 rounded-2xl border p-4 transition hover:border-primary/40 hover:bg-muted/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
          >
            <div className="flex min-w-0 items-start gap-3">
              <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-primary/12 font-display text-lg font-semibold text-primary">
                {client.companyName.charAt(0).toUpperCase()}
              </span>

              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-foreground">
                      {client.companyName}
                    </p>
                    <p className="truncate text-sm text-muted-foreground">
                      {client.contactName}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <Badge variant={client.active ? "success" : "secondary"}>
                      {client.active ? "Ativo" : "Inativo"}
                    </Badge>
                    <ChevronRight className="size-4 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-primary" />
                  </div>
                </div>

                <div className="mt-3 flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
                  <Mail className="size-3.5 shrink-0" />
                  <span className="min-w-0 truncate break-all">
                    {linkedUser?.email || "Ainda sem acesso criado"}
                  </span>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-muted/70 px-3 py-1 text-xs text-muted-foreground dark:bg-white/[0.045]">
                    <Megaphone className="size-3.5 shrink-0" />
                    {allowedCampaignCount} campanha
                    {allowedCampaignCount === 1 ? "" : "s"}
                  </span>
                  <span className="inline-flex max-w-full items-center gap-1.5 break-all rounded-full bg-muted/70 px-3 py-1 text-xs text-muted-foreground dark:bg-white/[0.045]">
                    <Phone className="size-3.5 shrink-0" />
                    {client.whatsapp}
                  </span>
                  {client.campaignCode ? (
                    <span className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-muted/70 px-3 py-1 text-xs text-muted-foreground dark:bg-white/[0.045]">
                      <Hash className="size-3.5 shrink-0" />
                      Codigo {client.campaignCode}
                    </span>
                  ) : null}
                </div>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
