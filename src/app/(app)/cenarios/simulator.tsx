"use client";

import { Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { DataTable } from "@/components/cortex/blocks";
import { KpiCard } from "@/components/cortex/kpi";
import { Chart } from "@/components/charts/chart";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Notice } from "@/components/ui/misc";
import { api } from "@/lib/api-client";
import { fmt } from "@/lib/format";
import { simulate, type Assumptions, type Baseline } from "@/lib/scenario-sim";
import { cn } from "@/lib/utils";

type Kind = "CONSERVATIVE" | "BASE" | "OPTIMISTIC";
const KIND_LABEL: Record<Kind, string> = { CONSERVATIVE: "Conservador", BASE: "Base", OPTIMISTIC: "Otimista" };

const FIELDS: { key: keyof Assumptions; label: string; min: number; max: number; step: number; unit: string }[] = [
  { key: "revenueGrowthPct", label: "Crescimento da receita (mensal)", min: -10, max: 10, step: 0.5, unit: "%" },
  { key: "marginDeltaPp", label: "Variação da margem bruta", min: -10, max: 10, step: 0.5, unit: "p.p." },
  { key: "expenseChangePct", label: "Variação das despesas", min: -30, max: 50, step: 1, unit: "%" },
  { key: "costChangePct", label: "Variação dos custos", min: -30, max: 50, step: 1, unit: "%" },
  { key: "defaultRatePct", label: "Inadimplência", min: 0, max: 30, step: 0.5, unit: "%" },
  { key: "dsoDays", label: "Prazo médio de recebimento", min: 0, max: 120, step: 1, unit: "dias" },
  { key: "horizonMonths", label: "Horizonte", min: 3, max: 24, step: 1, unit: "meses" },
];

