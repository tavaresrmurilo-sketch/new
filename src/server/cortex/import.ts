import type { ImportTarget, Prisma } from "@prisma/client";
import ExcelJS from "exceljs";
import Papa from "papaparse";
import { prisma } from "@/lib/db";
import { errorMessage, logger } from "@/lib/logger";
import { round } from "@/lib/utils";
import { AppError } from "@/server/errors";
import { sha256 } from "@/server/security/crypto";
import { ensureDataSource, Ingestor } from "./ingest";
import { parseDate, parseNumber, suggestMapping, suggestTarget, TARGET_LABELS, validateMapping, type ColumnMapping } from "./mapping";
import type { CanonicalBatch } from "./records";

export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_ROWS = 100_000;

export interface ParsedSheet {
  headers: string[];
  rows: Record<string, unknown>[];
  sheetName: string | null;
}

function cellValue(v: ExcelJS.CellValue): unknown {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v;
  if (typeof v === "object") {
    if ("result" in v) return (v as ExcelJS.CellFormulaValue).result ?? null;
    if ("richText" in v) return (v as ExcelJS.CellRichTextValue).richText.map((t) => t.text).join("");
    if ("text" in v) return (v as ExcelJS.CellHyperlinkValue).text;
    if ("error" in v) return null;
  }
  return v;
}

function uniqueHeaders(raw: unknown[]): string[] {
  const seen = new Map<string, number>();
  return raw.map((h, i) => {
    let name = String(h ?? "").trim() || `Coluna ${i + 1}`;
    const count = seen.get(name) ?? 0;
    seen.set(name, count + 1);
    if (count) name = `${name} (${count + 1})`;
    return name;
  });
}

export async function parseFile(buffer: Buffer, fileName: string): Promise<ParsedSheet> {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".csv") || lower.endsWith(".txt")) {
    let text = buffer.toString("utf8");
    if (text.includes("�")) text = buffer.toString("latin1");
    text = text.replace(/^﻿/, "");
    const parsed = Papa.parse<string[]>(text, { skipEmptyLines: "greedy", delimitersToGuess: [";", ",", "\t", "|"] });
    const [head, ...body] = parsed.data;
    if (!head) throw new AppError("Arquivo CSV vazio.");
    const headers = uniqueHeaders(head);
    if (body.length > MAX_ROWS) throw new AppError(`O arquivo excede o limite de ${MAX_ROWS.toLocaleString("pt-BR")} linhas.`);
    const rows = body.map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i] ?? null])));
    return { headers, rows, sheetName: null };
  }
  if (lower.endsWith(".xlsx")) {
    const wb = new ExcelJS.Workbook();
    try {
      await wb.xlsx.load(buffer as unknown as ArrayBuffer);
    } catch {
      throw new AppError("Não foi possível ler o arquivo XLSX. Verifique se ele não está corrompido ou protegido por senha.");
    }
    const ws = wb.worksheets.find((w) => w.actualRowCount > 0);
    if (!ws) throw new AppError("A planilha não possui dados.");
    if (ws.actualRowCount > MAX_ROWS + 1) throw new AppError(`A planilha excede o limite de ${MAX_ROWS.toLocaleString("pt-BR")} linhas.`);
    let headerRow: unknown[] | null = null;
    const rows: Record<string, unknown>[] = [];
    let headers: string[] = [];
    ws.eachRow({ includeEmpty: false }, (row) => {
      const values = (row.values as ExcelJS.CellValue[]).slice(1).map(cellValue);
      if (!headerRow) {
        headerRow = values;
        headers = uniqueHeaders(values);
        return;
      }
      if (values.every((v) => v === null || v === "")) return;
      rows.push(Object.fromEntries(headers.map((h, i) => [h, values[i] ?? null])));
    });
    return { headers, rows, sheetName: ws.name };
  }
  throw new AppError("Formato não suportado. Envie um arquivo CSV ou XLSX.");
}

function jsonSafe(rows: Record<string, unknown>[]): Prisma.InputJsonValue {
  return rows.map((r) =>
    Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v instanceof Date ? v.toISOString().slice(0, 10) : v ?? null])),
  ) as Prisma.InputJsonValue;
}

