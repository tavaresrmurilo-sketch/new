/**
 * Utilitários de testes de integração (banco real). Os dados criados aqui
 * existem só no banco de teste e são apagados por resetDb().
 */
import type { EventStatus, OrgRole, PlanTier, Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { prisma } from "@/server/db";
import { CATEGORY_SEED } from "@/lib/categories";
import { PLAN_SEED } from "@/lib/plans";
import { eventSlug, shortId } from "@/lib/slug";

export { prisma };

export async function resetDb() {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (tables.length) {
    await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`);
  }
  for (const [i, c] of CATEGORY_SEED.entries()) await prisma.category.create({ data: { ...c, sortOrder: i } });
  for (const p of PLAN_SEED) await prisma.plan.create({ data: p });
}

let pwHash: string | null = null;
export const TEST_PASSWORD = "senhaforte123";

export async function createUser(data: Partial<Prisma.UserCreateInput> = {}) {
  pwHash ??= await bcrypt.hash(TEST_PASSWORD, 4);
  return prisma.user.create({
    data: {
      email: `user-${shortId(8)}@teste.dev`,
      name: "Pessoa Teste",
      passwordHash: pwHash,
      emailVerifiedAt: new Date(),
      termsAcceptedAt: new Date(),
      ...data,
    },
  });
}

export async function createOrg(ownerId: string, data: Partial<Prisma.OrganizationCreateInput> = {}, role: OrgRole = "OWNER") {
  const org = await prisma.organization.create({
    data: { name: "Organização Teste", slug: `org-${shortId(8)}`, ...data },
  });
  await prisma.membership.create({ data: { organizationId: org.id, userId: ownerId, role } });
  return org;
}

export async function setPlan(organizationId: string, plan: PlanTier) {
  return prisma.organization.update({ where: { id: organizationId }, data: { plan } });
}

export async function categoryId(slug = "shows") {
  return (await prisma.category.findUniqueOrThrow({ where: { slug } })).id;
}

/** Evento de teste. Por padrão: publicado, começa em 2 dias, dura 4 h, em São Paulo. */
export async function createEvent(organizationId: string, data: Partial<Prisma.EventUncheckedCreateInput> & { status?: EventStatus } = {}) {
  const startsAt = data.startsAt ? new Date(data.startsAt) : new Date(Date.now() + 2 * 86_400_000);
  const endsAt = data.endsAt ? new Date(data.endsAt) : new Date(startsAt.getTime() + 4 * 3_600_000);
  const title = data.title ?? "Evento de teste";
  return prisma.event.create({
    data: {
      organizationId,
      categoryId: data.categoryId ?? (await categoryId()),
      title,
      slug: eventSlug(title),
      status: "PUBLISHED",
      publishedAt: new Date(),
      venueName: "Local de teste",
      address: "Rua de Teste, 100",
      city: "São Paulo",
      state: "SP",
      lat: -23.5505,
      lng: -46.6333,
      ...data,
      startsAt,
      endsAt,
    },
  });
}
