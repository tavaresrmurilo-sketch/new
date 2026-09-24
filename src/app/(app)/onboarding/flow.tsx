"use client";

import { BrainCircuit, Building2, Check, FileSpreadsheet, Plug } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { ImportWizard } from "@/components/cortex/import-wizard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/input";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/utils";

const STEPS = ["Criar empresa", "Adicionar fonte de dados", "Importar ou conectar", "Mapear dados", "Processar", "Dashboard pronto"];

interface Company {
  name: string;
  cnpj: string;
  segment: string;
  timezone: string;
  currency: string;
  fiscalYearStartMonth: number;
  minCashBalance: number | null;
  revenueGoalMonthly: number | null;
}

export function OnboardingFlow({ company, canImport, canSettings }: { company: Company; canImport: boolean; canSettings: boolean }) {
  const [step, setStep] = useState(1);
  const [c, setC] = useState(company);
  const [result, setResult] = useState<{ processedRows: number } | null>(null);
  const num = (v: string) => (v.trim() === "" ? null : Number(v.replace(/\./g, "").replace(",", ".")));

  async function saveCompany() {
    if (canSettings) await api("/api/settings/company", { method: "PATCH", json: { ...c, cnpj: c.cnpj || null, segment: c.segment || null } });
    setStep(2);
  }

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight">Bem-vindo ao JR Cortex AI</h1>
        <p className="text-sm text-muted-foreground">Em poucos passos seus dados viram dashboards, DRE e respostas confiáveis.</p>
      </div>
      <ol className="mb-6 grid grid-cols-3 gap-2 md:grid-cols-6">
        {STEPS.map((s, i) => {
          const n = i + 1;
          const done = n < step || (n >= 3 && n <= 5 && step === 6);
          return (
            <li key={s} className={cn("rounded-md border px-2 py-2 text-xs", n === step ? "border-primary bg-primary/5" : done ? "border-success/40 bg-success/5" : "text-muted-foreground")}>
              <span className="flex items-center gap-1 font-medium">
                {done ? <Check className="h-3.5 w-3.5 text-success" /> : <span>{n}.</span>} {s}
              </span>
            </li>
          );
        })}
      </ol>

      {step === 1 ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-4 w-4" /> Etapa 1 — Empresa
            </CardTitle>
            <CardDescription>Confirme os dados básicos. Caixa mínimo e meta alimentam os alertas do Cortex.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            <Field label="Nome"><Input value={c.name} onChange={(e) => setC({ ...c, name: e.target.value })} disabled={!canSettings} /></Field>
            <Field label="CNPJ"><Input value={c.cnpj} onChange={(e) => setC({ ...c, cnpj: e.target.value })} disabled={!canSettings} /></Field>
            <Field label="Segmento"><Input value={c.segment} onChange={(e) => setC({ ...c, segment: e.target.value })} disabled={!canSettings} /></Field>
            <Field label="Caixa mínimo desejado (R$)"><Input inputMode="decimal" defaultValue={c.minCashBalance ?? ""} onChange={(e) => setC({ ...c, minCashBalance: num(e.target.value) })} disabled={!canSettings} /></Field>
            <Field label="Meta de faturamento mensal (R$)"><Input inputMode="decimal" defaultValue={c.revenueGoalMonthly ?? ""} onChange={(e) => setC({ ...c, revenueGoalMonthly: num(e.target.value) })} disabled={!canSettings} /></Field>
            <div className="flex items-end">
              <Button onClick={saveCompany}>Continuar</Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {step === 2 ? (
        <div className="grid gap-3 md:grid-cols-2">
          <button onClick={() => setStep(3)} disabled={!canImport} className="rounded-lg border bg-card p-5 text-left transition-colors hover:border-primary/50 disabled:opacity-50">
            <FileSpreadsheet className="h-6 w-6 text-primary" />
            <p className="mt-3 font-semibold">Importar planilha (CSV/XLSX)</p>
            <p className="mt-1 text-sm text-muted-foreground">A forma mais rápida de começar. O Cortex detecta as colunas e sugere o mapeamento.</p>
          </button>
          <Link href="/integracoes" className="rounded-lg border bg-card p-5 transition-colors hover:border-primary/50">
            <Plug className="h-6 w-6 text-primary" />
            <p className="mt-3 font-semibold">Conectar sistema</p>
            <p className="mt-1 text-sm text-muted-foreground">ERP, CRM, banco de dados, Google Sheets ou API REST.</p>
          </Link>
        </div>
      ) : null}

      {step >= 3 && step <= 5 ? (
        <ImportWizard
          onDone={(job) => {
            setResult(job);
            setStep(6);
          }}
        />
      ) : null}

      {step === 6 ? (
        <Card className="text-center">
          <CardContent className="py-12">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
              <BrainCircuit className="h-7 w-7" />
            </div>
            <h2 className="mt-5 text-2xl font-semibold tracking-tight">Seu Cortex está pronto.</h2>
            <p className="mt-2 text-sm text-muted-foreground">{result ? `${result.processedRows.toLocaleString("pt-BR")} registros organizados e disponíveis para análise.` : "Seus dados estão disponíveis para análise."}</p>
            <div className="mt-6 flex justify-center gap-2">
              <Button asChild>
                <Link href="/chat">Perguntar ao Cortex</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/dashboard">Ver Visão Executiva</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
