import { z } from "zod";

export type SqlKind = "postgresql" | "mysql" | "sqlserver";

export const DEFAULT_PORTS: Record<SqlKind, number> = { postgresql: 5432, mysql: 3306, sqlserver: 1433 };

/** Configuração de conexão informada pelo cliente. Sempre armazenada cifrada (Credentials Vault). */
export const dbConnectionSchema = z.object({
  connectionString: z.string().trim().max(2000).optional(),
  host: z.string().trim().max(255).optional(),
  port: z.coerce.number().int().min(1).max(65535).optional(),
  database: z.string().trim().max(128).optional(),
  username: z.string().trim().max(128).optional(),
  password: z.string().max(512).optional(),
  ssl: z.boolean().default(false),
  sslRejectUnauthorized: z.boolean().default(true),
  encrypt: z.boolean().default(true),
  trustServerCertificate: z.boolean().default(false),
});

export type DbConnectionInput = z.infer<typeof dbConnectionSchema>;

export interface DbConnection {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  ssl: boolean;
  sslRejectUnauthorized: boolean;
  encrypt: boolean;
  trustServerCertificate: boolean;
}

export interface TableRef {
  schema: string;
  name: string;
  type?: "TABLE" | "VIEW";
}

export interface ColumnMeta {
  name: string;
  type: string;
  /** categoria simplificada para mapeamento e incremental */
  kind: "date" | "number" | "text" | "boolean" | "other";
}

export interface SelectQuery {
  table: TableRef;
  columns: string[];
  incrementalColumn?: string | null;
  /** valor mínimo (>=) para sincronização incremental */
  since?: string | number | Date | null;
  orderBy?: string | null;
  limit: number;
  offset: number;
}

export interface SqlSession {
  kind: SqlKind;
  listTables(): Promise<TableRef[]>;
  listColumns(tables: TableRef[]): Promise<Map<string, ColumnMeta[]>>;
  select(query: SelectQuery): Promise<Record<string, unknown>[]>;
  close(): Promise<void>;
}

export const tableKey = (t: { schema: string; name: string }) => `${t.schema}.${t.name}`;

export const LIMITS = {
  connectTimeoutMs: 10_000,
  statementTimeoutMs: 30_000,
  batchSize: 1_000,
  maxTables: 1_000,
  maxRowsPerTablePerSync: Number(process.env.SYNC_MAX_ROWS_PER_TABLE ?? 50_000),
};

export function classifyType(raw: string): ColumnMeta["kind"] {
  const t = raw.toLowerCase();
  if (/(date|time|stamp)/.test(t)) return "date";
  if (/(int|numeric|decimal|real|double|float|money|number|serial)/.test(t)) return "number";
  if (/(bool|bit)/.test(t)) return "boolean";
  if (/(char|text|string|uuid|varchar|nvarchar|citext|enum)/.test(t)) return "text";
  return "other";
}

/** Converte a entrada (campos ou connection string) para uma configuração única. */
export function normalizeConnection(kind: SqlKind, input: DbConnectionInput): DbConnection {
  let host = input.host;
  let port = input.port;
  let database = input.database;
  let username = input.username;
  let password = input.password;
  let ssl = input.ssl;
  if (input.connectionString) {
    const cs = input.connectionString;
    if (kind === "sqlserver" && !/^[a-z]+:\/\//i.test(cs)) {
      const kv = Object.fromEntries(
        cs.split(";").filter(Boolean).map((p) => {
          const i = p.indexOf("=");
          return [p.slice(0, i).trim().toLowerCase(), p.slice(i + 1).trim()];
        }),
      );
      const server = (kv.server ?? kv["data source"] ?? "").replace(/^tcp:/i, "");
      const [h, pt] = server.split(",");
      host = h;
      port = pt ? Number(pt) : port;
      database = kv.database ?? kv["initial catalog"] ?? database;
      username = kv["user id"] ?? kv.uid ?? kv.user ?? username;
      password = kv.password ?? kv.pwd ?? password;
    } else {
      let url: URL;
      try {
        url = new URL(cs);
      } catch {
        throw new ConnectionConfigError("Connection string inválida.");
      }
      host = decodeURIComponent(url.hostname);
      port = url.port ? Number(url.port) : port;
      database = decodeURIComponent(url.pathname.replace(/^\//, "")) || database;
      username = decodeURIComponent(url.username) || username;
      password = url.password ? decodeURIComponent(url.password) : password;
      const sslmode = url.searchParams.get("sslmode") ?? url.searchParams.get("ssl");
      if (sslmode && !["disable", "false", "0"].includes(sslmode)) ssl = true;
    }
  }
  if (!host || !database || !username) throw new ConnectionConfigError("Informe host, banco de dados e usuário (ou uma connection string válida).");
  if (!/^[a-zA-Z0-9.\-_:[\]]+$/.test(host)) throw new ConnectionConfigError("Host inválido.");
  return {
    host,
    port: port ?? DEFAULT_PORTS[kind],
    database,
    username,
    password: password ?? "",
    ssl,
    sslRejectUnauthorized: input.sslRejectUnauthorized,
    encrypt: input.encrypt,
    trustServerCertificate: input.trustServerCertificate,
  };
}

export class ConnectionConfigError extends Error {}
