"use client";

import * as React from "react";
import { Save } from "lucide-react";
import { LineSeriesChart } from "@/components/charts/charts";
import { Field } from "@/components/common/field";
import { RecordPicker } from "@/components/forms/record-picker";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAction } from "@/hooks/use-action";
import { formatCurrency, formatNumber } from "@/lib/format";
import { calculateRoi, type RoiInputs } from "@/lib/roi";
import { saveRoiScenarioAction } from "../actions";

const FIELDS: { key: keyof RoiInputs; label: string; hint?: string; suffix?: string }[] = [
  { key: "investment", label: "Investimento inicial (R$)", hint: "Implantação, licenças, consultoria" },
  { key: "monthlyCost", label: "Custo recorrente mensal (R$)", hint: "Mensalidade ou manutenção" },
  { key: "monthlySavings", label: "Economia mensal estimada (R$)", hint: "Horas poupadas, custos evitados" },
  { key: "monthlyRevenueGain", label: "Aumento de receita mensal (R$)", hint: "Receita adicional esperada" },
  { key: "revenueMarginPct", label: "Margem sobre a receita adicional (%)", hint: "Parte da receita que vira resultado", suffix: "%" },
  { key: "months", label: "Horizonte (meses)", hint: "1 a 120 meses" },
];

export function RoiCalculator({ currency, canSave, initial }: { currency: string; canSave: boolean; initial?: Partial<RoiInputs> }) {
  const [v, setV] = React.useState<RoiInputs>({ investment: 0, monthlyCost: 0, monthlySavings: 0, monthlyRevenueGain: 0, revenueMarginPct: 30, months: 12, ...initial });
  const [name, setName] = React.useState("");
  const [clientId, setClientId] = React.useState<string | null>(null);
  const r = React.useMemo(() => calculateRoi(v), [v]);
  const money = (n: number) => formatCurrency(n, currency);
  const save = useAction(saveRoiScenarioAction, { success: "Cenário salvo", onSuccess: () => setName("") });
  const hasInput = v.investment > 0 || v.monthlySavings > 0 || v.monthlyRevenueGain > 0;
  return (
    <div className="grid gap-4 lg:grid-cols-[380px_minmax(0,1fr)]">
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Premissas</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {FIELDS.map((f) => (
            <Field key={f.key} label={f.label} htmlFor={`roi-${f.key}`} hint={f.hint}>
              <Input
                id={`roi-${f.key}`}
                type="number"
                inputMode="decimal"
                min={f.key === "months" ? 1 : 0}
                max={f.key === "revenueMarginPct" ? 100 : f.key === "months" ? 120 : undefined}
                step={f.key === "months" ? 1 : "any"}
                value={Number.isFinite(v[f.key]) ? v[f.key] : 0}
                onChange={(e) => setV((prev) => ({ ...prev, [f.key]: Math.max(0, Number(e.target.value) || 0) }))}
              />
            </Field>
          ))}
        </CardContent>
      </Card>
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="ROI no horizonte" value={r.roiPct === null ? "—" : `${formatNumber(r.roiPct, 1)}%`} tone={r.roiPct !== null ? (r.roiPct >= 0 ? "good" : "bad") : undefined} />
          <Metric label="Payback" value={r.paybackMonths === null ? "Não se paga" : `${formatNumber(r.paybackMonths, 1)} meses`} tone={r.paybackMonths === null && hasInput ? "bad" : undefined} />
          <Metric label="Benefício líquido mensal" value={money(r.monthlyNetBenefit)} tone={r.monthlyNetBenefit >= 0 ? "good" : "bad"} />
          <Metric label="Ganho líquido no horizonte" value={money(r.netGain)} tone={r.netGain >= 0 ? "good" : "bad"} />
        </div>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Resultado acumulado</CardTitle>
            <p className="text-xs text-muted-foreground">Benefício total {money(r.totalBenefit)} · custo total {money(r.totalCost)}</p>
          </CardHeader>
          <CardContent>
            <LineSeriesChart data={r.cumulative.map((c) => ({ mes: `M${c.month}`, valor: c.value }))} xKey="mes" series={[{ key: "valor", label: "Acumulado" }]} format="currency" currency={currency} area height={220} />
          </CardContent>
        </Card>
        <p className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
          Projeção baseada exclusivamente nas premissas informadas acima. Não é promessa nem garantia de resultado — use como apoio à conversa com o cliente.
        </p>
        {canSave ? (
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Salvar cenário</CardTitle></CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
              <Field label="Nome" htmlFor="roi-name"><Input id="roi-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Automação de laudos — cenário base" /></Field>
              <Field label="Cliente (opcional)" htmlFor="roi-client"><RecordPicker id="roi-client" type="client" value={clientId ?? ""} onChange={(id) => setClientId(id ?? null)} /></Field>
              <Button loading={save.pending} disabled={name.trim().length < 2 || !hasInput} onClick={() => save.run({ name, clientId, inputs: v })}><Save /> Salvar</Button>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" }) {
  return (
    <div className="rounded-lg border bg-card px-4 py-3.5">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className={`tabular mt-2 text-xl font-semibold ${tone === "good" ? "text-success" : tone === "bad" ? "text-destructive" : ""}`}>{value}</p>
    </div>
  );
}
