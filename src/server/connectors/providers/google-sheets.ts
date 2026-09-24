import { z } from "zod";
import { parseFile } from "@/server/cortex/import";
import { suggestMapping, TARGET_FIELDS } from "@/server/cortex/mapping";
import { transformRows } from "@/server/cortex/import";
import type { ConnectorProvider } from "../types";

const configSchema = z.object({
  spreadsheetId: z.string().regex(/^[a-zA-Z0-9-_]{20,}$/, "ID da planilha inválido"),
  gid: z.string().regex(/^\d+$/).default("0"),
  target: z.enum(["SALES", "EXPENSES", "REVENUES", "CUSTOMERS", "PRODUCTS", "ACCOUNTS_PAYABLE", "ACCOUNTS_RECEIVABLE"]),
  mapping: z.record(z.string(), z.string().nullable()).optional(),
});

/**
 * Google Sheets via exportação CSV de planilhas compartilhadas por link ("qualquer pessoa com o link pode ver").
 * Planilhas privadas exigem OAuth do Google (planejado — ver INTEGRATIONS.md).
 */
export const googleSheetsProvider: ConnectorProvider = {
  id: "google-sheets",
  label: "Google Sheets",
  type: "GOOGLE_SHEETS",
  description: "Sincroniza uma aba de planilha Google compartilhada por link. Planilhas privadas (OAuth) estão planejadas.",
  availability: "available",
  credentialFields: [],
  configSchema: configSchema as unknown as z.ZodType<Record<string, unknown>>,
  async testConnection(ctx) {
    const cfg = configSchema.safeParse(ctx.config);
    if (!cfg.success) return { ok: false, message: cfg.error.issues.map((i) => i.message).join("; ") };
    const res = await fetch(exportUrl(cfg.data), { redirect: "follow", signal: AbortSignal.timeout(10_000) });
    const type = res.headers.get("content-type") ?? "";
    if (!res.ok || !type.includes("csv")) return { ok: false, message: "Planilha inacessível. Verifique o compartilhamento por link." };
    return { ok: true, message: "Planilha acessível." };
  },
  async fetch(ctx) {
    const cfg = configSchema.parse(ctx.config);
    const res = await fetch(exportUrl(cfg), { redirect: "follow", signal: AbortSignal.timeout(30_000) });
    if (!res.ok) throw new Error(`Falha ao baixar planilha: HTTP ${res.status}`);
    const sheet = await parseFile(Buffer.from(await res.arrayBuffer()), "sheet.csv");
    const mapping = cfg.mapping ?? suggestMapping(cfg.target, sheet.headers, sheet.rows.slice(0, 200)).mapping;
    const missing = TARGET_FIELDS[cfg.target].filter((f) => f.required && !mapping[f.key]);
    if (missing.length) throw new Error(`Campos obrigatórios sem mapeamento: ${missing.map((m) => m.label).join(", ")}`);
    const { batch, errors } = transformRows(cfg.target, sheet.rows, mapping);
    ctx.log(`Planilha lida: ${sheet.rows.length} linhas, ${errors.length} rejeitadas na transformação.`, errors.length ? "warn" : "info");
    return { batch, hasMore: false };
  },
};

function exportUrl(cfg: z.infer<typeof configSchema>) {
  return `https://docs.google.com/spreadsheets/d/${cfg.spreadsheetId}/export?format=csv&gid=${cfg.gid}`;
}
