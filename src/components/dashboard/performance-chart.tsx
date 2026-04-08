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
            amountSpent: data[0].amountSpent,
            leads: data[0].leads,
          },
          data[0],
        ]
      : data;

  return (
    <div className="rounded-3xl border border-border/60 bg-background/60 p-4">
      <div className="mb-4">
        <p className="text-sm text-muted-foreground">{periodLabel}</p>
        <h3 className="mt-1 font-display text-2xl font-semibold">
          Investimento vs. resultados
        </h3>
      </div>
      <div className="h-[280px]">
        {data.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 16, right: 8, left: 0, bottom: 8 }}>
              <defs>
                <linearGradient id="spent" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#0f9a7a" stopOpacity={0.45} />
                  <stop offset="95%" stopColor="#0f9a7a" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="leads" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#55a6ff" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#55a6ff" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="rgba(148,163,184,0.15)" />
              <XAxis
                dataKey="label"
                axisLine={false}
                tickLine={false}
                minTickGap={16}
                tick={{ fill: "currentColor", fontSize: 12 }}
              />
              <YAxis
                yAxisId="spent"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 12 }}
                tickFormatter={(value) => `${Math.round(value / 1000)}k`}
              />
              <YAxis
                yAxisId="leads"
                orientation="right"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 12 }}
              />
              <Tooltip
                formatter={(value, name) => {
                  if (name === "Investimento") {
                    return [formatCurrency(Number(value)), name];
                  }

                  return [String(value), name];
                }}
                contentStyle={{
                  borderRadius: 18,
                  border: "1px solid rgba(148,163,184,0.18)",
                  background: "rgba(9,18,29,0.92)",
                  color: "#f8fafc",
                }}
              />
              <Area
                type="monotone"
                dataKey="amountSpent"
                name="Investimento"
                yAxisId="spent"
                stroke="#0f9a7a"
                strokeWidth={2}
                fill="url(#spent)"
              />
              <Line
                type="monotone"
                dataKey="leads"
                name="Resultados"
                yAxisId="leads"
                stroke="#55a6ff"
                strokeWidth={3}
                dot={{ r: 4, fill: "#55a6ff", strokeWidth: 0 }}
                activeDot={{ r: 6 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-full items-center justify-center rounded-[1.5rem] border border-dashed border-border/60 bg-card/50 px-6 text-center text-sm text-muted-foreground">
            {emptyMessage}
          </div>
        )}
      </div>
    </div>
  );
}
