"use client";

import { Download } from "lucide-react";
import { useState } from "react";
import { PERIOD_OPTIONS } from "@/lib/period-options";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";

const LABEL: Record<string, string> = { pdf: "PDF", xlsx: "Excel", csv: "CSV" };

export function ReportExporter({ type, canExport, compact, primaryLabel, formats = ["pdf", "xlsx", "csv"] }: { type: string; canExport: boolean; compact?: boolean; primaryLabel?: string; formats?: string[] }) {
  const [period, setPeriod] = useState(type === "fluxo-de-caixa" || type.startsWith("contas") ? "this_month" : "last_month");
  if (!canExport) return <p className="text-xs text-muted-foreground">Seu perfil não permite exportar relatórios.</p>;
  const href = (f: string) => `/api/reports/${type}?format=${f}&period=${period}`;
  return (
    <div className={compact ? "space-y-2" : "flex flex-wrap items-center gap-2"}>
      <Select value={period} onChange={(e) => setPeriod(e.target.value)} className={compact ? "h-8 text-xs" : "h-9 w-48"} aria-label="Período">
        {PERIOD_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </Select>
      <div className="flex flex-wrap gap-1.5">
        {formats.map((f, i) => (
          <Button key={f} asChild size="sm" variant={i === 0 && primaryLabel ? "default" : "outline"}>
            <a href={href(f)}>
              <Download /> {i === 0 && primaryLabel ? primaryLabel : LABEL[f]}
            </a>
          </Button>
        ))}
      </div>
    </div>
  );
}
