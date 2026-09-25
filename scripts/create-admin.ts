/** Cria o administrador principal a partir do .env (ADMIN_NAME, ADMIN_EMAIL, ADMIN_PASSWORD). Uso: npm run admin:create */
import { prisma } from "@/lib/db";
import { ensureAdmin } from "@/server/bootstrap/admin";

ensureAdmin(prisma)
  .then((r) => {
    console.log(r.status === "created" ? `Administrador criado: ${r.email}` : r.status === "exists" ? `Administrador já existe: ${r.email}` : `Não criado: ${r.reason}`);
    if (r.status === "skipped") process.exitCode = 1;
  })
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
