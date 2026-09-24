"use client";

import { Chart } from "@/components/charts/chart";
import { formatValue, type ValueFmt } from "@/lib/format-value";
import { Notice, SeverityBadge, type Severity } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { Delta } from "./kpi";

export type UIBlock =
  | { type: "kpis"; items: { label: string; value: number | string | null; format: ValueFmt; delta?: number | null; deltaFormat?: "pct" | "pp"; hint?: string }[] }
  | { type: "table"; title?: string; columns: { key: string; label: string; format?: ValueFmt; align?: "left" | "right" }[]; rows: Record<string, string | number | null>[] }
  | { type: "chart"; title?: string; chart: "bar" | "line" | "area" | "composed"; xKey: string; xFormat?: "month" | "date" | "text"; series: { key: string; label: string; kind?: "bar" | "line" }[]; data: Record<string, string | number | null>[]; valueFormat?: ValueFmt }
  | { type: "dre"; lines: DreRow[] }
  | { type: "list"; title?: string; items: { title: string; description?: string; severity?: Severity }[] }
  | { type: "notice"; tone: "info" | "warning"; text: string };

export interface DreRow {
  key: string;
  label: string;
  kind: string;
  value: number;
  pctOfNetRevenue: number | null;
  previous: number | null;
  pctVar: number | null;
}

export function DataTable({ columns, rows, maxRows = 50 }: { columns: { key: string; label: string; format?: ValueFmt; align?: "left" | "right" }[]; rows: Record<string, string | number | null>[]; maxRows?: number }) {
  if (!rows.length) return <p className="py-4 text-center text-sm text-muted-foreground">Nenhum registro.</p>;
  return (
    <Table>
      <THead>
        <TR className="hover:bg-transparent">
          {columns.map((c) => (
            <TH key={c.key} className={c.align === "right" ? "text-right" : undefined}>
              {c.label}
            </TH>
          ))}
        </TR>
      </THead>
      <TBody>
        {rows.slice(0, maxRows).map((r, i) => (
          <TR key={i}>
            {columns.map((c) => (
              <TD key={c.key} className={cn(c.align === "right" && "text-right", c.format && c.format !== "text" && "whitespace-nowrap")}>
                {c.format ? formatValue(r[c.key] as number, c.format) : (r[c.key] ?? "—")}
              </TD>
            ))}
          </TR>
        ))}
      </TBody>
    </Table>
  );
}

export function DreTable({ lines, showComparison = true }: { lines: DreRow[]; showComparison?: boolean }) {
  return (
    <Table>
      <THead>
        <TR className="hover:bg-transparent">
          <TH>Linha</TH>
          <TH className="text-right">Valor</TH>
          <TH className="text-right">% receita</TH>
          {showComparison ? (
            <>
              <TH className="text-right">Anterior</TH>
              <TH className="text-right">Var. %</TH>
            </>
          ) : null}
        </TR>
      </THead>
      <TBody>
        {lines.map((l) => {
          const strong = l.kind !== "group";
          return (
            <TR key={l.key} className={cn(l.kind === "result" && "bg-primary/5 font-semibold", l.kind === "subtotal" && "bg-muted/40")}>
              <TD className={cn(strong ? "font-semibold" : "pl-5 text-muted-foreground")}>{l.label}</TD>
              <TD className={cn("text-right whitespace-nowrap", strong && "font-semibold", l.value < 0 && l.kind !== "group" && "text-critical")}>{formatValue(l.value, "money")}</TD>
              <TD className="text-right text-muted-foreground">{formatValue(l.pctOfNetRevenue, "pct")}</TD>
              {showComparison ? (
                <>
                  <TD className="text-right whitespace-nowrap text-muted-foreground">{formatValue(l.previous, "money")}</TD>
                  <TD className="text-right">{l.previous === null ? "—" : <Delta value={l.pctVar} invert={l.value < 0 && l.kind === "group"} />}</TD>
                </>
              ) : null}
            </TR>
          );
        })}
      </TBody>
    </Table>
  );
}

export function BlockRenderer({ blocks }: { blocks: UIBlock[] }) {
  return (
    <div className="space-y-4">
      {blocks.map((b, i) => {
        switch (b.type) {
          case "kpis":
            return (
              <div key={i} className="grid grid-cols-2 gap-2 lg:grid-cols-3 xl:grid-cols-4">
                {b.items.map((k) => (
                  <div key={k.label} className="rounded-md border bg-background/60 px-3 py-2">
                    <p className="text-[11px] text-muted-foreground">{k.label}</p>
                    <p className="text-sm font-semibold tabular">{formatValue(k.value as number, k.format)}</p>
                    {k.delta !== undefined ? <Delta value={k.delta} format={k.deltaFormat} /> : null}
                  </div>
                ))}
              </div>
            );
          case "table":
            return (
              <div key={i} className="rounded-md border">
                {b.title ? <p className="border-b px-3 py-2 text-xs font-medium">{b.title}</p> : null}
                <DataTable columns={b.columns} rows={b.rows} maxRows={20} />
              </div>
            );
          case "chart":
            return (
              <div key={i} className="rounded-md border p-3">
                {b.title ? <p className="mb-2 text-xs font-medium">{b.title}</p> : null}
                <Chart chart={b.chart} xKey={b.xKey} xFormat={b.xFormat} series={b.series} data={b.data} valueFormat={b.valueFormat} height={220} horizontal={b.chart === "bar" && b.xFormat === "text"} />
              </div>
            );
          case "dre":
            return (
              <div key={i} className="rounded-md border">
                <DreTable lines={b.lines} />
              </div>
            );
          case "list":
            return (
              <div key={i} className="space-y-2">
                {b.title ? <p className="text-xs font-medium">{b.title}</p> : null}
                {b.items.map((it, j) => (
                  <div key={j} className="flex items-start gap-3 rounded-md border px-3 py-2">
                    {it.severity ? <SeverityBadge severity={it.severity} /> : null}
                    <div>
                      <p className="text-sm font-medium">{it.title}</p>
                      {it.description ? <p className="text-xs text-muted-foreground">{it.description}</p> : null}
                    </div>
                  </div>
                ))}
              </div>
            );
          case "notice":
            return (
              <Notice key={i} tone={b.tone}>
                {b.text}
              </Notice>
            );
        }
      })}
    </div>
  );
}
