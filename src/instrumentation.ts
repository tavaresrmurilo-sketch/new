/**
 * Executado uma vez quando o servidor Next.js inicia (inclusive em cada instância da Vercel).
 * Valida variáveis obrigatórias e registra, sem expor segredos, o início da aplicação e a conexão com o banco.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { logger } = await import("@/lib/logger");
  const { env } = await import("@/lib/env");

  try {
    const e = env();
    logger.info("app.started", { nodeEnv: e.NODE_ENV, aiProvider: e.AI_PROVIDER });
  } catch (err) {
    // Mensagem lista apenas os NOMES das variáveis inválidas/ausentes.
    logger.error("app.invalid_environment", { err: err instanceof Error ? err.message : String(err) });
    if (process.env.NODE_ENV === "production") throw err;
    return;
  }

  try {
    const { prisma } = await import("@/lib/db");
    const t0 = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    logger.info("db.connected", { latencyMs: Date.now() - t0 });
  } catch (err) {
    const e = err as { code?: string; name?: string };
    logger.error("db.connection_failed", { prismaCode: e.code ?? e.name });
  }
}
