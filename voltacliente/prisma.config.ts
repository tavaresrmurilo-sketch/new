import "dotenv/config";
import { defineConfig } from "prisma/config";

// Migrações usam a conexão direta (sem pooler). No Neon, defina DIRECT_URL com a
// string "unpooled"; localmente basta DATABASE_URL.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env.DIRECT_URL || process.env.DATABASE_URL,
  },
});
