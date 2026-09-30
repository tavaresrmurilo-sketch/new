/**
 * Cria (ou redefine a senha de) um administrador.
 *
 *   npm run admin:create -- --email voce@exemplo.com --name "Seu Nome" --password "SenhaForte123"
 *
 * Sem argumentos, usa ADMIN_EMAIL / ADMIN_NAME / ADMIN_PASSWORD do .env.
 * A senha nunca fica no código: só o hash bcrypt vai para o banco.
 */
import "../prisma/load-env";
import { db } from "../src/lib/db";
import { hashPassword, passwordProblems } from "../src/lib/security/password";

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index > -1 ? process.argv[index + 1] : undefined;
}

async function main() {
  const email = (arg("email") ?? process.env.ADMIN_EMAIL ?? "").trim().toLowerCase();
  const name = (arg("name") ?? process.env.ADMIN_NAME ?? "Administrador").trim();
  const password = arg("password") ?? process.env.ADMIN_PASSWORD ?? "";
  if (!email || !password) throw new Error("Informe --email e --password (ou ADMIN_EMAIL e ADMIN_PASSWORD no .env)");
  const problem = passwordProblems(password);
  if (problem) throw new Error(problem);

  const passwordHash = await hashPassword(password);
  const user = await db.user.upsert({
    where: { email },
    create: { email, name, passwordHash },
    update: { name, passwordHash },
  });
  await db.admin.upsert({
    where: { userId: user.id },
    create: { userId: user.id, role: "OWNER" },
    update: { active: true, failedLoginCount: 0, lockedUntil: null },
  });
  // Senha trocada: encerra sessões antigas.
  await db.session.deleteMany({ where: { userId: user.id } });
  console.log(`Administrador ${email} pronto. Acesse /admin/login.`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
