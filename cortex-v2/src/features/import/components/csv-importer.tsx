"use client";

import * as React from "react";
import Papa from "papaparse";
import { AlertTriangle, CheckCircle2, FileUp, Upload, XCircle } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label, NativeSelect } from "@/components/ui/input";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { commitImportAction, previewImportAction } from "../actions";
import { IMPORT_FIELDS, type ImportEntity } from "../schemas";

type Preview = { index: number; valid: boolean; errors: string[]; duplicate: { name: string; reasons: string[] } | null };

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** Importador CSV: upload → mapeamento de colunas → validação/preview com duplicatas → confirmação. */
export function CsvImporter({ entity: initialEntity, onDone, allowEntityChoice = true }: { entity?: ImportEntity; onDone?: (r: { imported: number }) => void; allowEntityChoice?: boolean }) {
  const router = useRouter();
  const [entity, setEntity] = React.useState<ImportEntity>(initialEntity ?? "clients");
  const [fileName, setFileName] = React.useState("");
  const [headers, setHeaders] = React.useState<string[]>([]);
  const [rawRows, setRawRows] = React.useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = React.useState<Record<string, string>>({});
  const [preview, setPreview] = React.useState<Preview[] | null>(null);
  const [skipDuplicates, setSkipDuplicates] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const fields = IMPORT_FIELDS[entity];

  const autoMap = React.useCallback(
    (hs: string[], ent: ImportEntity) => {
      const m: Record<string, string> = {};
      for (const f of IMPORT_FIELDS[ent]) {
        const hit = hs.find((h) => (f.aliases as readonly string[]).some((a) => norm(h) === norm(a))) ?? hs.find((h) => (f.aliases as readonly string[]).some((a) => norm(h).includes(norm(a))));
        if (hit) m[f.key] = hit;
      }
      return m;
    },
    [],
  );

  const onFile = (file: File) => {
    if (file.size > 5 * 1024 * 1024) return toast.error("Arquivo maior que 5 MB.");
    setFileName(file.name);
    setPreview(null);
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: "greedy",
      transformHeader: (h) => h.trim(),
      complete: (res) => {
        const hs = (res.meta.fields ?? []).filter(Boolean);
        if (!hs.length || !res.data.length) return toast.error("Não encontramos dados no arquivo. Verifique se a primeira linha tem os nomes das colunas.");
        if (res.data.length > 2000) toast.warning("Apenas as primeiras 2.000 linhas serão importadas nesta etapa.");
        setHeaders(hs);
        setRawRows(res.data.slice(0, 2000));
        setMapping(autoMap(hs, entity));
      },
      error: () => toast.error("Não foi possível ler o arquivo CSV."),
    });
  };

  const mappedRows = React.useMemo(
    () =>
      rawRows.map((r) => {
        const out: Record<string, string> = {};
        for (const [field, header] of Object.entries(mapping)) if (header) out[field] = (r[header] ?? "").toString().trim();
        return out;
      }),
    [rawRows, mapping],
  );

  const runPreview = async () => {
    if (!mapping.name) return toast.error("Mapeie ao menos a coluna Nome.");
    setBusy(true);
    const r = await previewImportAction({ entity, fileName, rows: mappedRows, skipDuplicates });
    setBusy(false);
    if (r.ok) setPreview(r.data);
    else toast.error(r.error);
  };

  const commit = async () => {
    setBusy(true);
    const r = await commitImportAction({ entity, fileName, rows: mappedRows, skipDuplicates });
    setBusy(false);
    if (!r.ok) return toast.error(r.error);
    toast.success(`${r.data.imported} registro(s) importado(s). ${r.data.skipped} ignorado(s).`);
    onDone?.({ imported: r.data.imported });
    setPreview(null);
    setRawRows([]);
    setHeaders([]);
    router.refresh();
  };

  const valid = preview?.filter((p) => p.valid).length ?? 0;
  const dups = preview?.filter((p) => p.valid && p.duplicate).length ?? 0;
  const invalid = preview?.filter((p) => !p.valid).length ?? 0;
  const willImport = preview ? preview.filter((p) => p.valid && (!skipDuplicates || !p.duplicate)).length : 0;

  return (
    <div className="space-y-4">
      {allowEntityChoice ? (
        <div className="flex gap-2" role="radiogroup" aria-label="O que importar">
          {(["clients", "leads"] as const).map((e) => (
            <Button key={e} type="button" variant={entity === e ? "default" : "outline"} size="sm" onClick={() => { setEntity(e); setMapping(autoMap(headers, e)); setPreview(null); }}>
              {e === "clients" ? "Clientes" : "Leads"}
            </Button>
          ))}
        </div>
      ) : null}

      <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-6 py-8 text-center hover:bg-subtle">
        <FileUp className="size-6 text-muted-foreground" />
        <span className="text-sm font-medium">{fileName || "Selecione um arquivo CSV"}</span>
        <span className="text-xs text-muted-foreground">Primeira linha com os nomes das colunas · separador vírgula ou ponto e vírgula · até 5 MB</span>
        <input type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
      </label>

      {headers.length ? (
        <div className="space-y-3">
          <p className="text-sm font-medium">Mapeamento de colunas ({rawRows.length} linhas)</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {fields.map((f) => (
              <div key={f.key} className="space-y-1">
                <Label htmlFor={`map-${f.key}`}>
                  {f.label}
                  {"required" in f && f.required ? <span className="text-destructive"> *</span> : null}
                </Label>
                <NativeSelect id={`map-${f.key}`} value={mapping[f.key] ?? ""} onChange={(e) => { setMapping((m) => ({ ...m, [f.key]: e.target.value })); setPreview(null); }}>
                  <option value="">— não importar —</option>
                  {headers.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </NativeSelect>
              </div>
            ))}
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="size-4" checked={skipDuplicates} onChange={(e) => setSkipDuplicates(e.target.checked)} /> Ignorar possíveis duplicatas (recomendado)
          </label>
          <Button type="button" variant="outline" onClick={runPreview} loading={busy && !preview}>
            Validar e pré-visualizar
          </Button>
        </div>
      ) : null}

      {preview ? (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2 text-sm">
            <Badge tone="success"><CheckCircle2 /> {valid} válidas</Badge>
            <Badge tone="warning"><AlertTriangle /> {dups} possíveis duplicatas</Badge>
            <Badge tone="danger"><XCircle /> {invalid} com erro</Badge>
          </div>
          <div className="max-h-72 overflow-auto rounded-lg border">
            <Table>
              <THead>
                <TR>
                  <TH>Linha</TH>
                  <TH>Nome</TH>
                  <TH>Situação</TH>
                </TR>
              </THead>
              <TBody>
                {preview.slice(0, 300).map((p) => (
                  <TR key={p.index}>
                    <TD className="tabular text-muted-foreground">{p.index + 2}</TD>
                    <TD>{mappedRows[p.index]?.name || "—"}</TD>
                    <TD className="text-xs">
                      {!p.valid ? (
                        <span className="text-destructive">{p.errors.join("; ")}</span>
                      ) : p.duplicate ? (
                        <span className="text-warning">Possível duplicata de {p.duplicate.name} ({p.duplicate.reasons.join(", ")})</span>
                      ) : (
                        <span className="text-success">Pronta para importar</span>
                      )}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>
          <Button type="button" onClick={commit} loading={busy} disabled={!willImport}>
            <Upload /> Importar {willImport} registro(s)
          </Button>
          <p className="text-xs text-muted-foreground">Duplicatas nunca são mescladas automaticamente.</p>
        </div>
      ) : null}
    </div>
  );
}
