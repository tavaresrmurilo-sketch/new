import { prisma } from "@/lib/db";
import { transformRows } from "@/server/cortex/import";
import { extractItems, flatten, restConnectionSchema, restGet } from "../rest";
import type { ConnectorProvider, RowRejection } from "../types";

/**
 * API REST genérica (somente GET). Cada endpoint autorizado é uma "tabela" com mapeamento de campos
 * (campo canônico -> caminho no JSON, ex.: cliente.nome).
 */
export const restApiProvider: ConnectorProvider = {
  id: "rest-api",
  label: "API REST",
  type: "API",
  description: "Conecte qualquer sistema com API REST JSON (HTTPS), mapeando campos para o modelo do Cortex.",
  availability: "available",
  credentialFields: [],
  async testConnection(ctx) {
    const cfg = restConnectionSchema.parse(JSON.parse(ctx.credentials.connection ?? "{}"));
    const path = ctx.tables[0]?.tableName ?? "/";
    const r = await restGet(cfg, path);
    return { ok: r.status >= 200 && r.status < 300, message: `HTTP ${r.status} em ${path} (${r.ms} ms).` };
  },
  async fetch(ctx, { page }) {
    const endpoints = ctx.tables.filter((t) => t.entity);
    if (!endpoints.length) return { batch: {}, hasMore: false };
    const ep = endpoints[page];
    const cfg = restConnectionSchema.parse(JSON.parse(ctx.credentials.connection ?? "{}"));
    const r = await restGet(cfg, ep.tableName);
    if (r.status < 200 || r.status >= 300) throw new Error(`A API respondeu HTTP ${r.status} em ${ep.tableName}.`);
    const items = extractItems(r.body, ep.schemaName || null).slice(0, 50_000).map((i) => flatten(i));
    const { batch, errors } = transformRows(ep.entity!, items, ep.mapping, { machineNumbers: true });
    const rejected: RowRejection[] = errors.map((e) => ({ message: e.message, metadata: { endpoint: ep.tableName, item: e.row - 1 } }));
    ctx.log(`${ep.tableName}: ${items.length} itens recebidos em ${r.ms} ms, ${rejected.length} rejeitados.`, rejected.length ? "warn" : "info");
    return {
      batch,
      rejected,
      hasMore: page < endpoints.length - 1,
      afterIngest: async () => {
        await prisma.integrationTable.update({ where: { id: ep.id }, data: { lastSyncedAt: new Date(), rowsSynced: { increment: items.length } } });
      },
    };
  },
};
