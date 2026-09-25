import mysql from "mysql2/promise";
import { assertReadOnlySql, buildSelect } from "./identifiers";
import { classifyType, LIMITS, tableKey, type ColumnMeta, type DbConnection, type SqlSession, type TableRef } from "./types";

/** Sessão MySQL/MariaDB de curta duração: 1 conexão, transação somente leitura, timeouts. */
export async function openMysql(cfg: DbConnection): Promise<SqlSession> {
  const conn = await mysql.createConnection({
    host: cfg.host,
    port: cfg.port,
    database: cfg.database,
    user: cfg.username,
    password: cfg.password,
    ssl: cfg.ssl ? { rejectUnauthorized: cfg.sslRejectUnauthorized } : undefined,
    connectTimeout: LIMITS.connectTimeoutMs,
    dateStrings: ["DATE"],
    supportBigNumbers: true,
    bigNumberStrings: false,
    multipleStatements: false,
  });
  conn.on("error", () => undefined);
  try {
    await conn.query("SET SESSION TRANSACTION READ ONLY");
    // MySQL usa MAX_EXECUTION_TIME; MariaDB usa max_statement_time — aplica o que existir.
    await conn.query(`SET SESSION MAX_EXECUTION_TIME = ${LIMITS.statementTimeoutMs}`).catch(() => conn.query(`SET SESSION max_statement_time = ${LIMITS.statementTimeoutMs / 1000}`).catch(() => undefined));
  } catch (err) {
    await conn.end().catch(() => undefined);
    throw err;
  }
  const run = async <T>(sql: string, params: unknown[] = []) => {
    const [rows] = await conn.query({ sql, values: params, timeout: LIMITS.statementTimeoutMs });
    return rows as T;
  };
  return {
    kind: "mysql",
    async listTables() {
      const rows = await run<{ schema: string; name: string; type: string }[]>(
        `SELECT TABLE_SCHEMA AS \`schema\`, TABLE_NAME AS name, TABLE_TYPE AS type FROM information_schema.tables
         WHERE TABLE_SCHEMA = DATABASE() ORDER BY TABLE_NAME LIMIT ${LIMITS.maxTables}`,
      );
      return rows.map((t) => ({ schema: t.schema, name: t.name, type: /VIEW/i.test(t.type) ? "VIEW" : "TABLE" }));
    },
    async listColumns(tables: TableRef[]) {
      const out = new Map<string, ColumnMeta[]>();
      if (!tables.length) return out;
      const rows = await run<{ schema: string; tbl: string; name: string; type: string }[]>(
        `SELECT TABLE_SCHEMA AS \`schema\`, TABLE_NAME AS tbl, COLUMN_NAME AS name, DATA_TYPE AS type FROM information_schema.columns
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN (?) ORDER BY TABLE_NAME, ORDINAL_POSITION`,
        [tables.map((t) => t.name)],
      );
      const wanted = new Set(tables.map(tableKey));
      for (const c of rows) {
        const k = tableKey({ schema: c.schema, name: c.tbl });
        if (!wanted.has(k)) continue;
        out.set(k, [...(out.get(k) ?? []), { name: c.name, type: c.type, kind: classifyType(c.type) }]);
      }
      return out;
    },
    async select(q) {
      const { sql, params } = buildSelect("mysql", q);
      assertReadOnlySql(sql);
      return run<Record<string, unknown>[]>(sql, params);
    },
    async close() {
      await conn.end().catch(() => undefined);
    },
  };
}
