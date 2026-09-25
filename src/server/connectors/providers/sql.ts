import { prisma } from "@/lib/db";
import { transformRows } from "@/server/cortex/import";
import type { CanonicalBatch } from "@/server/cortex/records";
import { withSqlSession } from "../sql";
import { assertKnownColumns, assertKnownTable } from "../sql/identifiers";
import { dbConnectionSchema, LIMITS, normalizeConnection, tableKey, type SqlKind } from "../sql/types";
import type { ConnectorProvider, RowRejection } from "../types";

type CursorValue = { t: "d" | "n" | "s"; v: string };

export function encodeCursor(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return JSON.stringify({ t: "d", v: v.toISOString() } satisfies CursorValue);
  if (typeof v === "number" || typeof v === "bigint") return JSON.stringify({ t: "n", v: String(v) } satisfies CursorValue);
  return JSON.stringify({ t: "s", v: String(v) } satisfies CursorValue);
}

export function decodeCursor(s: string | null): string | number | Date | null {
  if (!s) return null;
  try {
    const c = JSON.parse(s) as CursorValue;
    return c.t === "d" ? new Date(c.v) : c.t === "n" ? Number(c.v) : c.v;
  } catch {
    return null;
  }
}

const greater = (a: unknown, b: unknown) => {
  if (b === null || b === undefined) return true;
  if (a instanceof Date && b instanceof Date) return a.getTime() > b.getTime();
  if (typeof a === "number" && typeof b === "number") return a > b;
  return String(a) > String(b);
};

/**
 * Conector de banco relacional externo (somente leitura). Cada "página" da sincronização é uma
 * tabela autorizada; o cursor incremental da tabela só avança após a ingestão bem-sucedida.
 */
export function sqlProvider(kind: SqlKind, label: string, description: string): ConnectorProvider {
  return {
    id: kind,
    label,
    type: "DATABASE",
    description,
    availability: "available",
    credentialFields: [],
    async testConnection(ctx) {
      const cfg = normalizeConnection(kind, dbConnectionSchema.parse(JSON.parse(ctx.credentials.connection ?? "{}")));
      const tables = await withSqlSession(kind, cfg, (s) => s.listTables());
      return { ok: true, message: `Conexão realizada com sucesso. ${tables.length} tabelas/views disponíveis.` };
    },
    async fetch(ctx, { mode, page }) {
      const tables = ctx.tables.filter((t) => t.entity);
      if (!tables.length) {
        ctx.log("Nenhuma tabela habilitada com entidade mapeada.", "warn");
        return { batch: {}, hasMore: false };
      }
      const t = tables[page];
      const cfg = normalizeConnection(kind, dbConnectionSchema.parse(JSON.parse(ctx.credentials.connection ?? "{}")));
      const ref = { schema: t.schemaName, name: t.tableName };
      const mappedCols = [...new Set(Object.values(t.mapping).filter((c): c is string => Boolean(c)))];
      const columns = [...new Set([...mappedCols, ...(t.incrementalColumn ? [t.incrementalColumn] : [])])];
      const incremental = mode === "INCREMENTAL" && t.incrementalColumn ? decodeCursor(t.lastCursor) : null;

      const rows = await withSqlSession(kind, cfg, async (s) => {
        // valida identificadores contra a metadata atual da fonte (nunca SQL livre)
        assertKnownTable(ref, await s.listTables());
        const live = (await s.listColumns([ref])).get(tableKey(ref)) ?? [];
        assertKnownColumns(columns, live);
        const out: Record<string, unknown>[] = [];
        for (let offset = 0; offset < LIMITS.maxRowsPerTablePerSync; offset += LIMITS.batchSize) {
          const chunk = await s.select({ table: ref, columns, incrementalColumn: t.incrementalColumn, since: incremental, orderBy: t.mapping.externalId ?? columns[0], limit: LIMITS.batchSize, offset });
          out.push(...chunk);
          if (chunk.length < LIMITS.batchSize) break;
        }
        return out;
      });

      let maxCursor: unknown = incremental;
      if (t.incrementalColumn) for (const r of rows) if (greater(r[t.incrementalColumn], maxCursor)) maxCursor = r[t.incrementalColumn];
      const { batch, errors } = t.entity ? transformRows(t.entity, rows, t.mapping, { machineNumbers: true }) : { batch: {} as CanonicalBatch, errors: [] };
      const rejected: RowRejection[] = errors.map((e) => ({ message: e.message, metadata: { table: tableKey(ref), row: e.row - 1 } }));
      ctx.log(`${tableKey(ref)}: ${rows.length} linhas lidas${incremental ? " (incremental)" : ""}, ${rejected.length} rejeitadas na validação.`, rejected.length ? "warn" : "info");
      if (rows.length >= LIMITS.maxRowsPerTablePerSync) ctx.log(`${tableKey(ref)}: limite de ${LIMITS.maxRowsPerTablePerSync} linhas por sincronização atingido; o restante segue na próxima execução.`, "warn");

      return {
        batch,
        rejected,
        hasMore: page < tables.length - 1,
        afterIngest: async () => {
          await prisma.integrationTable.update({
            where: { id: t.id },
            data: { lastCursor: encodeCursor(maxCursor) ?? t.lastCursor, lastSyncedAt: new Date(), rowsSynced: { increment: rows.length } },
          });
        },
      };
    },
  };
}
