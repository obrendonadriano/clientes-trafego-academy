"use client";

import { cn } from "@/lib/utils";

export type CampaignLevel = "campaign" | "adset" | "ad";

const TABS: Array<{ value: CampaignLevel; label: string }> = [
  { value: "campaign", label: "Campanhas" },
  { value: "adset", label: "Conjuntos de anúncios" },
  { value: "ad", label: "Anúncios" },
];

type CampaignLevelTabsProps = {
  activeLevel: CampaignLevel;
  onLevelChange: (level: CampaignLevel) => void;
};

export function CampaignLevelTabs({
  activeLevel,
  onLevelChange,
}: CampaignLevelTabsProps) {

  return (
    <nav
      aria-label="Nível dos dados de campanhas"
      className="scrollbar-hidden min-w-0 overflow-x-auto overflow-y-hidden border-b border-border/70 dark:border-white/10"
    >
      <div className="flex min-w-max items-end gap-6 px-1 sm:gap-8">
        {TABS.map((tab) => {
          const isActive = activeLevel === tab.value;

          return (
            <button
              key={tab.value}
              type="button"
              onClick={() => onLevelChange(tab.value)}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "-mb-px shrink-0 whitespace-nowrap border-b-2 px-0.5 py-3 text-sm transition sm:text-base",
                isActive
                  ? "border-primary font-semibold text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
