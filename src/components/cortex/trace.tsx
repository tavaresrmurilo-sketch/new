"use client";

import { Calculator, Database } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { fmt } from "@/lib/format";

export interface TraceMeta {
  period?: { start: string; end: string; label: string } | null;
  periods?: { start: string; end: string; label: string }[];
  comparison?: { start: string; end: string; label: string } | null;
  comparisons?: { start: string; end: string; label: string }[];
  sources: { id: string; name: string; kind: string; lastUpdatedAt: string }[];
  lastUpdated: string | null;
  filters: Record<string, string>;
  calculation?: { label: string; formula?: string; value?: number | string | null; detail?: string }[];
  calculations?: { tool: string; steps: { label: string; formula?: string; value?: number | string | null; detail?: string }[] }[];
  notes?: string[];
}

const KIND: Record<string, string> = { INTEGRATION: "Integração", IMPORT: "Importação", MANUAL: "Manual", DEMO: "Demonstrativo", KNOWLEDGE: "Conhecimento" };

/** Rodapé de rastreabilidade: período, fonte, atualização e filtros. */
export function TraceFooter({ meta }: { meta: TraceMeta }) {
  const periods = meta.periods ?? (meta.period ? [meta.period] : []);
  const comparisons = meta.comparisons ?? (meta.comparison ? [meta.comparison] : []);
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
      {periods.length ? (
        <span>
          <span className="font-medium text-foreground/70">Período:</span> {periods.map((p) => `${fmt.date(p.start)} até ${fmt.date(p.end)}`).join("; ")}
        </span>
      ) : null}
      {comparisons.length ? (
        <span>
          <span className="font-medium text-foreground/70">Comparação:</span> {comparisons.map((p) => `${fmt.date(p.start)} até ${fmt.date(p.end)}`).join("; ")}
        </span>
      ) : null}
      <span>
        <span className="font-medium text-foreground/70">Fonte:</span> {meta.sources.length ? meta.sources.map((s) => s.name).join(", ") : "—"}
      </span>
      <span>
        <span className="font-medium text-foreground/70">Dados atualizados:</span> {fmt.dateTime(meta.lastUpdated)}
      </span>
    </div>
  );
}

export function TraceDialog({ meta, trigger }: { meta: TraceMeta; trigger?: React.ReactNode }) {
  const calcs = meta.calculations ?? (meta.calculation?.length ? [{ tool: "Cálculo", steps: meta.calculation }] : []);
  const periods = meta.periods ?? (meta.period ? [meta.period] : []);
  const comparisons = meta.comparisons ?? (meta.comparison ? [meta.comparison] : []);
  return (
    <Dialog>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="outline" size="sm">
            <Calculator /> Ver cálculo
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>De onde vieram os números</DialogTitle>
          <DialogDescription>Todos os valores foram calculados pelo Cortex a partir da base da empresa, com consultas internas parametrizadas.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 text-sm">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-md border p-3">
              <p className="text-xs font-medium text-muted-foreground">Período analisado</p>
              {periods.length ? periods.map((p) => <p key={p.start + p.end}>{fmt.date(p.start)} até {fmt.date(p.end)}</p>) : <p>—</p>}
              {comparisons.length ? <p className="mt-1 text-xs text-muted-foreground">Comparação: {comparisons.map((p) => `${fmt.date(p.start)} até ${fmt.date(p.end)}`).join("; ")}</p> : null}
            </div>
            <div className="rounded-md border p-3">
              <p className="text-xs font-medium text-muted-foreground">Dados atualizados em</p>
              <p>{fmt.dateTime(meta.lastUpdated)}</p>
            </div>
          </div>
          <div>
            <p className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Database className="h-3.5 w-3.5" /> Fontes utilizadas
            </p>
            {meta.sources.length ? (
              <ul className="space-y-1">
                {meta.sources.map((s) => (
                  <li key={s.id} className="flex items-center justify-between rounded border px-2 py-1 text-xs">
                    <span>{s.name}</span>
                    <span className="text-muted-foreground">
                      {KIND[s.kind] ?? s.kind} · {fmt.dateTime(s.lastUpdatedAt)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-muted-foreground">Nenhuma fonte com registros no período.</p>
            )}
          </div>
          {Object.keys(meta.filters).length ? (
            <div>
              <p className="mb-1 text-xs font-medium text-muted-foreground">Filtros aplicados</p>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(meta.filters).map(([k, v]) => (
                  <span key={k} className="rounded bg-muted px-2 py-0.5 text-xs">
                    {k.replace(/_/g, " ")}: {v}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
          {calcs.map((c) => (
            <div key={c.tool}>
              <p className="mb-1 text-xs font-medium text-muted-foreground">Memória de cálculo — {c.tool}</p>
              <div className="divide-y rounded-md border">
                {c.steps.map((s, i) => (
                  <div key={i} className="grid grid-cols-[1fr_auto] gap-2 px-3 py-1.5 text-xs">
                    <div>
                      <p className="font-medium">{s.label}</p>
                      {s.formula ? <p className="font-mono text-[11px] text-muted-foreground">{s.formula}</p> : null}
                      {s.detail ? <p className="text-[11px] text-muted-foreground">{s.detail}</p> : null}
                    </div>
                    <p className="text-right tabular">{typeof s.value === "number" ? (Math.abs(s.value) >= 100 ? fmt.money(s.value) : fmt.number(s.value)) : (s.value ?? "")}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {meta.notes?.length ? (
            <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
              {meta.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
