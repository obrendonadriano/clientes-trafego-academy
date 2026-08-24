"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { ChevronDown, LoaderCircle } from "lucide-react";
import {
  CampaignMultiSelect,
  type CampaignSelectionOption,
} from "@/components/admin/campaign-multi-select";
import { cn } from "@/lib/utils";

type ClosingCampaignFilterProps = {
  campaigns: CampaignSelectionOption[];
  selectedIds: string[];
  hasFilter: boolean;
};

export function ClosingCampaignFilter({
  campaigns,
  selectedIds,
  hasFilter,
}: ClosingCampaignFilterProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [draft, setDraft] = useState(selectedIds);

  const allSelected =
    campaigns.length > 0 && draft.length === campaigns.length;
  const activeLabel = hasFilter
    ? `${selectedIds.length} de ${campaigns.length} selecionada${selectedIds.length === 1 ? "" : "s"}`
    : `Todas as campanhas (${campaigns.length})`;

  function applyCampaigns() {
    if (draft.length === 0) {
      return;
    }

    const params = new URLSearchParams(searchParams.toString());
    params.delete("campanha");

    // Ausência do parâmetro significa "todas" e mantém a URL curta.
    if (!allSelected) {
      for (const id of draft) {
        params.append("campanha", id);
      }
    }

    startTransition(() => {
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    });
  }

  if (campaigns.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border/60 px-4 py-3 text-sm text-muted-foreground">
        Nenhuma campanha teve investimento nos dias escolhidos.
      </div>
    );
  }

  return (
    <details className="group rounded-2xl border border-border/60 bg-background/40 dark:border-white/10 dark:bg-black/15">
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 marker:content-none">
        <span className="min-w-0">
          <span className="block text-xs text-muted-foreground">
            Campanhas do fechamento
          </span>
          <span className="block truncate text-sm font-medium text-foreground">
            {activeLabel}
          </span>
        </span>
        <ChevronDown
          className="size-4 shrink-0 text-muted-foreground transition group-open:rotate-180"
          aria-hidden="true"
        />
      </summary>

      <div className="space-y-3 border-t border-border/60 p-4 dark:border-white/10">
        <CampaignMultiSelect
          campaigns={campaigns}
          value={draft}
          onChange={setDraft}
          inputName={null}
          dense
        />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="text-muted-foreground">
              {draft.length} de {campaigns.length} selecionada
              {draft.length === 1 ? "" : "s"}
            </span>
            <button
              type="button"
              onClick={() => setDraft(campaigns.map((campaign) => campaign.id))}
              className="font-medium text-primary transition hover:opacity-80"
            >
              Selecionar todas
            </button>
          </div>

          <button
            type="button"
            onClick={applyCampaigns}
            disabled={draft.length === 0 || isPending}
            className={cn(
              "inline-flex h-10 items-center gap-2 rounded-full bg-primary px-5 text-sm font-medium text-white transition hover:bg-primary/90",
              "disabled:cursor-not-allowed disabled:opacity-50",
            )}
          >
            {isPending ? (
              <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
            ) : null}
            Aplicar campanhas
          </button>
        </div>

        {draft.length === 0 ? (
          <p className="text-xs text-destructive">
            Selecione ao menos uma campanha para fazer o fechamento.
          </p>
        ) : null}
      </div>
    </details>
  );
}
