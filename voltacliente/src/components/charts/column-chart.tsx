"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatBRL, formatBRLCompact } from "@/lib/money";
import { formatNumber } from "@/lib/utils";
import { ChartFrame } from "./chart-frame";
import { ChartTooltip } from "./tooltip";

/** Série única em colunas (ex.: receita registrada por período). */
export function ColumnChart({
  data,
  title,
  description,
  seriesName,
  valueFormat = "number",
}: {
  data: { label: string; value: number }[];
  title: string;
  description?: string;
  seriesName: string;
  /** Formato nomeado (funções não podem ser passadas de Server para Client Components). */
  valueFormat?: "currency" | "number";
}) {
  const format = valueFormat === "currency" ? formatBRL : formatNumber;
  const formatAxis = valueFormat === "currency" ? formatBRLCompact : formatNumber;
  return (
    <ChartFrame
      title={title}
      description={description}
      columns={[
        { key: "label", label: "Período" },
        { key: "formatted", label: seriesName, align: "right" },
      ]}
      rows={data.map((d) => ({ label: d.label, formatted: format(d.value) }))}
    >
      <div className="h-64 w-full sm:h-72">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap="22%">
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={{ stroke: "var(--border)" }}
              tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
              interval="preserveStartEnd"
              minTickGap={14}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
              tickFormatter={formatAxis}
              width={64}
            />
            <Tooltip
              cursor={{ fill: "var(--muted)", opacity: 0.6 }}
              content={(props) => (
                <ChartTooltip
                  active={props.active}
                  payload={props.payload as never}
                  label={props.label as string}
                  names={{ value: seriesName }}
                  formatValue={(v) => format(v)}
                />
              )}
            />
            <Bar dataKey="value" name={seriesName} fill="var(--chart-1)" radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartFrame>
  );
}
