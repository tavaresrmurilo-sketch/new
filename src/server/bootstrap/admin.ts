import type { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { passwordSchema } from "@/server/auth/password";

export type EnsureAdminResult = { status: "created" | "exists" | "skipped"; email?: string; reason?: string };

/**
 * Cria o administrador principal a partir de ADMIN_NAME / ADMIN_EMAIL / ADMIN_PASSWORD (.env).
 * Nunca sobrescreve a senha de um usuário existente e nunca usa credenciais fixas no código.
 */
export async function ensureAdmin(prisma: PrismaClient, env: Record<string, string | undefined> = process.env): Promise<EnsureAdminResult> {
  const email = env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = env.ADMIN_PASSWORD;
  const name = env.ADMIN_NAME?.trim() || "Administrador";
  if (!email || !password) return { status: "skipped", reason: "ADMIN_EMAIL e ADMIN_PASSWORD não definidos no .env" };
  const valid = passwordSchema.safeParse(password);
  if (!valid.success) return { status: "skipped", email, reason: `ADMIN_PASSWORD fraca: ${valid.error.issues[0].message}` };

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    if (existing.userRole !== "ADMIN") {
      return { status: "skipped", email, reason: "já existe um usuário não administrador com este e-mail (nada foi alterado)" };
    }
    return { status: "exists", email };
  }
  let role = await prisma.role.findFirst({ where: { tenantId: null, key: "SUPER_ADMIN" } });
  role ??= await prisma.role.create({ data: { key: "SUPER_ADMIN", name: "Super Admin (JR)", isSystem: true } });
  await prisma.user.create({
    data: { email, name, userRole: "ADMIN", passwordHash: await bcrypt.hash(password, 12), roleId: role.id, tenantId: null },
  });
  return { status: "created", email };
}
