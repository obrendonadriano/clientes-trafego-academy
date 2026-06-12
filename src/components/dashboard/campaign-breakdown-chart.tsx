"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export type CampaignBreakdownPoint = {
  name: string;
  amountSpent: number;
  leads: number;
};

type CampaignBreakdownChartProps = {
  data: CampaignBreakdownPoint[];
  periodLabel?: string;
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(value);
}

function truncate(value: string, max = 28) {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

// Barras horizontais com o investimento por campanha (top campanhas do
// período), para comparar rapidamente onde o orçamento está alocado.
export function CampaignBreakdownChart({
  data,
  periodLabel = "Distribuição por campanha",
}: CampaignBreakdownChartProps) {
  const chartData = data
    .filter((item) => item.amountSpent > 0)
    .slice(0, 8)
    .map((item) => ({ ...item, shortName: truncate(item.name) }));

  const height = Math.max(220, chartData.length * 44 + 60);

  return (
    <div className="dashboard-card rounded-[1.5rem] border p-4 text-foreground">
      <div className="mb-4">
        <p className="text-sm leading-6 text-muted-foreground">{periodLabel}</p>
        <h3 className="mt-1 font-display text-2xl font-semibold">
          Investimento por campanha
        </h3>
      </div>
      {chartData.length > 0 ? (
        <div style={{ height }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              layout="vertical"
              margin={{ top: 8, right: 16, left: 8, bottom: 8 }}
            >
              <CartesianGrid horizontal={false} stroke="rgba(148,163,184,0.15)" />
              <XAxis
                type="number"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 12 }}
                tickFormatter={(value) =>
                  value >= 1000 ? `${Math.round(Number(value) / 1000)}k` : String(value)
                }
              />
              <YAxis
                type="category"
                dataKey="shortName"
                width={170}
                axisLine={false}
                tickLine={false}
                tick={{ fill: "currentColor", fontSize: 12 }}
              />
              <Tooltip
                cursor={{ fill: "rgba(148,163,184,0.08)" }}
                formatter={(value, name) =>
                  name === "amountSpent"
                    ? [formatCurrency(Number(value)), "Investimento"]
                    : [Number(value).toLocaleString("pt-BR"), "Leads"]
                }
                labelFormatter={(label, payload) =>
                  payload?.[0]?.payload?.name ?? String(label)
                }
                contentStyle={{
                  borderRadius: 18,
                  border: "1px solid rgba(148,163,184,0.18)",
                  background: "rgba(9,18,29,0.92)",
                  color: "#f8fafc",
                }}
              />
              <Bar dataKey="amountSpent" fill="#7d68f5" radius={[0, 8, 8, 0]} barSize={18} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="flex h-[220px] items-center justify-center rounded-[1.25rem] border border-dashed border-border/70 bg-background/50 px-6 text-center text-sm leading-6 text-muted-foreground dark:border-white/[0.12] dark:bg-white/[0.035]">
          Nenhuma campanha com investimento no período selecionado.
        </div>
      )}
    </div>
  );
}
