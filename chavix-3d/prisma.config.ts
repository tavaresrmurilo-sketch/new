import { config } from "dotenv";
import { defineConfig } from "prisma/config";

// O Prisma 7 não carrega o .env sozinho: carregamos aqui (sem sobrescrever
// variáveis já definidas pelo ambiente, como na Vercel).
config({ quiet: true });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    // react-server: permite reutilizar módulos marcados com "server-only" no seed.
    seed: "tsx --conditions=react-server prisma/seed.ts",
  },
  datasource: {
    // Migrations preferem a conexão direta (sem pooler) quando disponível.
    url: process.env.DIRECT_URL || process.env.DATABASE_URL || "",
  },
});
