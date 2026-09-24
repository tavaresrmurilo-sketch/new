import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { audit } from "@/server/audit";
import { apiRoute, requireApi } from "@/server/auth/guard";
import { ASSIGNABLE_ROLES } from "@/server/auth/permissions";
import { AppError, NotFoundError } from "@/server/errors";

const schema = z.object({ role: z.enum(ASSIGNABLE_ROLES as [string, ...string[]]).optional(), active: z.boolean().optional() });

export const PATCH = apiRoute<{ id: string }>(async (req, { id }) => {
  const ctx = await requireApi("users:manage");
  const b = schema.parse(await req.json());
  const user = await prisma.user.findFirst({ where: { id, tenantId: ctx.tenantId }, include: { role: true } });
  if (!user) throw new NotFoundError("Usuário não encontrado.");
  if (user.id === ctx.userId && (b.active === false || (b.role && b.role !== user.role.key))) throw new AppError("Você não pode alterar o próprio papel ou se desativar.", 422);
  const role = b.role ? await prisma.role.findFirstOrThrow({ where: { tenantId: null, key: b.role as never } }) : null;
  await prisma.user.update({ where: { id }, data: { ...(role ? { roleId: role.id } : {}), ...(b.active !== undefined ? { active: b.active } : {}) } });
  if (b.active === false || role) await prisma.session.deleteMany({ where: { userId: id } });
  await audit(ctx, { action: "user.updated", resource: "user", resourceId: id, metadata: { from: user.role.key, to: b.role ?? user.role.key, active: b.active ?? user.active } });
  return NextResponse.json({ ok: true });
});
