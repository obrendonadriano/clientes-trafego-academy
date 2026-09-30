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
      atual: Number(current.amountSpentWithTax.toFixed(2)),
      anterior: Number(previous.amountSpentWithTax.toFixed(2)),
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
    <div className="flex min-w-0 flex-col gap-4 rounded-[18px] border border-border bg-card p-5 text-foreground sm:p-6">
      <div>
        <h3 className="text-base font-semibold tracking-[-0.01em]">
          Comparativo de períodos
        </h3>
        <p className="mt-0.5 text-[13px] text-muted-foreground">{periodLabel}</p>
      </div>
      <div className="h-[240px]">
        {hasAnyData ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
              <CartesianGrid vertical={false} stroke="#f2f4f7" />
              <XAxis
                dataKey="label"
                axisLine={false}
                tickLine={false}
                tick={{ fill: "#475467", fontSize: 12.5 }}
              />
              <YAxis hide />
              <Tooltip
                cursor={{ fill: "rgba(106,69,232,0.05)" }}
                formatter={(value, name, item) => {
                  const formatted = item?.payload?.isCurrency
                    ? formatCurrency(Number(value))
                    : Number(value).toLocaleString("pt-BR");

                  return [formatted, name === "atual" ? "Período atual" : "Período anterior"];
                }}
                contentStyle={{
                  borderRadius: 10,
                  border: "none",
                  background: "#111827",
                  color: "#ffffff",
                  fontSize: 12,
                  padding: "8px 12px",
                  boxShadow: "0 10px 24px -8px rgba(0,0,0,0.35)",
                }}
                labelStyle={{ color: "#98a2b3", fontSize: 11, marginBottom: 2 }}
                itemStyle={{ color: "#ffffff", padding: 0 }}
              />
              <Legend
                formatter={(value) =>
                  value === "atual" ? "Período atual" : "Período anterior"
                }
                iconType="circle"
                iconSize={8}
                wrapperStyle={{ fontSize: 12.5, color: "#475467" }}
              />
              <Bar dataKey="anterior" fill="#d9cfff" radius={[6, 6, 2, 2]} maxBarSize={56} />
              <Bar dataKey="atual" fill="#6a45e8" radius={[6, 6, 2, 2]} maxBarSize={56} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-input bg-surface-2 px-6 text-center text-sm leading-6 text-muted-foreground">
            Ative a comparação com o período anterior para visualizar este gráfico.
          </div>
        )}
      </div>
    </div>
  );
}
