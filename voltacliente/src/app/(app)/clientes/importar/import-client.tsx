"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { CheckCircle2Icon, DownloadIcon, FileSpreadsheetIcon, LoaderCircleIcon, TriangleAlertIcon, UploadIcon } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CSV_MAX_BYTES, CSV_TEMPLATE } from "@/lib/csv";
import { cn, formatNumber } from "@/lib/utils";
import { importCustomersAction } from "@/modules/customers/actions";
import type { ImportSummary } from "@/modules/customers/service";

function IssueList({ title, issues, tone }: { title: string; issues: { line: number; message: string }[]; tone: "warning" | "muted" }) {
  if (issues.length === 0) return null;
  return (
    <details className="rounded-lg border px-4 py-3" open={tone === "warning" && issues.length <= 10}>
      <summary className="cursor-pointer text-sm font-medium">
        {title} ({formatNumber(issues.length)})
      </summary>
      <ul className="mt-2 max-h-56 space-y-1 overflow-auto text-sm text-muted-foreground">
        {issues.slice(0, 200).map((issue) => (
          <li key={`${issue.line}-${issue.message}`}>
            <span className="font-medium text-foreground">Linha {issue.line}:</span> {issue.message}
          </li>
        ))}
      </ul>
    </details>
  );
}

export function ImportClient({ planName, remaining }: { planName: string; remaining: number | null }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [text, setText] = useState<string | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState<number | null>(null);

  function downloadTemplate() {
    const blob = new Blob(["﻿" + CSV_TEMPLATE], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "modelo-clientes-voltacliente.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function onFile(file: File | undefined) {
    setSummary(null);
    setError(null);
    setDone(null);
    if (!file) return;
    if (!/\.(csv|txt)$/i.test(file.name)) return setError("Envie um arquivo .csv (no Excel: Arquivo › Salvar como › CSV).");
    if (file.size > CSV_MAX_BYTES) return setError("O arquivo tem mais de 2 MB. Divida em partes menores.");
    const content = await file.text();
    setFileName(file.name);
    setText(content);
    startTransition(async () => {
      const result = await importCustomersAction(content, true);
      if (!result.ok) return setError(result.error);
      setSummary(result.data);
    });
  }

  function confirmImport() {
    if (!text) return;
    startTransition(async () => {
      const result = await importCustomersAction(text, false);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setDone(result.data.created);
      setSummary(null);
      toast.success(`${formatNumber(result.data.created)} cliente(s) importado(s).`);
      router.refresh();
    });
  }

  const exceeds = summary && remaining !== null && summary.toCreate > remaining;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Formato do arquivo</CardTitle>
          <CardDescription>
            Colunas obrigatórias: <strong>nome</strong> e <strong>telefone</strong>. Opcionais: email, observacoes, data_cadastro
            (DD/MM/AAAA), preferencia_contato (whatsapp, telefone, email, qualquer) e consentimento (sim/não). Aceita separador “;” ou “,”.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" size="sm" onClick={downloadTemplate}>
            <DownloadIcon /> Baixar planilha modelo
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <label
            htmlFor="csv"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              void onFile(e.dataTransfer.files[0]);
            }}
            className={cn(
              "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors hover:border-primary/40 hover:bg-accent/40",
              pending && "pointer-events-none opacity-60",
            )}
          >
            {pending ? (
              <LoaderCircleIcon className="size-8 animate-spin text-primary" />
            ) : (
              <FileSpreadsheetIcon className="size-8 text-primary" />
            )}
            <span className="font-medium">{fileName ?? "Clique para escolher ou arraste o arquivo CSV"}</span>
            <span className="text-xs text-muted-foreground">Até 2 MB e 5.000 linhas</span>
            <input
              ref={input}
              id="csv"
              type="file"
              accept=".csv,text/csv,text/plain"
              className="sr-only"
              onChange={(e) => void onFile(e.target.files?.[0])}
            />
          </label>
        </CardContent>
      </Card>

      {error && (
        <Alert variant="destructive">
          <TriangleAlertIcon />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {done !== null && (
        <Alert variant="success">
          <CheckCircle2Icon />
          <AlertTitle>Importação concluída</AlertTitle>
          <AlertDescription>
            <p>
              {formatNumber(done)} cliente(s) importado(s). Agora registre os últimos atendimentos para gerar os retornos.{" "}
              <Link href="/clientes" className="font-medium underline">
                Ver clientes
              </Link>
            </p>
          </AlertDescription>
        </Alert>
      )}

      {summary && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Pré-visualização</CardTitle>
            <CardDescription>
              {formatNumber(summary.totalLines)} linha(s) lida(s) em {fileName}.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {summary.missingColumns.length > 0 ? (
              <Alert variant="destructive">
                <AlertDescription>
                  Colunas obrigatórias ausentes: {summary.missingColumns.join(", ")}. Confira o cabeçalho da planilha.
                </AlertDescription>
              </Alert>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {[
                    { label: "Prontos para importar", value: summary.toCreate, accent: true },
                    { label: "Com erro", value: summary.errors.length },
                    { label: "Repetidos no arquivo", value: summary.duplicatesInFile.length },
                    { label: "Já cadastrados", value: summary.existing.length },
                  ].map((stat) => (
                    <div key={stat.label} className={cn("rounded-lg border p-3", stat.accent && "border-emerald/40 bg-emerald-soft/40")}>
                      <p className="text-xl font-semibold">{formatNumber(stat.value)}</p>
                      <p className="text-xs text-muted-foreground">{stat.label}</p>
                    </div>
                  ))}
                </div>
                <IssueList title="Linhas com erro (serão ignoradas)" issues={summary.errors} tone="warning" />
                <IssueList title="Repetidas no arquivo (ignoradas)" issues={summary.duplicatesInFile} tone="muted" />
                <IssueList title="Telefones já cadastrados (ignorados)" issues={summary.existing} tone="muted" />
                {exceeds && (
                  <Alert variant="warning">
                    <TriangleAlertIcon />
                    <AlertDescription>
                      O plano {planName} permite mais {formatNumber(remaining!)} cliente(s). Remova linhas ou altere o plano em{" "}
                      <Link href="/configuracoes/plano" className="font-medium underline">
                        Configurações › Plano
                      </Link>
                      .
                    </AlertDescription>
                  </Alert>
                )}
                <div className="flex justify-end">
                  <Button onClick={confirmImport} disabled={pending || summary.toCreate === 0 || !!exceeds}>
                    {pending ? <LoaderCircleIcon className="animate-spin" /> : <UploadIcon />}
                    Importar {formatNumber(summary.toCreate)} cliente(s)
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
