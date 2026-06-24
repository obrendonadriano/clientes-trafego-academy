"use client";

import { useMemo, useState, useTransition } from "react";
import { Check, LoaderCircle } from "lucide-react";
import {
  renameCampaignAction,
  toggleCampaignStatusAction,
} from "@/app/admin/campanhas/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import type { CampaignWithMetrics } from "@/lib/types";

type CampaignManagerProps = {
  campaigns: CampaignWithMetrics[];
};

type RowFeedback = { type: "success" | "error"; message: string } | null;

function CampaignRow({ campaign }: { campaign: CampaignWithMetrics }) {
  const [name, setName] = useState(campaign.name);
  const [active, setActive] = useState(campaign.status === "Ativa");
  const [feedback, setFeedback] = useState<RowFeedback>(null);
  const [isRenaming, startRename] = useTransition();
  const [isToggling, startToggle] = useTransition();

  const nameChanged = name.trim() !== campaign.name && name.trim().length > 0;

  function handleRename() {
    setFeedback(null);
    startRename(async () => {
      const result = await renameCampaignAction(campaign.id, name);
      setFeedback(
        result.error
          ? { type: "error", message: result.error }
          : { type: "success", message: result.success ?? "Salvo." },
      );
    });
  }

  function handleToggle(next: boolean) {
    setActive(next);
    setFeedback(null);
    startToggle(async () => {
      const result = await toggleCampaignStatusAction(campaign.id, next);
      if (result.error) {
        setActive(!next); // reverte ao estado anterior em caso de erro
        setFeedback({ type: "error", message: result.error });
      } else {
        setFeedback({ type: "success", message: result.success ?? "Atualizado." });
      }
    });
  }

  return (
    <div className="rounded-2xl border border-border/60 bg-background/60 px-4 py-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center">
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            disabled={isRenaming}
            className="min-w-0"
          />
          {nameChanged ? (
            <Button
              type="button"
              variant="outline"
              className="shrink-0 gap-2 rounded-full"
              onClick={handleRename}
              disabled={isRenaming}
            >
              {isRenaming ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <Check className="size-4" />
              )}
              Salvar
            </Button>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-3">
          <Badge variant={active ? "success" : "secondary"}>
            {active ? "Ativa" : "Pausada"}
          </Badge>
          {isToggling ? (
            <LoaderCircle className="size-4 animate-spin text-muted-foreground" />
          ) : null}
          <Switch
            checked={active}
            disabled={isToggling}
            onChange={(event) => handleToggle(event.target.checked)}
            aria-label={active ? "Desativar campanha" : "Ativar campanha"}
          />
        </div>
      </div>

      {feedback ? (
        <p
          className={
            feedback.type === "error"
              ? "mt-2 text-xs text-destructive"
              : "mt-2 text-xs text-primary"
          }
        >
          {feedback.message}
        </p>
      ) : null}
    </div>
  );
}

export function CampaignManager({ campaigns }: CampaignManagerProps) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return campaigns;
    }
    return campaigns.filter((campaign) =>
      campaign.name.toLowerCase().includes(normalized),
    );
  }, [campaigns, query]);

  return (
    <div className="dashboard-card rounded-[1.5rem] border p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">Gerenciar</p>
          <h4 className="mt-1 font-display text-2xl font-semibold text-foreground">
            Nome e status das campanhas
          </h4>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Editar o nome ou ligar/desligar o interruptor reflete direto na Meta Ads.
          </p>
        </div>
        <Input
          placeholder="Buscar campanha"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="sm:max-w-xs"
        />
      </div>

      <div className="mt-4 space-y-3">
        {filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border/60 px-4 py-8 text-center text-sm text-muted-foreground">
            Nenhuma campanha encontrada.
          </div>
        ) : (
          filtered.map((campaign) => (
            <CampaignRow key={campaign.id} campaign={campaign} />
          ))
        )}
      </div>
    </div>
  );
}
