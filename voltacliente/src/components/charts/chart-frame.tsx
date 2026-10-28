"use client";

import { useState } from "react";
import { ChartColumnIcon, TableIcon } from "lucide-react";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type TableColumn = { key: string; label: string; align?: "left" | "right" };

/** Cartão de gráfico com alternância para visão em tabela (acessibilidade). */
export function ChartFrame({
  title,
  description,
  columns,
  rows,
  children,
  className,
}: {
  title: string;
  description?: React.ReactNode;
  columns: TableColumn[];
  rows: Record<string, string | number>[];
  children: React.ReactNode;
  className?: string;
}) {
  const [view, setView] = useState<"chart" | "table">("chart");
  return (
    <Card className={cn("gap-4", className)}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
        <CardAction>
          <div className="flex rounded-lg border p-0.5" role="group" aria-label="Modo de visualização">
            <button
              type="button"
              onClick={() => setView("chart")}
              aria-pressed={view === "chart"}
              className={cn(
                "cursor-pointer rounded-md p-1.5 text-muted-foreground transition-colors",
                view === "chart" && "bg-accent text-foreground",
              )}
              aria-label="Ver gráfico"
            >
              <ChartColumnIcon className="size-4" />
            </button>
            <button
              type="button"
              onClick={() => setView("table")}
              aria-pressed={view === "table"}
              className={cn(
                "cursor-pointer rounded-md p-1.5 text-muted-foreground transition-colors",
                view === "table" && "bg-accent text-foreground",
              )}
              aria-label="Ver tabela"
            >
              <TableIcon className="size-4" />
            </button>
          </div>
        </CardAction>
      </CardHeader>
      <CardContent>
        {view === "chart" ? (
          children
        ) : (
          <div className="max-h-80 overflow-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted">
                <tr>
                  {columns.map((c) => (
                    <th
                      key={c.key}
                      className={cn("px-3 py-2 font-medium text-muted-foreground", c.align === "right" ? "text-right" : "text-left")}
                    >
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={i} className="border-t">
                    {columns.map((c) => (
                      <td key={c.key} className={cn("px-3 py-2 tabular-nums", c.align === "right" ? "text-right" : "text-left")}>
                        {row[c.key]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function LegendItem({ color, label, shape = "line" }: { color: string; label: string; shape?: "line" | "rect" }) {
  return (
    <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
      <span aria-hidden className={shape === "line" ? "h-0.5 w-4 rounded-full" : "size-2.5 rounded-[3px]"} style={{ background: color }} />
      {label}
    </span>
  );
}
