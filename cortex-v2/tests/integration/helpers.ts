import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { ROLE_DEFAULTS } from "@/lib/permissions";
import type { Ctx } from "@/server/auth/context";
import { orgShape } from "@/server/auth/context";
import { computeAccess } from "@/server/billing/access";
import { tenantDb } from "@/server/db/tenant";
import { createOrganization } from "@/server/modules/organization/setup";

export const hasDb = Boolean(process.env.TEST_DATABASE_URL);

/** Cria usuário + empresa reais no banco de testes e devolve um Ctx equivalente ao de uma sessão. */
export async function makeWorkspace(role: keyof typeof ROLE_DEFAULTS = "OWNER"): Promise<Ctx> {
  const tag = randomUUID().slice(0, 8);
  const owner = await prisma.user.create({ data: { email: `owner-${tag}@test.local`, name: `Owner ${tag}` } });
  const { organization } = await createOrganization({ name: `Empresa ${tag}`, ownerUserId: owner.id });
  let user = owner;
  if (role !== "OWNER") {
    user = await prisma.user.create({ data: { email: `${role.toLowerCase()}-${tag}@test.local`, name: `${role} ${tag}` } });
    const r = await prisma.role.findFirst({ where: { organizationId: organization.id, key: role } });
    await prisma.organizationMember.create({ data: { organizationId: organization.id, userId: user.id, roleId: r!.id } });
  }
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: organization.id }, include: { subscription: { include: { plan: true } } } });
  const member = await prisma.organizationMember.findFirstOrThrow({ where: { organizationId: org.id, userId: user.id }, include: { role: true } });
  return {
    via: "session",
    sessionId: null,
    user: { id: user.id, name: user.name, email: user.email, avatarUrl: null, isSuperAdmin: false },
    org: orgShape(org),
    member: { id: member.id, roleKey: member.role.key, roleName: member.role.name, title: null, department: null, lastActiveAt: null, previousVisitAt: null },
    permissions: new Set(ROLE_DEFAULTS[role].permissions),
    support: null,
    subscription: org.subscription,
    access: computeAccess({ blockedAt: null, deletionRequestedAt: null, subscription: org.subscription }),
    db: tenantDb(org.id),
  };
}
