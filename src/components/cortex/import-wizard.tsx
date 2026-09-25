"use client";

import { CheckCircle2, FileSpreadsheet, Loader2, UploadCloud } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/input";
import { Notice } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/utils";

const TARGETS: { value: string; label: string }[] = [
  { value: "SALES", label: "Vendas" },
  { value: "EXPENSES", label: "Despesas" },
  { value: "REVENUES", label: "Receitas (não vendas)" },
  { value: "CUSTOMERS", label: "Clientes" },
  { value: "PRODUCTS", label: "Produtos / Serviços" },
  { value: "ACCOUNTS_PAYABLE", label: "Contas a pagar" },
  { value: "ACCOUNTS_RECEIVABLE", label: "Contas a receber" },
  { value: "INVOICES", label: "Faturas" },
  { value: "ORDERS", label: "Pedidos" },
];

type DetectedType = "Número" | "Data" | "Texto" | "Vazio";

/** Detecta o tipo predominante de uma coluna a partir da amostra (exibição; a validação real ocorre no servidor). */
function detectType(values: unknown[]): DetectedType {
  const vals = values.map((v) => String(v ?? "").trim()).filter(Boolean);
  if (!vals.length) return "Vazio";
  const share = (re: RegExp) => vals.filter((v) => re.test(v)).length / vals.length;
  if (share(/^(\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}|\d{4}-\d{2}-\d{2}([ T].*)?)$/) >= 0.8) return "Data";
  if (share(/^-?\(?\s*(R\$)?\s*-?[\d.,]+\)?%?$/) >= 0.8) return "Número";
  return "Texto";
}

interface FieldDef {
  key: string;
  label: string;
  required: boolean;
  kind: string;
}
interface Job {
  id: string;
  target: string;
  status: string;
  headers: string[];
  sampleRows: Record<string, unknown>[];
  suggestedMapping: { mapping: Record<string, string | null>; confidence: Record<string, number> };
  totalRows: number;
  processedRows: number;
  createdRows: number;
  updatedRows: number;
  rejectedRows: number;
  errors: { row: number; message: string }[];
}

