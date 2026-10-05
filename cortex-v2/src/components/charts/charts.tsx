"use client";

import * as React from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatCurrency, formatNumber } from "@/lib/format";

export type ValueFormat = "currency" | "number" | "percent";

export interface SeriesDef {
  key: string;
  label: string;
  /** índice da cor do tema (1–5) */
  color?: 1 | 2 | 3 | 4 | 5;
}

const color = (i: number) => `hsl(var(--chart-${((i - 1) % 5) + 1}))`;

function useFormatter(format: ValueFormat, currency: string) {
  return React.useCallback(
    (v: number, compact = false) =>
      format === "currency" ? formatCurrency(v, currency, { compact }) : format === "percent" ? `${formatNumber(v, 0)}%` : formatNumber(v, Number.isInteger(v) ? 0 : 1),
    [format, currency],
  );
}

const axisProps = { stroke: "hsl(var(--muted-foreground))", fontSize: 11, tickLine: false, axisLine: false } as const;

function ChartTooltip({ format, currency }: { format: ValueFormat; currency: string }) {
  const fmt = useFormatter(format, currency);
  return (
    <Tooltip
      cursor={{ fill: "hsl(var(--muted))", opacity: 0.5 }}
      contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12, color: "hsl(var(--popover-foreground))" }}
      labelStyle={{ fontWeight: 600, marginBottom: 4 }}
      formatter={(value) => fmt(Number(value))}
    />
  );
}

export function BarSeriesChart({
  data,
  xKey,
  series,
  format = "number",
  currency = "BRL",
  height = 240,
  stacked = false,
}: {
  data: Record<string, string | number>[];
  xKey: string;
  series: SeriesDef[];
  format?: ValueFormat;
  currency?: string;
  height?: number;
  stacked?: boolean;
}) {
  const fmt = useFormatter(format, currency);
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
          <XAxis dataKey={xKey} {...axisProps} />
          <YAxis {...axisProps} width={64} tickFormatter={(v) => fmt(Number(v), true)} />
          <ChartTooltip format={format} currency={currency} />
          {series.length > 1 ? <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} /> : null}
          {series.map((s, i) => (
            <Bar key={s.key} dataKey={s.key} name={s.label} fill={color(s.color ?? i + 1)} radius={stacked ? 0 : [4, 4, 0, 0]} stackId={stacked ? "a" : undefined} maxBarSize={36} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function LineSeriesChart({
  data,
  xKey,
  series,
  format = "number",
  currency = "BRL",
  height = 240,
  area = false,
}: {
  data: Record<string, string | number | null>[];
  xKey: string;
  series: SeriesDef[];
  format?: ValueFormat;
  currency?: string;
  height?: number;
  area?: boolean;
}) {
  const fmt = useFormatter(format, currency);
  const Chart = area ? AreaChart : LineChart;
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <Chart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
          <XAxis dataKey={xKey} {...axisProps} minTickGap={16} />
          <YAxis {...axisProps} width={64} tickFormatter={(v) => fmt(Number(v), true)} />
          <ChartTooltip format={format} currency={currency} />
          {series.length > 1 ? <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} /> : null}
          {series.map((s, i) =>
            area ? (
              <Area key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={color(s.color ?? i + 1)} fill={color(s.color ?? i + 1)} fillOpacity={0.12} strokeWidth={2} connectNulls />
            ) : (
              <Line key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={color(s.color ?? i + 1)} strokeWidth={2} dot={false} connectNulls />
            ),
          )}
        </Chart>
      </ResponsiveContainer>
    </div>
  );
}

export function DonutChart({
  data,
  format = "number",
  currency = "BRL",
  height = 220,
}: {
  data: { name: string; value: number }[];
  format?: ValueFormat;
  currency?: string;
  height?: number;
}) {
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" innerRadius="55%" outerRadius="85%" paddingAngle={2} stroke="hsl(var(--card))">
            {data.map((_, i) => (
              <Cell key={i} fill={color(i + 1)} />
            ))}
          </Pie>
          <ChartTooltip format={format} currency={currency} />
          <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
