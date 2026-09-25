import type { ColumnMeta, SelectQuery, SqlKind, TableRef } from "./types";

/**
 * Proteção contra SQL injection em identificadores: nomes de schema/tabela/coluna só são aceitos
 * se existirem na metadata descoberta da conexão; valores sempre vão como parâmetros.
 */
export class IdentifierError extends Error {}

export function quoteIdent(kind: SqlKind, name: string): string {
  if (!name || name.length > 128 || /[\u0000]/.test(name)) throw new IdentifierError("Identificador inválido.");
  if (kind === "postgresql") return `"${name.replace(/"/g, '""')}"`;
  if (kind === "mysql") return `\`${name.replace(/`/g, "``")}\``;
  return `[${name.replace(/]/g, "]]")}]`;
}

export function assertKnownTable(table: TableRef, known: TableRef[]): TableRef {
  const hit = known.find((t) => t.schema === table.schema && t.name === table.name);
  if (!hit) throw new IdentifierError(`Tabela não encontrada na fonte: ${table.schema ? `${table.schema}.` : ""}${table.name}`);
  return hit;
}

export function assertKnownColumns(columns: string[], known: ColumnMeta[]): void {
  const names = new Set(known.map((c) => c.name));
  for (const c of columns) if (!names.has(c)) throw new IdentifierError(`Coluna não encontrada na fonte: ${c}`);
}

/** Garante que apenas SELECT é executado (defesa extra além do construtor). */
export function assertReadOnlySql(sql: string): void {
  const s = sql.trim();
  if (!/^(select|with)\s/i.test(s) || s.includes(";") || /\b(insert|update|delete|drop|alter|truncate|create|grant|revoke|merge|exec|execute|call|into)\b/i.test(s.replace(/(["`[]).*?(["`\]])/g, "")))
    throw new IdentifierError("Somente consultas de leitura são permitidas.");
}

/** Monta um SELECT parametrizado para o dialeto. Colunas e tabela já devem ter sido validadas. */
export function buildSelect(kind: SqlKind, q: SelectQuery): { sql: string; params: unknown[] } {
  const cols = [...new Set(q.columns)].map((c) => quoteIdent(kind, c)).join(", ");
  const table = q.table.schema ? `${quoteIdent(kind, q.table.schema)}.${quoteIdent(kind, q.table.name)}` : quoteIdent(kind, q.table.name);
  const params: unknown[] = [];
  const ph = (v: unknown) => {
    params.push(v);
    return kind === "postgresql" ? `$${params.length}` : kind === "mysql" ? "?" : `@p${params.length}`;
  };
  let where = "";
  if (q.incrementalColumn && q.since !== undefined && q.since !== null) where = ` WHERE ${quoteIdent(kind, q.incrementalColumn)} >= ${ph(q.since)}`;
  const orderCol = q.incrementalColumn ?? q.orderBy ?? q.columns[0];
  const order = ` ORDER BY ${quoteIdent(kind, orderCol)} ASC`;
  const limit = Math.max(1, Math.min(10_000, Math.floor(q.limit)));
  const offset = Math.max(0, Math.floor(q.offset));
  const page = kind === "sqlserver" ? ` OFFSET ${ph(offset)} ROWS FETCH NEXT ${ph(limit)} ROWS ONLY` : ` LIMIT ${ph(limit)} OFFSET ${ph(offset)}`;
  const sql = `SELECT ${cols} FROM ${table}${where}${order}${page}`;
  assertReadOnlySql(sql);
  return { sql, params };
}
