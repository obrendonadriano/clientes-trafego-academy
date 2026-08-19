"use client";

import type { ComponentProps } from "react";
import { ComparisonChart } from "@/components/dashboard/comparison-chart";
import { PerformanceChart } from "@/components/dashboard/performance-chart";

type DashboardChartProps =
  | ({ kind: "performance" } & ComponentProps<typeof PerformanceChart>)
  | ({ kind: "comparison" } & ComponentProps<typeof ComparisonChart>);

// Um único boundary dinâmico compartilha o runtime pesado do Recharts entre
// as duas visualizações usadas no dashboard.
export function DashboardChart(props: DashboardChartProps) {
  if (props.kind === "performance") {
    return (
      <PerformanceChart
        data={props.data}
        periodLabel={props.periodLabel}
        emptyMessage={props.emptyMessage}
      />
    );
  }

  return (
    <ComparisonChart
      current={props.current}
      previous={props.previous}
      periodLabel={props.periodLabel}
    />
  );
}
