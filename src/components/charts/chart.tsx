"use client";

import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, ComposedChart, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { fmt } from "@/lib/format";
import { formatValue, type ValueFmt } from "@/lib/format-value";

export type ChartKind = "bar" | "line" | "area" | "composed";

export interface ChartProps {
  chart: ChartKind;
  xKey: string;
  xFormat?: "month" | "date" | "text";
  series: { key: string; label: string; kind?: "bar" | "line" }[];
  data: Record<string, string | number | null>[];
  valueFormat?: ValueFmt;
  height?: number;
  referenceY?: { value: number; label: string } | null;
  horizontal?: boolean;
}

const COLORS = ["var(--series-1)", "var(--series-2)", "var(--series-3)", "var(--series-4)"];

function formatX(v: unknown, f?: ChartProps["xFormat"]) {
  const s = String(v ?? "");
  if (f === "month") return fmt.month(s);
  if (f === "date") return s.length >= 10 ? `${s.slice(8, 10)}/${s.slice(5, 7)}` : s;
  return s.length > 18 ? `${s.slice(0, 17)}…` : s;
}


interface TooltipPayload {
  name?: string;
  value?: number | string | null;
  color?: string;
  dataKey?: string | number;
}

function ChartTooltip({ active, payload, label, xFormat, valueFormat }: { active?: boolean; payload?: TooltipPayload[]; label?: string | number; xFormat?: ChartProps["xFormat"]; valueFormat: ValueFmt }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-medium text-foreground">{xFormat === "date" ? fmt.date(String(label)) : formatX(label, xFormat)}</p>
      {payload.map((p) => (
        <div key={String(p.dataKey)} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
            {p.name}
          </span>
          <span className="tabular font-medium text-foreground">{formatValue(p.value as number, valueFormat)}</span>
        </div>
      ))}
    </div>
  );
}

export function Chart({ chart, xKey, xFormat, series, data, valueFormat = "money", height = 260, referenceY, horizontal }: ChartProps) {
  if (!data.length) {
    return <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">Sem dados para o período.</div>;
  }
  const axisProps = { stroke: "var(--chart-axis)", fontSize: 11, tickLine: false, axisLine: false } as const;
  const common = (
    <>
      <CartesianGrid stroke="var(--chart-grid)" vertical={false} strokeDasharray="0" />
      {horizontal ? (
        <>
          <XAxis type="number" {...axisProps} tickFormatter={(v: number) => formatValue(v, valueFormat, true)} />
          <YAxis type="category" dataKey={xKey} {...axisProps} width={140} tickFormatter={(v) => formatX(v, xFormat)} />
        </>
      ) : (
        <>
          <XAxis dataKey={xKey} {...axisProps} tickFormatter={(v) => formatX(v, xFormat)} minTickGap={12} />
          <YAxis {...axisProps} width={84} tickFormatter={(v: number) => formatValue(v, valueFormat, true)} />
        </>
      )}
      <Tooltip cursor={{ fill: "hsl(var(--muted))", opacity: 0.5 }} content={<ChartTooltip xFormat={xFormat} valueFormat={valueFormat} />} />
      {series.length > 1 ? <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, paddingTop: 8 }} /> : null}
      {referenceY ? <ReferenceLine y={referenceY.value} stroke="hsl(var(--warning))" strokeDasharray="4 4" label={{ value: referenceY.label, fontSize: 11, fill: "var(--chart-axis)", position: "insideTopRight" }} /> : null}
      {!horizontal ? <ReferenceLine y={0} stroke="var(--chart-axis)" strokeOpacity={0.4} /> : null}
    </>
  );

  return (
    <div style={{ width: "100%", height }}>
      <ResponsiveContainer>
        {chart === "line" ? (
          <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            {common}
            {series.map((s, i) => (
              <Line key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={COLORS[i % 4]} strokeWidth={2} dot={false} activeDot={{ r: 4 }} connectNulls />
            ))}
          </LineChart>
        ) : chart === "area" ? (
          <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            {common}
            {series.map((s, i) => (
              <Area key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={COLORS[i % 4]} strokeWidth={2} fill={COLORS[i % 4]} fillOpacity={0.12} />
            ))}
          </AreaChart>
        ) : chart === "composed" ? (
          <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            {common}
            {series.map((s, i) =>
              s.kind === "line" ? (
                <Line key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={COLORS[i % 4]} strokeWidth={2} dot={false} />
              ) : (
                <Bar key={s.key} dataKey={s.key} name={s.label} fill={COLORS[i % 4]} radius={[4, 4, 0, 0]} maxBarSize={28} />
              ),
            )}
          </ComposedChart>
        ) : (
          <BarChart data={data} layout={horizontal ? "vertical" : "horizontal"} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={2}>
            {common}
            {series.map((s, i) => (
              <Bar key={s.key} dataKey={s.key} name={s.label} fill={COLORS[i % 4]} radius={horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]} maxBarSize={horizontal ? 18 : 32} />
            ))}
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}
