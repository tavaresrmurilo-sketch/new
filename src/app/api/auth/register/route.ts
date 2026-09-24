import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { slugify } from "@/lib/utils";
import { audit } from "@/server/audit";
import { apiRoute, clientKey, enforceRateLimit } from "@/server/auth/guard";
import { hashPassword, passwordSchema } from "@/server/auth/password";
import { createSession } from "@/server/auth/session";
import { AppError } from "@/server/errors";
import { requestInfo } from "@/server/request";
import { LIMITS } from "@/server/security/rate-limit";
import { sanitizeText } from "@/server/security/sanitize";
import { seedTenantDefaults } from "@/server/tenant-setup";

const schema = z.object({
  companyName: z.string().trim().min(2, "Informe o nome da empresa").max(120),
  cnpj: z.string().trim().max(20).regex(/^[\d./-]*$/, "CNPJ inválido").optional(),
  name: z.string().trim().min(2, "Informe seu nome").max(120),
  email: z.string().trim().toLowerCase().email("E-mail inválido").max(200),
  password: passwordSchema,
  acceptTerms: z.literal(true, { errorMap: () => ({ message: "É necessário aceitar os termos" }) }),
});

export const POST = apiRoute(async (req) => {
  enforceRateLimit(clientKey(req, "register"), LIMITS.register);
  const data = schema.parse(await req.json());
  if (await prisma.user.findUnique({ where: { email: data.email } })) throw new AppError("Já existe um usuário com este e-mail.", 409, "EMAIL_TAKEN");
  const role = await prisma.role.findFirst({ where: { tenantId: null, key: "ADMIN_CLIENTE" } });
  if (!role) throw new AppError("Papéis do sistema não configurados. Execute o seed.", 500);

  let slug = slugify(data.companyName) || "empresa";
  if (await prisma.tenant.findUnique({ where: { slug } })) slug = `${slug}-${Math.random().toString(36).slice(2, 7)}`;

  const tenant = await prisma.tenant.create({
    data: {
      name: sanitizeText(data.companyName, 120),
      slug,
      cnpj: data.cnpj || null,
      plan: "STARTER",
      status: "TRIAL",
      subscription: { create: { plan: "STARTER", provider: "NONE", status: "trialing", currentPeriodEnd: new Date(Date.now() + 14 * 86_400_000) } },
    },
  });
  const user = await prisma.user.create({
    data: { tenantId: tenant.id, email: data.email, name: sanitizeText(data.name, 120), passwordHash: await hashPassword(data.password), roleId: role.id },
  });
  await seedTenantDefaults(tenant.id);
  const info = await requestInfo();
  await createSession(user.id, tenant.id, info.ip, info.userAgent);
  await audit({ tenantId: tenant.id, userId: user.id, userEmail: user.email }, { action: "tenant.created", resource: "tenant", resourceId: tenant.id });
  return NextResponse.json({ redirect: "/onboarding" });
});
