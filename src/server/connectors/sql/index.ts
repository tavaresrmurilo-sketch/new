import { assertPublicHost } from "./network";
import { openMysql } from "./mysql";
import { openPostgres } from "./postgres";
import { openSqlServer } from "./sqlserver";
import type { DbConnection, SqlKind, SqlSession } from "./types";

/** Abre uma sessão de leitura, executa a ação e sempre fecha a conexão (padrão serverless). */
export async function withSqlSession<T>(kind: SqlKind, cfg: DbConnection, fn: (s: SqlSession) => Promise<T>): Promise<T> {
  await assertPublicHost(cfg.host);
  const session = kind === "postgresql" ? await openPostgres(cfg) : kind === "mysql" ? await openMysql(cfg) : await openSqlServer(cfg);
  try {
    return await fn(session);
  } finally {
    await session.close();
  }
}

export * from "./types";
