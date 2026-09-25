import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { slugify } from "@/lib/utils";
import { audit } from "@/server/audit";
import { apiRoute, clientKey, enforceRateLimit } from "@/server/auth/guard";
import { hashPassword } from "@/server/auth/password";
import { createSession } from "@/server/auth/session";
import { AppError } from "@/server/errors";
import { requestInfo } from "@/server/request";
import { LIMITS } from "@/server/security/rate-limit";
import { sanitizeText } from "@/server/security/sanitize";
import { registerSchema } from "@/server/schemas";
import { seedTenantDefaults } from "@/server/tenant-setup";

export const POST = apiRoute(async (req) => {
  enforceRateLimit(clientKey(req, "register"), LIMITS.register);
  const data = registerSchema.parse(await req.json());
  if (await prisma.user.findUnique({ where: { email: data.email } })) throw new AppError("Já existe um usuário com este e-mail.", 409, "EMAIL_TAKEN");
  const role = await prisma.role.findFirst({ where: { tenantId: null, key: "ADMIN_CLIENTE" } });
  if (!role) throw new AppError("Papéis do sistema não configurados. Execute o seed.", 500);

  const isPerson = data.accountType === "PERSON";
  const firstName = isPerson ? sanitizeText(data.firstName, 60) : null;
  const lastName = isPerson ? sanitizeText(data.lastName, 80) : null;
  const userName = isPerson ? `${firstName} ${lastName}` : sanitizeText(data.name, 120);
  const workspaceName = isPerson ? userName : sanitizeText(data.companyName, 120);

  let slug = slugify(workspaceName) || (isPerson ? "pessoal" : "empresa");
  if (await prisma.tenant.findUnique({ where: { slug } })) slug = `${slug}-${Math.random().toString(36).slice(2, 7)}`;

  const { tenant, user } = await prisma.$transaction(async (tx) => {
    const tenant = await tx.tenant.create({
      data: {
        name: workspaceName,
        kind: isPerson ? "PERSONAL" : "BUSINESS",
        slug,
        cnpj: isPerson ? null : (data.cnpj ?? null),
        plan: "STARTER",
        status: "TRIAL",
        subscription: { create: { plan: "STARTER", provider: "NONE", status: "trialing", currentPeriodEnd: new Date(Date.now() + 14 * 86_400_000) } },
      },
    });
    const user = await tx.user.create({
      data: {
        tenantId: tenant.id,
        email: data.email,
        name: userName,
        firstName,
        lastName,
        userRole: isPerson ? "PERSON" : "COMPANY",
        passwordHash: await hashPassword(data.password),
        roleId: role.id,
      },
    });
    return { tenant, user };
  });
  await seedTenantDefaults(tenant.id);
  const info = await requestInfo();
  await createSession(user.id, tenant.id, info.ip, info.userAgent);
  await audit({ tenantId: tenant.id, userId: user.id, userEmail: user.email }, { action: "account.created", resource: "user", resourceId: user.id, metadata: { accountType: data.accountType } });
  return NextResponse.json({ redirect: "/onboarding" });
});