export function ImportWizard({ onDone, accept }: { onDone?: (job: Job) => void; accept?: "csv" | "excel" }) {
  const [step, setStep] = useState<"upload" | "map" | "done">("upload");
  const [file, setFile] = useState<File | null>(null);
  const [target, setTarget] = useState("");
  const [job, setJob] = useState<Job | null>(null);
  const [fields, setFields] = useState<FieldDef[]>([]);
  const [mapping, setMapping] = useState<Record<string, string | null>>({});
  const [sourceName, setSourceName] = useState("");
  const [busy, setBusy] = useState(false);
  const [duplicateOf, setDuplicateOf] = useState<{ fileName: string; createdAt: string } | null>(null);
  const [drag, setDrag] = useState(false);

  async function upload() {
    if (!file) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      if (target) fd.append("target", target);
      const r = await api<{ job: Job; fields: FieldDef[]; duplicateOf: { fileName: string; createdAt: string } | null }>("/api/import", { method: "POST", body: fd });
      setJob(r.job);
      setFields(r.fields);
      setMapping(r.job.suggestedMapping.mapping);
      setTarget(r.job.target);
      setDuplicateOf(r.duplicateOf);
      setStep("map");
    } finally {
      setBusy(false);
    }
  }

  async function changeTarget(t: string) {
    if (!job) return;
    setTarget(t);
    const r = await api<{ job: Job; fields: FieldDef[] }>(`/api/import/${job.id}/remap`, { method: "POST", json: { target: t } });
    setJob(r.job);
    setFields(r.fields);
    setMapping(r.job.suggestedMapping.mapping);
  }

  async function process() {
    if (!job) return;
    setBusy(true);
    try {
      const r = await api<{ job: Job }>(`/api/import/${job.id}/process`, { method: "POST", json: { mapping, sourceName: sourceName || undefined } });
      setJob(r.job);
      setStep("done");
      onDone?.(r.job);
    } finally {
      setBusy(false);
    }
  }

  const missingRequired = fields.filter((f) => f.required && !mapping[f.key]);
  const types: Record<string, DetectedType> = job ? Object.fromEntries(job.headers.map((h) => [h, detectType(job.sampleRows.map((r) => r[h]))])) : {};

  return (
    <div className="space-y-4">
      <ol className="flex flex-wrap items-center gap-2 text-xs">
        {[
          ["upload", "1. Enviar arquivo"],
          ["map", "2. Confirmar mapeamento"],
          ["done", "3. Processar"],
        ].map(([k, l]) => (
          <li key={k} className={cn("rounded-full border px-3 py-1", step === k ? "border-primary bg-primary/10 font-medium text-primary" : "text-muted-foreground")}>
            {l}
          </li>
        ))}
      </ol>

      {step === "upload" ? (
        <Card>
          <CardHeader>
            <CardTitle>Enviar planilha</CardTitle>
            <CardDescription>CSV ou XLSX até 10 MB. O Cortex detecta as colunas e sugere o mapeamento — nada é importado antes da sua confirmação.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <label
              onDragOver={(e) => {
                e.preventDefault();
                setDrag(true);
              }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDrag(false);
                const f = e.dataTransfer.files[0];
                if (f) setFile(f);
              }}
              className={cn("flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-10 text-center transition-colors", drag ? "border-primary bg-primary/5" : "hover:border-primary/50")}
            >
              <UploadCloud className="h-8 w-8 text-muted-foreground" />
              <p className="mt-2 text-sm font-medium">{file ? file.name : "Arraste o arquivo aqui ou clique para selecionar"}</p>
              <p className="text-xs text-muted-foreground">{file ? `${(file.size / 1024).toFixed(0)} KB` : "Formatos aceitos: .csv, .xlsx"}</p>
              <input type="file" accept={accept === "csv" ? ".csv,.txt" : accept === "excel" ? ".xlsx" : ".csv,.xlsx,.txt"} className="sr-only" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </label>
            <Field label="Tipo de dado">
              <Select value={target} onChange={(e) => setTarget(e.target.value)}>
                <option value="">Detectar automaticamente</option>
                {TARGETS.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Button onClick={upload} disabled={!file || busy}>
              {busy ? <Loader2 className="animate-spin" /> : <FileSpreadsheet />} Analisar arquivo
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {step === "map" && job ? (
        <Card>
          <CardHeader>
            <CardTitle>Mapeamento sugerido</CardTitle>
            <CardDescription>
              {job.totalRows.toLocaleString("pt-BR")} linhas detectadas. Confirme ou corrija a correspondência entre os campos do Cortex e as colunas do arquivo.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {duplicateOf ? <Notice tone="warning">Este mesmo arquivo já foi enviado em {new Date(duplicateOf.createdAt).toLocaleString("pt-BR")}. Reimportar não duplica registros: linhas iguais são atualizadas.</Notice> : null}
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Tipo de dado">
                <Select value={target} onChange={(e) => changeTarget(e.target.value)}>
                  {TARGETS.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Nome da fonte (opcional)" hint="Aparece como fonte dos números nas respostas do Cortex.">
                <Input value={sourceName} onChange={(e) => setSourceName(e.target.value)} placeholder="Ex.: Planilha de vendas do ERP" maxLength={80} />
              </Field>
            </div>
            <div className="rounded-md border">
              <Table>
                <THead>
                  <TR className="hover:bg-transparent">
                    <TH>Campo do Cortex</TH>
                    <TH>Coluna do arquivo</TH>
                    <TH>Tipo detectado</TH>
                    <TH>Confiança</TH>
                    <TH>Exemplo</TH>
                  </TR>
                </THead>
                <TBody>
                  {fields.map((f) => (
                    <TR key={f.key}>
                      <TD className="font-medium">
                        {f.label}
                        {f.required ? <span className="text-critical"> *</span> : null}
                      </TD>
                      <TD>
                        <Select value={mapping[f.key] ?? ""} onChange={(e) => setMapping((m) => ({ ...m, [f.key]: e.target.value || null }))} className="h-8">
                          <option value="">— não mapear —</option>
                          {job.headers.map((h) => (
                            <option key={h} value={h}>
                              {h}
                            </option>
                          ))}
                        </Select>
                      </TD>
                      <TD className="text-xs">{mapping[f.key] ? <span className={cn(f.kind !== "string" && types[mapping[f.key] as string] !== "Vazio" && ((f.kind === "number" && types[mapping[f.key] as string] !== "Número") || (f.kind === "date" && types[mapping[f.key] as string] !== "Data")) && "font-medium text-warning")}>{types[mapping[f.key] as string]}</span> : null}</TD>
                      <TD>{mapping[f.key] && job.suggestedMapping.confidence[f.key] && job.suggestedMapping.mapping[f.key] === mapping[f.key] ? <Badge variant={job.suggestedMapping.confidence[f.key] >= 70 ? "success" : "warning"}>{job.suggestedMapping.confidence[f.key] >= 70 ? "Alta" : "Média"}</Badge> : mapping[f.key] ? <Badge variant="secondary">Manual</Badge> : null}</TD>
                      <TD className="max-w-[220px] truncate text-xs text-muted-foreground">{mapping[f.key] ? String(job.sampleRows[0]?.[mapping[f.key] as string] ?? "") : ""}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </div>
            <details className="text-sm" open>
              <summary className="cursor-pointer text-xs font-medium text-muted-foreground">Pré-visualização das primeiras linhas ({job.headers.length} colunas identificadas)</summary>
              <div className="mt-2 overflow-x-auto rounded border">
                <Table>
                  <THead>
                    <TR>
                      {job.headers.map((h) => (
                        <TH key={h}>
                          {h}
                          <span className="block text-[10px] font-normal text-muted-foreground">{types[h]}</span>
                        </TH>
                      ))}
                    </TR>
                  </THead>
                  <TBody>
                    {job.sampleRows.map((r, i) => (
                      <TR key={i}>
                        {job.headers.map((h) => (
                          <TD key={h} className="whitespace-nowrap text-xs">
                            {String(r[h] ?? "")}
                          </TD>
                        ))}
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </div>
            </details>
            {missingRequired.length ? <Notice tone="warning">Mapeie os campos obrigatórios: {missingRequired.map((f) => f.label).join(", ")}.</Notice> : null}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep("upload")}>
                Voltar
              </Button>
              <Button onClick={process} disabled={busy || missingRequired.length > 0}>
                {busy ? <Loader2 className="animate-spin" /> : null} Confirmar e importar
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {step === "done" && job ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className={cn("h-5 w-5", job.status === "FAILED" ? "text-critical" : "text-success")} />
              {job.status === "COMPLETED" ? "Importação concluída" : job.status === "PARTIAL" ? "Importação concluída com rejeições" : "Importação falhou"}
            </CardTitle>
            <CardDescription>Dados validados, normalizados e gravados no Cortex com identificadores externos (sem duplicidade).</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                ["Válidos (importados)", job.processedRows],
                ["Novos", job.createdRows],
                ["Atualizados", job.updatedRows],
                ["Rejeitados", job.rejectedRows],
              ].map(([l, v]) => (
                <div key={l} className="rounded-md border px-3 py-2">
                  <p className="text-[11px] text-muted-foreground">{l}</p>
                  <p className="text-lg font-semibold tabular">{Number(v).toLocaleString("pt-BR")}</p>
                </div>
              ))}
            </div>
            {job.errors.length ? (
              <div className="max-h-56 overflow-y-auto rounded border text-xs">
                {job.errors.slice(0, 50).map((e, i) => (
                  <p key={i} className="border-b px-3 py-1 last:border-0">
                    Linha {e.row}: {e.message}
                  </p>
                ))}
              </div>
            ) : null}
            <Button
              variant="outline"
              onClick={() => {
                setStep("upload");
                setFile(null);
                setJob(null);
              }}
            >
              Importar outro arquivo
            </Button>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
