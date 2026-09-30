"use client";

import { Suspense, use } from "react";
import { AdLevelTable } from "@/components/dashboard/ad-level-table";
import { TableSkeleton } from "@/components/dashboard/skeletons";
import type { AdLevelData } from "@/lib/data/ad-levels";

type AdLevelPanelProps = {
  level: "adset" | "ad";
  // Ainda em andamento no servidor: a página abre com as campanhas e os
  // conjuntos/anúncios chegam por streaming, sem segurar o primeiro paint.
  data: Promise<AdLevelData>;
  editable?: boolean;
};

function AdLevelContent({ level, data, editable }: AdLevelPanelProps) {
  const { rows, notice } = use(data);
  return <AdLevelTable level={level} rows={rows} notice={notice} editable={editable} />;
}

export function AdLevelPanel(props: AdLevelPanelProps) {
  return (
    <Suspense fallback={<TableSkeleton rows={4} />}>
      <AdLevelContent {...props} />
    </Suspense>
  );
}
