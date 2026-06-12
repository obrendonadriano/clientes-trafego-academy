"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { MetricTotals } from "@/lib/dashboard-metrics";

type ComparisonChartProps = {
  current: MetricTotals;
  previous: MetricTotals;
  periodLabel?: string;
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(value);
}

// Comparativo do período atual vs anterior em barras. Investimento usa escala
// própria (eixo esquerdo); leads e cliques compartilham o eixo direito.
export function ComparisonChart({
  current,
  previous,
  periodLabel = "Período atual vs anterior",
}: ComparisonChartProps) {
  const data = [
    {
      label: "Investimento",
      atual: Number(current.amountSpent.toFixed(2)),
      anterior: Number(previous.amountSpent.toFixed(2)),
      isCurrency: true,
    },
    {
      label: "Leads",
      atual: Math.round(current.leads),
      anterior: Math.round(previous.leads),
      isCurrency: false,
    },
    {
      label: "Cliques",
      atual: Math.round(current.clicks),
      anterior: Math.round(previous.clicks),
      isCurrency: false,
    },
  ];

  const hasAnyData = data.some((item) => item.atual > 0 || item.anterior > 0);

  return (
    <div className="dashboard-card rounded-[1.5rem] border p-4 text-foreground">
      <div className="mb-4">
        <p className="text-sm leading-6 text-muted-foreground">{periodLabel}</p>
        <h3 className="mt-1 font-display text-2xl font-semibold">
          Comparativo de períodos
        </h3>
      </div>
      <div className="h-[260px]">
        {hasAnyData ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
              <CartesianGrid vertical={false} stroke="rgba(148,163,184,0.15)" />
              <XAxis
                dataKey="label"
                axisLine={false}
                tickLine={false}
                tick={{ fill: "currentColor", fontSize: 12 }}
              />
              <YAxis hide />
              <Tooltip
                cursor={{ fill: "rgba(148,163,184,0.08)" }}
                formatter={(value, name, item) => {
                  const formatted = item?.payload?.isCurrency
                    ? formatCurrency(Number(value))
                    : Number(value).toLocaleString("pt-BR");

                  return [formatted, name === "atual" ? "Período atual" : "Período anterior"];
                }}
                contentStyle={{
                  borderRadius: 18,
                  border: "1px solid rgba(148,163,184,0.18)",
                  background: "rgba(9,18,29,0.92)",
                  color: "#f8fafc",
                }}
              />
              <Legend
                formatter={(value) =>
                  value === "atual" ? "Período atual" : "Período anterior"
                }
                wrapperStyle={{ fontSize: 12 }}
              />
              <Bar dataKey="anterior" fill="rgba(125,104,245,0.35)" radius={[8, 8, 0, 0]} />
              <Bar dataKey="atual" fill="#7d68f5" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-full items-center justify-center rounded-[1.25rem] border border-dashed border-border/70 bg-background/50 px-6 text-center text-sm leading-6 text-muted-foreground dark:border-white/[0.12] dark:bg-white/[0.035]">
            Ative a comparação com o período anterior para visualizar este gráfico.
          </div>
        )}
      </div>
    </div>
  );
}
