import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { PLANS } from "@/lib/plans";
import { audit } from "@/server/audit";
import { apiRoute, requireApi } from "@/server/auth/guard";
import { hashPassword, passwordSchema } from "@/server/auth/password";
import { ASSIGNABLE_ROLES } from "@/server/auth/permissions";
import { AppError } from "@/server/errors";
import { sanitizeText } from "@/server/security/sanitize";

const schema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email().max(200),
  role: z.enum(ASSIGNABLE_ROLES as [string, ...string[]]),
  password: passwordSchema,
});

export const POST = apiRoute(async (req) => {
  const ctx = await requireApi("users:manage");
  const b = schema.parse(await req.json());
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: ctx.tenantId }, select: { plan: true } });
  const count = await prisma.user.count({ where: { tenantId: ctx.tenantId, active: true } });
  if (count >= PLANS[tenant.plan].users) throw new AppError(`Limite de usuários do plano ${PLANS[tenant.plan].label} atingido (${PLANS[tenant.plan].users}).`, 402, "PLAN_LIMIT");
  if (await prisma.user.findUnique({ where: { email: b.email } })) throw new AppError("Já existe um usuário com este e-mail.", 409);
  const role = await prisma.role.findFirstOrThrow({ where: { tenantId: null, key: b.role as never } });
  const user = await prisma.user.create({ data: { tenantId: ctx.tenantId, name: sanitizeText(b.name, 120), email: b.email, roleId: role.id, passwordHash: await hashPassword(b.password) } });
  await audit(ctx, { action: "user.created", resource: "user", resourceId: user.id, metadata: { email: b.email, role: b.role } });
  return NextResponse.json({ id: user.id });
});
