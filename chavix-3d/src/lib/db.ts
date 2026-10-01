import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient(): PrismaClient {
  // A conexão só é aberta na primeira consulta; sem DATABASE_URL o erro aparece ali,
  // o que permite importar este módulo durante o build.
  // DATABASE_URL (Neon/padrão) ou POSTGRES_URL (integração Supabase da Vercel).
  const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL || "";
  const adapter = new PrismaPg({ connectionString, max: 10 });
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

export const db = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;

export type Db = typeof db;
export type Tx = Parameters<Parameters<typeof db.$transaction>[0]>[0];
