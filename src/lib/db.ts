import { PrismaClient } from "@prisma/client";

/**
 * Singleton do PrismaClient. O cache em globalThis evita abrir um novo pool a cada hot reload
 * (desenvolvimento) e reaproveita o cliente entre invocações da mesma instância serverless (Vercel).
 * Em produção com Neon, use a URL com pooler (-pooler) em DATABASE_URL.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

globalForPrisma.prisma = prisma;
