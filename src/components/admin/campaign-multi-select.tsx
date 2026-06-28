"use client";

import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { CampaignWithMetrics } from "@/lib/types";

type CampaignMultiSelectProps = {
  campaigns: CampaignWithMetrics[];
  // Modo não-controlado: seleção inicial gerenciada internamente.
  selectedIds?: string[];
  // Modo controlado: o pai é dono da seleção (value + onChange).
  value?: string[];
  onChange?: (ids: string[]) => void;
  inputName?: string;
  showSelectionSummary?: boolean;
  // Lista mais baixa para painéis estreitos (ex.: gerar relatório).
  dense?: boolean;
};

export function CampaignMultiSelect({
  campaigns,
  selectedIds = [],
  value,
  onChange,
  inputName = "campaignIds",
  showSelectionSummary = false,
  dense = false,
}: CampaignMultiSelectProps) {
  const [query, setQuery] = useState("");
  const [internalSelected, setInternalSelected] = useState<string[]>(selectedIds);
  const isControlled = value !== undefined;
  const selected = isControlled ? value : internalSelected;

  const filteredCampaigns = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    if (!normalizedQuery) {
      return campaigns;
    }

    return campaigns.filter((campaign) =>
      campaign.name.toLowerCase().includes(normalizedQuery),
    );
  }, [campaigns, query]);

  function setSelection(ids: string[]) {
    if (isControlled) {
      onChange?.(ids);
    } else {
      setInternalSelected(ids);
    }
  }

  function toggleCampaign(campaignId: string) {
    setSelection(
      selected.includes(campaignId)
        ? selected.filter((id) => id !== campaignId)
        : [...selected, campaignId],
    );
  }

  const allSelected =
    campaigns.length > 0 && campaigns.every((campaign) => selected.includes(campaign.id));

  return (
    <div className="min-w-0 space-y-3">
      <Input
        placeholder="Pesquisar campanha por nome"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />

      {showSelectionSummary ? (
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
          <span>
            {selected.length} de {campaigns.length} campanha
            {campaigns.length === 1 ? "" : "s"} selecionada
            {selected.length === 1 ? "" : "s"}
          </span>
          <button
            type="button"
            className="font-medium text-primary transition hover:opacity-80"
            onClick={() =>
              setSelection(allSelected ? [] : campaigns.map((campaign) => campaign.id))
            }
          >
            {allSelected ? "Limpar seleção" : "Selecionar todas"}
          </button>
        </div>
      ) : null}

      {/* A seleção é submetida via hidden inputs para não depender dos
          checkboxes visíveis (a busca desmonta os que não correspondem). */}
      {selected.map((id) => (
        <input key={id} type="hidden" name={inputName} value={id} />
      ))}

      <div className="dashboard-row min-w-0 rounded-[1.35rem] border p-2">
        <div
          className={cn(
            "space-y-2 overflow-y-auto pr-1",
            dense ? "max-h-[228px]" : "max-h-[320px]",
          )}
        >
          {filteredCampaigns.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border/70 dark:border-white/10 px-4 py-6 text-sm text-muted-foreground">
              Nenhuma campanha encontrada com esse nome.
            </div>
          ) : (
            filteredCampaigns.map((campaign) => {
              const checked = selected.includes(campaign.id);

              return (
                <label
                  key={campaign.id}
                  className="flex cursor-pointer items-start gap-3 rounded-2xl border border-border/70 bg-background/50 px-4 py-3 transition hover:border-primary/35 hover:bg-muted/70 dark:border-white/10 dark:bg-black/20 dark:hover:bg-white/[0.045]"
                >
                  <input
                    type="checkbox"
                    value={campaign.id}
                    checked={checked}
                    onChange={() => toggleCampaign(campaign.id)}
                    className="mt-1 size-4 rounded border-border"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="break-words font-medium text-foreground">{campaign.name}</p>
                    <p className="break-words text-sm text-muted-foreground">
                      {campaign.clientName || "Sem cliente"} • {campaign.platform}
                    </p>
                  </div>
                </label>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