export function ScenarioSimulator({ baseline, presets, startMonth, saved }: { baseline: Baseline; presets: Record<Kind, Assumptions>; startMonth: string; saved: { id: string; name: string; kind: string; createdAt: string; author: string; assumptions: Record<string, number> }[] }) {
  const router = useRouter();
  const [assumptions, setAssumptions] = useState<Record<Kind, Assumptions>>(presets);
  const [active, setActive] = useState<Kind>("BASE");
  const [name, setName] = useState("");
  const start = useMemo(() => new Date(startMonth), [startMonth]);
  const results = useMemo(
    () => ({
      CONSERVATIVE: simulate(baseline, assumptions.CONSERVATIVE, start),
      BASE: simulate(baseline, assumptions.BASE, start),
      OPTIMISTIC: simulate(baseline, assumptions.OPTIMISTIC, start),
    }),
    [baseline, assumptions, start],
  );

  if (!baseline.sufficient) {
    return <Notice tone="warning">Não há dados suficientes (ao menos 1 mês fechado com resultado) para calcular a linha de base do simulador.</Notice>;
  }

  const a = assumptions[active];
  const set = (key: keyof Assumptions, value: number) => setAssumptions((prev) => ({ ...prev, [active]: { ...prev[active], [key]: value } }));
  const chartData = results.BASE.months.map((m, i) => ({ month: m.month, conservador: results.CONSERVATIVE.months[i]?.cash ?? null, base: m.cash, otimista: results.OPTIMISTIC.months[i]?.cash ?? null }));

  async function save() {
    await api("/api/scenarios", { method: "POST", json: { name: name || `Cenário ${KIND_LABEL[active]}`, kind: active, assumptions: a } });
    toast.success("Cenário salvo.");
    setName("");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Linha de base</CardTitle>
          <CardDescription>Média dos últimos {baseline.months} meses fechados</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4 xl:grid-cols-7">
          <Stat label="Receita líquida/mês" value={fmt.money(baseline.avgNetRevenue)} />
          <Stat label="Custos / receita" value={fmt.pct(baseline.costRatio * 100)} />
          <Stat label="Despesas operacionais/mês" value={fmt.money(baseline.avgOperatingExpenses)} />
          <Stat label="Crescimento histórico" value={fmt.signedPct(baseline.historicalGrowthPct)} />
          <Stat label="Prazo médio de recebimento" value={`${baseline.dsoDays} dias`} />
          <Stat label="Inadimplência (>60 dias)" value={fmt.pct(baseline.defaultRatePct)} />
          <Stat label="Caixa inicial" value={fmt.money(baseline.openingCash)} />
        </CardContent>
      </Card>

      <div className="grid gap-3 md:grid-cols-3">
        {(Object.keys(KIND_LABEL) as Kind[]).map((k) => {
          const t = results[k].totals;
          return (
            <button key={k} onClick={() => setActive(k)} className={cn("rounded-lg border bg-card p-4 text-left transition-colors", active === k ? "border-primary ring-1 ring-primary" : "hover:border-primary/40")}>
              <p className="text-sm font-semibold">Cenário {KIND_LABEL[k]}</p>
              <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                <Stat label="Receita" value={fmt.moneyCompact(t.netRevenue)} />
                <Stat label="Lucro" value={fmt.moneyCompact(t.profit)} />
                <Stat label="Margem" value={fmt.pct(t.marginPct)} />
                <Stat label="Caixa final" value={fmt.moneyCompact(t.finalCash)} />
              </div>
            </button>
          );
        })}
      </div>

      <div className="grid gap-4 xl:grid-cols-[380px_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Premissas — {KIND_LABEL[active]}</CardTitle>
            <CardDescription>Ajuste e veja o impacto imediatamente</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {FIELDS.map((f) => (
              <div key={f.key}>
                <div className="flex items-center justify-between text-xs">
                  <label htmlFor={f.key} className="font-medium">
                    {f.label}
                  </label>
                  <span className="tabular text-muted-foreground">
                    {a[f.key].toLocaleString("pt-BR", { maximumFractionDigits: 2 })} {f.unit}
                  </span>
                </div>
                <input id={f.key} type="range" min={f.min} max={f.max} step={f.step} value={a[f.key]} onChange={(e) => set(f.key, Number(e.target.value))} className="mt-1 w-full accent-[hsl(var(--primary))]" />
              </div>
            ))}
            <div className="flex gap-2 pt-2">
              <Input placeholder="Nome do cenário" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
              <Button onClick={save}>
                <Save /> Salvar
              </Button>
            </div>
          </CardContent>
        </Card>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiCard label="Receita (horizonte)" value={results[active].totals.netRevenue} hint="PROJETADO" />
            <KpiCard label="Lucro (horizonte)" value={results[active].totals.profit} hint="PROJETADO" />
            <KpiCard label="Margem" value={results[active].totals.marginPct} format="pct" hint="PROJETADO" />
            <KpiCard label="Menor caixa" value={results[active].totals.minCash} hint={results[active].totals.minCashMonth ? fmt.month(results[active].totals.minCashMonth!) : undefined} />
          </div>
          <Card>
            <CardHeader>
              <CardTitle>Caixa projetado por cenário</CardTitle>
            </CardHeader>
            <CardContent>
              <Chart chart="line" xKey="month" xFormat="month" series={[{ key: "conservador", label: "Conservador" }, { key: "base", label: "Base" }, { key: "otimista", label: "Otimista" }]} data={chartData} height={280} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Detalhe mensal — {KIND_LABEL[active]}</CardTitle>
            </CardHeader>
            <CardContent className="px-0">
              <DataTable
                maxRows={24}
                columns={[{ key: "month", label: "Mês" }, { key: "netRevenue", label: "Receita", format: "money", align: "right" }, { key: "costs", label: "Custos", format: "money", align: "right" }, { key: "operatingExpenses", label: "Despesas", format: "money", align: "right" }, { key: "profit", label: "Lucro", format: "money", align: "right" }, { key: "marginPct", label: "Margem", format: "pct", align: "right" }, { key: "cash", label: "Caixa", format: "money", align: "right" }]}
                rows={results[active].months.map((m) => ({ ...m, month: fmt.month(m.month) }))}
              />
            </CardContent>
          </Card>
          {saved.length ? (
            <Card>
              <CardHeader>
                <CardTitle>Cenários salvos</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
                {saved.map((s) => (
                  <button
                    key={s.id}
                    className="flex w-full items-center justify-between rounded border px-3 py-2 text-left text-sm hover:bg-muted"
                    onClick={() => {
                      const k = (["CONSERVATIVE", "BASE", "OPTIMISTIC"].includes(s.kind) ? s.kind : "BASE") as Kind;
                      setActive(k);
                      setAssumptions((prev) => ({ ...prev, [k]: s.assumptions as unknown as Assumptions }));
                    }}
                  >
                    <span>{s.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {s.author} · {fmt.dateTime(s.createdAt)}
                    </span>
                  </button>
                ))}
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="font-semibold tabular">{value}</p>
    </div>
  );
}