/** Etapa 1: upload + detecção de colunas + mapeamento sugerido. Nada é importado ainda. */
export async function createImportJob(args: { tenantId: string; userId: string; fileName: string; mimeType: string; buffer: Buffer; target?: ImportTarget }) {
  if (args.buffer.length > MAX_FILE_BYTES) throw new AppError("Arquivo maior que 10 MB.");
  const sheet = await parseFile(args.buffer, args.fileName);
  if (!sheet.rows.length) throw new AppError("Nenhuma linha de dados encontrada no arquivo.");
  const target = args.target ?? suggestTarget(sheet.headers);
  const { mapping, confidence } = suggestMapping(target, sheet.headers, sheet.rows.slice(0, 200));
  const file = await prisma.importedFile.create({
    data: {
      tenantId: args.tenantId,
      fileName: args.fileName.slice(0, 200),
      mimeType: args.mimeType.slice(0, 120),
      size: args.buffer.length,
      sha256: sha256(args.buffer),
      content: new Uint8Array(args.buffer),
    },
  });
  const job = await prisma.importJob.create({
    data: {
      tenantId: args.tenantId,
      fileId: file.id,
      target,
      status: "UPLOADED",
      sheetName: sheet.sheetName,
      headers: sheet.headers,
      sampleRows: jsonSafe(sheet.rows.slice(0, 8)),
      suggestedMapping: { mapping, confidence } as Prisma.InputJsonValue,
      totalRows: sheet.rows.length,
      createdById: args.userId,
    },
  });
  return { job, duplicateOf: await previousImportOfSameFile(args.tenantId, file.sha256, file.id) };
}

async function previousImportOfSameFile(tenantId: string, hash: string, excludeId: string) {
  const prev = await prisma.importedFile.findFirst({
    where: { tenantId, sha256: hash, id: { not: excludeId } },
    orderBy: { createdAt: "desc" },
    select: { fileName: true, createdAt: true },
  });
  return prev ? { fileName: prev.fileName, createdAt: prev.createdAt.toISOString() } : null;
}

export async function remapImportJob(tenantId: string, jobId: string, target: ImportTarget) {
  const job = await prisma.importJob.findFirst({ where: { id: jobId, tenantId }, include: { file: true } });
  if (!job) throw new AppError("Importação não encontrada.", 404);
  const sheet = await parseFile(Buffer.from(job.file.content), job.file.fileName);
  const suggestion = suggestMapping(target, sheet.headers, sheet.rows.slice(0, 200));
  return prisma.importJob.update({ where: { id: job.id }, data: { target, suggestedMapping: suggestion as Prisma.InputJsonValue } });
}

// ───────── Transformação linha → registro canônico ─────────

interface RowError {
  row: number;
  message: string;
}

function rowHash(target: string, row: Record<string, unknown>, mapping: ColumnMapping): string {
  const values = Object.values(mapping)
    .filter((h): h is string => Boolean(h))
    .sort()
    .map((h) => `${h}=${row[h] instanceof Date ? (row[h] as Date).toISOString() : String(row[h] ?? "")}`)
    .join("|");
  return `row:${sha256(`${target}|${values}`).slice(0, 32)}`;
}

