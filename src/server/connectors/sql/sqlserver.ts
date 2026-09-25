import sql from "mssql";
import { assertReadOnlySql, buildSelect } from "./identifiers";
import { classifyType, LIMITS, tableKey, type ColumnMeta, type DbConnection, type SqlSession, type TableRef } from "./types";

/** Sessão SQL Server de curta duração: pool de 1 conexão, intenção somente leitura, timeouts. */
export async function openSqlServer(cfg: DbConnection): Promise<SqlSession> {
  const pool = new sql.ConnectionPool({
    server: cfg.host,
    port: cfg.port,
    database: cfg.database,
    user: cfg.username,
    password: cfg.password,
    connectionTimeout: LIMITS.connectTimeoutMs,
    requestTimeout: LIMITS.statementTimeoutMs,
    pool: { max: 1, min: 0, idleTimeoutMillis: 1_000 },
    options: { encrypt: cfg.encrypt, trustServerCertificate: cfg.trustServerCertificate, readOnlyIntent: true, appName: "jr-cortex-ai (read-only)" },
  });
  pool.on("error", () => undefined);
  await pool.connect();
  const run = async <T>(text: string, params: unknown[] = []) => {
    const req = pool.request();
    params.forEach((v, i) => req.input(`p${i + 1}`, v));
    const r = await req.query(text);
    return r.recordset as unknown as T;
  };
  return {
    kind: "sqlserver",
    async listTables() {
      const rows = await run<{ schema: string; name: string; type: string }[]>(
        `SELECT TOP (${LIMITS.maxTables}) TABLE_SCHEMA AS [schema], TABLE_NAME AS name, TABLE_TYPE AS type FROM INFORMATION_SCHEMA.TABLES
         WHERE TABLE_SCHEMA NOT IN ('sys', 'INFORMATION_SCHEMA') ORDER BY TABLE_SCHEMA, TABLE_NAME`,
      );
      return rows.map((t) => ({ schema: t.schema, name: t.name, type: /VIEW/i.test(t.type) ? "VIEW" : "TABLE" }));
    },
    async listColumns(tables: TableRef[]) {
      const out = new Map<string, ColumnMeta[]>();
      for (const t of tables) {
        const rows = await run<{ name: string; type: string }[]>(
          `SELECT COLUMN_NAME AS name, DATA_TYPE AS type FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @p1 AND TABLE_NAME = @p2 ORDER BY ORDINAL_POSITION`,
          [t.schema, t.name],
        );
        out.set(tableKey(t), rows.map((c) => ({ name: c.name, type: c.type, kind: classifyType(c.type) })));
      }
      return out;
    },
    async select(q) {
      const { sql: text, params } = buildSelect("sqlserver", q);
      assertReadOnlySql(text);
      return run<Record<string, unknown>[]>(text, params);
    },
    async close() {
      await pool.close().catch(() => undefined);
    },
  };
}
