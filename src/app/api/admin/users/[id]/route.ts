import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { audit } from "@/server/audit";
import { apiRoute, requireAdminApi } from "@/server/auth/guard";
import { AppError, ForbiddenError, NotFoundError } from "@/server/errors";

const schema = z.object({ active: z.boolean() });

/** Bloqueio/desbloqueio de usuários pelo administrador (validado no servidor). */
export const PATCH = apiRoute<{ id: string }>(async (req, { id }) => {
  const ctx = await requireAdminApi();
  if (ctx.supportMode) throw new ForbiddenError();
  const { active } = schema.parse(await req.json());
  if (id === ctx.userId) throw new AppError("Você não pode bloquear a própria conta.", 422, "SELF_ACTION");
  const user = await prisma.user.findUnique({ where: { id }, select: { id: true, email: true, userRole: true, tenantId: true } });
  if (!user) throw new NotFoundError("Usuário não encontrado.");
  if (!active && user.userRole === "ADMIN") {
    const activeAdmins = await prisma.user.count({ where: { userRole: "ADMIN", active: true } });
    if (activeAdmins <= 1) throw new AppError("Não é possível bloquear o último administrador ativo.", 422, "LAST_ADMIN");
  }
  await prisma.user.update({ where: { id }, data: { active, ...(active ? { failedLogins: 0, lockedUntil: null } : {}) } });
  if (!active) await prisma.session.deleteMany({ where: { userId: id } });
  await audit({ tenantId: user.tenantId, userId: ctx.userId, userEmail: ctx.userEmail }, { action: active ? "admin.user_unblocked" : "admin.user_blocked", resource: "user", resourceId: id, metadata: { email: user.email } });
  return NextResponse.json({ ok: true });
});