export function transformRows(target: ImportTarget, rows: Record<string, unknown>[], mapping: ColumnMapping) {
  const batch: CanonicalBatch = {};
  const errors: RowError[] = [];
  const get = (row: Record<string, unknown>, key: string) => (mapping[key] ? row[mapping[key] as string] : null);
  const str = (row: Record<string, unknown>, key: string) => {
    const v = get(row, key);
    if (v === null || v === undefined) return null;
    const s = v instanceof Date ? v.toISOString().slice(0, 10) : String(v).trim();
    return s || null;
  };
  const num = (row: Record<string, unknown>, key: string) => parseNumber(get(row, key));
  const dt = (row: Record<string, unknown>, key: string) => parseDate(get(row, key));

  // ocorrências repetidas de uma linha idêntica recebem sufixo, preservando idempotência entre reimportações
  const seen = new Map<string, number>();
  const idFor = (row: Record<string, unknown>) => {
    const explicit = str(row, "externalId");
    const base = explicit ?? rowHash(target, row, mapping);
    if (explicit) return base;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return n > 1 ? `${base}:${n}` : base;
  };

  const need = <T>(v: T | null, i: number, label: string): v is T => {
    if (v === null) {
      errors.push({ row: i + 2, message: `Valor inválido ou ausente em "${label}".` });
      return false;
    }
    return true;
  };

  switch (target) {
    case "SALES": {
      const orders = new Map<string, Record<string, unknown>>();
      rows.forEach((row, i) => {
        const date = dt(row, "date");
        const gross = num(row, "grossAmount");
        if (!need(date, i, "Data") || !need(gross, i, "Receita / Valor total")) return;
        const explicitId = str(row, "externalId");
        const id = explicitId ?? idFor(row);
        const qty = num(row, "quantity") ?? 1;
        const cost = num(row, "cost") ?? 0;
        const discount = num(row, "discount") ?? 0;
        const tax = num(row, "tax") ?? 0;
        const product = str(row, "product");
        const statusRaw = (str(row, "status") ?? "").toLowerCase();
        const item = {
          productName: product,
          quantity: qty > 0 ? qty : 1,
          unitPrice: num(row, "unitPrice") ?? round(gross / (qty > 0 ? qty : 1)),
          discount,
          total: gross,
          totalCost: cost,
        };
        const existing = orders.get(id);
        if (existing && explicitId) {
          (existing.items as unknown[]).push(item);
          existing.grossAmount = round((existing.grossAmount as number) + gross);
          existing.discountAmount = round((existing.discountAmount as number) + discount);
          existing.taxAmount = round((existing.taxAmount as number) + tax);
          existing.costAmount = round((existing.costAmount as number) + cost);
          return;
        }
        orders.set(id, {
          externalId: id,
          number: explicitId,
          date,
          customerName: str(row, "customer"),
          sellerName: str(row, "seller"),
          status: /cancel/.test(statusRaw) ? "CANCELLED" : "COMPLETED",
          grossAmount: gross,
          discountAmount: discount,
          taxAmount: tax,
          costAmount: cost,
          region: str(row, "region"),
          channel: str(row, "channel"),
          category: str(row, "category"),
          items: product ? [item] : [],
        });
      });
      batch.sales = [...orders.values()];
      break;
    }
    case "EXPENSES":
    case "REVENUES": {
      const list: unknown[] = [];
      rows.forEach((row, i) => {
        const date = dt(row, "date");
        const amount = num(row, "amount");
        if (!need(date, i, "Data") || !need(amount, i, "Valor")) return;
        const description = str(row, "description") ?? str(row, "category") ?? "Sem descrição";
        const category = str(row, "category") ?? "Não classificada";
        if (target === "EXPENSES") {
          list.push({
            externalId: idFor(row), date, description, category, amount: Math.abs(amount),
            supplierName: str(row, "supplier"), costCenterCode: str(row, "costCenter"), department: str(row, "department"),
          });
        } else {
          list.push({ externalId: idFor(row), date, description, category, amount, customerName: str(row, "customer") });
        }
      });
      if (target === "EXPENSES") batch.expenses = list;
      else batch.revenues = list;
      break;
    }
    case "CUSTOMERS":
      batch.customers = rows.flatMap((row, i) => {
        const name = str(row, "name");
        if (!need(name, i, "Nome")) return [];
        return [{
          externalId: str(row, "externalId") ?? `name:${name.toLowerCase()}`,
          name, document: str(row, "document"), email: str(row, "email"), segment: str(row, "segment"),
          region: str(row, "region"), city: str(row, "city"), state: str(row, "state"),
        }];
      });
      break;
    case "PRODUCTS":
      batch.products = rows.flatMap((row, i) => {
        const name = str(row, "name");
        if (!need(name, i, "Nome")) return [];
        const type = /serv/i.test(str(row, "type") ?? "") ? "SERVICE" : "PRODUCT";
        return [{
          externalId: str(row, "externalId") ?? str(row, "sku") ?? `name:${name.toLowerCase()}`,
          name, sku: str(row, "sku"), category: str(row, "category"), type,
          unitPrice: num(row, "unitPrice"), unitCost: num(row, "unitCost"),
        }];
      });
      break;
    case "ACCOUNTS_PAYABLE":
      batch.payables = rows.flatMap((row, i) => {
        const due = dt(row, "dueDate");
        const amount = num(row, "amount");
        if (!need(due, i, "Vencimento") || !need(amount, i, "Valor")) return [];
        return [{
          externalId: idFor(row),
          description: str(row, "description") ?? "Título a pagar",
          supplierName: str(row, "supplier"), category: str(row, "category"), costCenterCode: str(row, "costCenter"),
          department: str(row, "department"), companyUnit: str(row, "companyUnit"),
          issueDate: dt(row, "issueDate") ?? due, dueDate: due, amount: Math.abs(amount),
          paidAmount: Math.abs(num(row, "paidAmount") ?? 0), paidAt: dt(row, "paidAt"),
        }];
      });
      break;
    case "ACCOUNTS_RECEIVABLE":
      batch.receivables = rows.flatMap((row, i) => {
        const due = dt(row, "dueDate");
        const amount = num(row, "amount");
        if (!need(due, i, "Vencimento") || !need(amount, i, "Valor")) return [];
        return [{
          externalId: idFor(row),
          description: str(row, "description") ?? "Título a receber",
          customerName: str(row, "customer"),
          issueDate: dt(row, "issueDate") ?? due, dueDate: due, amount: Math.abs(amount),
          receivedAmount: Math.abs(num(row, "receivedAmount") ?? 0), receivedAt: dt(row, "receivedAt"),
        }];
      });
      break;
  }
  return { batch, errors };
}

