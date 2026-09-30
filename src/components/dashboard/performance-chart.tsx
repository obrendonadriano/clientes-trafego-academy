"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { PerformancePoint } from "@/lib/types";

type PerformanceChartProps = {
  data: PerformancePoint[];
  periodLabel?: string;
  emptyMessage?: string;
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(value);
}

export function PerformanceChart({
  data,
  periodLabel = "Performance por período",
  emptyMessage = "Ainda não há métricas suficientes para montar este gráfico.",
}: PerformanceChartProps) {
  const chartData =
    data.length === 1
      ? [
          {
            label: "",
            amountSpent: null,
            leads: null,
          },
          {
            ...data[0],
          },
          {
            label: "",
            amountSpent: data[0].amountSpent,
            leads: data[0].leads,
          },
          {
            label: "",
            amountSpent: null,
            leads: null,
          },
        ]
      : data;

  return (
    <div className="flex w-full min-w-0 flex-col gap-4 rounded-[18px] border border-border bg-card p-5 text-foreground sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold tracking-[-0.01em]">
            Investimento vs. resultados
          </h3>
          <p className="mt-0.5 text-[13px] text-muted-foreground">{periodLabel}</p>
        </div>
        <div className="flex gap-4 text-[12.5px] text-text-3">
          <span className="flex items-center gap-1.5">
            <span className="h-[3px] w-2.5 rounded-sm bg-brand-600" />
            Investimento
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-[3px] w-2.5 rounded-sm bg-brand-300" />
            Resultados
          </span>
        </div>
      </div>
      <div className="h-[240px]">
        {data.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 16, right: 8, left: 0, bottom: 8 }}>
              <defs>
                <linearGradient id="spent" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#6a45e8" stopOpacity={0.16} />
                  <stop offset="100%" stopColor="#6a45e8" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="#f2f4f7" />
              <XAxis
                dataKey="label"
                axisLine={false}
                tickLine={false}
                minTickGap={16}
                tick={{ fill: "#98a2b3", fontSize: 11.5, fontFamily: "var(--font-geist-mono)" }}
              />
              <YAxis
                yAxisId="spent"
                axisLine={false}
                tickLine={false}
                width={40}
                tick={{ fill: "#98a2b3", fontSize: 11.5 }}
                tickFormatter={(value) =>
                  value >= 1000 ? `${Math.round(value / 1000)}k` : String(Math.round(value))
                }
              />
              <YAxis
                yAxisId="leads"
                orientation="right"
                axisLine={false}
                tickLine={false}
                width={32}
                tick={{ fill: "#98a2b3", fontSize: 11.5 }}
              />
              <Tooltip
                formatter={(value, name) => {
                  if (name === "Investimento") {
                    return [formatCurrency(Number(value)), name];
                  }

                  return [String(value), name];
                }}
                cursor={{ stroke: "#d0d5dd", strokeWidth: 1 }}
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
              <Area
                type="monotone"
                dataKey="amountSpent"
                name="Investimento"
                yAxisId="spent"
                stroke="#6a45e8"
                strokeWidth={2.2}
                fill="url(#spent)"
                connectNulls={false}
                activeDot={{ r: 5, fill: "#ffffff", stroke: "#6a45e8", strokeWidth: 2.5 }}
                animationDuration={900}
              />
              <Line
                type="monotone"
                dataKey="leads"
                name="Resultados"
                yAxisId="leads"
                stroke="#9a82ff"
                strokeWidth={2}
                strokeDasharray="4 4"
                connectNulls={false}
                dot={false}
                activeDot={{ r: 4, fill: "#ffffff", stroke: "#9a82ff", strokeWidth: 2 }}
                animationDuration={900}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-input bg-surface-2 px-6 text-center text-sm leading-6 text-muted-foreground">
            {emptyMessage}
          </div>
        )}
      </div>
    </div>
  );
}
