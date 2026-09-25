import pg from "pg";
import { buildSelect, assertReadOnlySql } from "./identifiers";
import { classifyType, LIMITS, tableKey, type ColumnMeta, type DbConnection, type SqlSession, type TableRef } from "./types";

// DATE sem fuso vira string ISO (evita deslocamento de fuso ao converter para Date).
pg.types.setTypeParser(1082, (v: string) => v);

/** Sessão PostgreSQL de curta duração (compatível com serverless): 1 conexão, somente leitura, com timeouts. */
export async function openPostgres(cfg: DbConnection): Promise<SqlSession> {
  const client = new pg.Client({
    host: cfg.host,
    port: cfg.port,
    database: cfg.database,
    user: cfg.username,
    password: cfg.password,
    ssl: cfg.ssl ? { rejectUnauthorized: cfg.sslRejectUnauthorized } : false,
    connectionTimeoutMillis: LIMITS.connectTimeoutMs,
    query_timeout: LIMITS.statementTimeoutMs,
    statement_timeout: LIMITS.statementTimeoutMs,
    application_name: "jr-cortex-ai (read-only)",
  });
  client.on("error", () => undefined);
  await client.connect();
  try {
    await client.query("SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY");
  } catch (err) {
    await client.end().catch(() => undefined);
    throw err;
  }
  return {
    kind: "postgresql",
    async listTables() {
      const r = await client.query<{ schema: string; name: string; type: string }>(
        `SELECT table_schema AS schema, table_name AS name, table_type AS type FROM information_schema.tables
         WHERE table_schema NOT IN ('pg_catalog', 'information_schema') AND table_schema NOT LIKE 'pg\\_%'
         ORDER BY 1, 2 LIMIT ${LIMITS.maxTables}`,
      );
      return r.rows.map((t) => ({ schema: t.schema, name: t.name, type: t.type === "VIEW" ? "VIEW" : "TABLE" }));
    },
    async listColumns(tables: TableRef[]) {
      const out = new Map<string, ColumnMeta[]>();
      if (!tables.length) return out;
      const r = await client.query<{ schema: string; tbl: string; name: string; type: string }>(
        `SELECT table_schema AS schema, table_name AS tbl, column_name AS name, data_type AS type FROM information_schema.columns
         WHERE table_schema = ANY($1) AND table_name = ANY($2) ORDER BY table_schema, table_name, ordinal_position`,
        [[...new Set(tables.map((t) => t.schema))], [...new Set(tables.map((t) => t.name))]],
      );
      const wanted = new Set(tables.map(tableKey));
      for (const c of r.rows) {
        const k = tableKey({ schema: c.schema, name: c.tbl });
        if (!wanted.has(k)) continue;
        out.set(k, [...(out.get(k) ?? []), { name: c.name, type: c.type, kind: classifyType(c.type) }]);
      }
      return out;
    },
    async select(q) {
      const { sql, params } = buildSelect("postgresql", q);
      assertReadOnlySql(sql);
      const r = await client.query(sql, params);
      return r.rows as Record<string, unknown>[];
    },
    async close() {
      await client.end().catch(() => undefined);
    },
  };
}