/** Etapa 2: com o mapeamento confirmado pelo usuário, valida, normaliza e ingere no Cortex. */
export async function processImportJob(tenantId: string, jobId: string, mapping: ColumnMapping, sourceName?: string) {
  const job = await prisma.importJob.findFirst({ where: { id: jobId, tenantId }, include: { file: true } });
  if (!job) throw new AppError("Importação não encontrada.", 404);
  if (job.status === "PROCESSING") throw new AppError("Esta importação já está em processamento.", 409);
  const headers = job.headers as string[];
  const mappingErrors = validateMapping(job.target, mapping, headers);
  if (mappingErrors.length) throw new AppError(mappingErrors.join(" "), 422);

  const ds = await ensureDataSource(
    tenantId,
    sourceName?.trim() || `Planilhas — ${TARGET_LABELS[job.target]}`,
    "IMPORT",
    undefined,
    "Dados importados manualmente via CSV/XLSX",
  );
  await prisma.importJob.update({ where: { id: job.id }, data: { status: "PROCESSING", confirmedMapping: mapping as Prisma.InputJsonValue, dataSourceId: ds.id } });

  try {
    const sheet = await parseFile(Buffer.from(job.file.content), job.file.fileName);
    const { batch, errors } = transformRows(job.target, sheet.rows, mapping);
    const ingestor = new Ingestor(tenantId, ds.id);
    const stats = await ingestor.ingest(batch);
    const rejected = errors.length + stats.rejected;
    const allErrors = [
      ...errors.slice(0, 100).map((e) => ({ row: e.row, message: e.message })),
      ...stats.errors.slice(0, 100).map((e) => ({ row: e.index + 2, message: `${e.externalId ?? ""} ${e.message}`.trim() })),
    ];
    const status = stats.processed === 0 ? "FAILED" : rejected ? "PARTIAL" : "COMPLETED";
    const updated = await prisma.importJob.update({
      where: { id: job.id },
      data: {
        status,
        processedRows: stats.processed,
        createdRows: stats.created,
        updatedRows: stats.updated,
        rejectedRows: rejected,
        errors: allErrors,
        finishedAt: new Date(),
      },
    });
    await prisma.tenant.update({ where: { id: tenantId }, data: { onboardingCompleted: true } });
    logger.info("import.completed", { tenantId, jobId, status, processed: stats.processed, rejected });
    return updated;
  } catch (err) {
    logger.error("import.failed", { tenantId, jobId, err: errorMessage(err) });
    return prisma.importJob.update({
      where: { id: job.id },
      data: { status: "FAILED", errors: [{ row: 0, message: errorMessage(err) }], finishedAt: new Date() },
    });
  }
}
