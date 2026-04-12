"use client";

import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import type { CampaignWithMetrics } from "@/lib/types";

type CampaignMultiSelectProps = {
  campaigns: CampaignWithMetrics[];
  selectedIds?: string[];
  inputName?: string;
};

export function CampaignMultiSelect({
  campaigns,
  selectedIds = [],
  inputName = "campaignIds",
}: CampaignMultiSelectProps) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>(selectedIds);

  const filteredCampaigns = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    if (!normalizedQuery) {
      return campaigns;
    }

    return campaigns.filter((campaign) =>
      campaign.name.toLowerCase().includes(normalizedQuery),
    );
  }, [campaigns, query]);

  function toggleCampaign(campaignId: string) {
    setSelected((current) =>
      current.includes(campaignId)
        ? current.filter((id) => id !== campaignId)
        : [...current, campaignId],
    );
  }

  return (
    <div className="min-w-0 space-y-3 overflow-hidden">
      <Input
        placeholder="Pesquisar campanha por nome"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />

      <div className="min-w-0 overflow-hidden rounded-3xl border border-border/60 bg-card/60 p-2">
        <div className="max-h-[320px] space-y-2 overflow-y-auto pr-1">
          {filteredCampaigns.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border/60 px-4 py-6 text-sm text-muted-foreground">
              Nenhuma campanha encontrada com esse nome.
            </div>
          ) : (
            filteredCampaigns.map((campaign) => {
              const checked = selected.includes(campaign.id);

              return (
                <label
                  key={campaign.id}
                  className="flex cursor-pointer items-start gap-3 rounded-2xl border border-border/60 bg-background/60 px-4 py-3 transition hover:border-primary/30"
                >
                  <input
                    type="checkbox"
                    name={inputName}
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
