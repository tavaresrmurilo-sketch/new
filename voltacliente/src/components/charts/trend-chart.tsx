"use client";

import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatNumber } from "@/lib/utils";
import { ChartFrame, LegendItem } from "./chart-frame";
import { ChartTooltip } from "./tooltip";

export type TrendPoint = { label: string; returns: number; contacts: number };

const NAMES = { returns: "Retornos registrados", contacts: "Contatos registrados" };

/** Evolução de retornos e contatos (mesma unidade: quantidade → um único eixo). */
export function TrendChart({ data, title, description }: { data: TrendPoint[]; title: string; description?: string }) {
  const max = Math.max(1, ...data.map((d) => Math.max(d.returns, d.contacts)));
  return (
    <ChartFrame
      title={title}
      description={description}
      columns={[
        { key: "label", label: "Período" },
        { key: "returns", label: NAMES.returns, align: "right" },
        { key: "contacts", label: NAMES.contacts, align: "right" },
      ]}
      rows={data}
    >
      <div className="mb-3 flex flex-wrap gap-4">
        <LegendItem color="var(--chart-2)" label={NAMES.returns} />
        <LegendItem color="var(--chart-1)" label={NAMES.contacts} />
      </div>
      <div className="h-64 w-full sm:h-72">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
            <defs>
              <linearGradient id="returns-wash" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--chart-2)" stopOpacity={0.14} />
                <stop offset="100%" stopColor="var(--chart-2)" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="var(--border)" strokeWidth={1} />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={{ stroke: "var(--border)" }}
              tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
              interval="preserveStartEnd"
              minTickGap={18}
            />
            <YAxis
              allowDecimals={false}
              domain={[0, max <= 4 ? 4 : "auto"]}
              tickLine={false}
              axisLine={false}
              tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
              tickFormatter={(v: number) => formatNumber(v)}
              width={44}
            />
            <Tooltip
              cursor={{ stroke: "var(--muted-foreground)", strokeWidth: 1, strokeOpacity: 0.4 }}
              content={(props) => (
                <ChartTooltip
                  active={props.active}
                  payload={props.payload as never}
                  label={props.label as string}
                  names={NAMES}
                  formatValue={(v) => formatNumber(v)}
                />
              )}
            />
            <Area
              type="linear"
              dataKey="returns"
              name={NAMES.returns}
              stroke="var(--chart-2)"
              strokeWidth={2}
              fill="url(#returns-wash)"
              dot={false}
              activeDot={{ r: 4.5, strokeWidth: 2, stroke: "var(--card)" }}
              isAnimationActive={false}
            />
            <Line
              type="linear"
              dataKey="contacts"
              name={NAMES.contacts}
              stroke="var(--chart-1)"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4.5, strokeWidth: 2, stroke: "var(--card)" }}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </ChartFrame>
  );
}
