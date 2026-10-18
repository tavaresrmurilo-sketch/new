import "server-only";
import type { PlanTier, Prisma } from "@prisma/client";
import { audit } from "@/server/audit";
import { prisma } from "@/server/db";
import { getSetting, setSetting } from "@/server/settings";
import { AdminError, assertAdminActor, type AdminActor } from "./common";
import type { CategoryCreateInput, CategoryInput, PlanInput, SettingsInput } from "./schemas";

/** Campos que mudaram (para o registro de auditoria). */
function diff<T extends Record<string, unknown>>(before: T, after: Partial<T>) {
  const out: Record<string, { from: unknown; to: unknown }> = {};
  for (const [k, v] of Object.entries(after)) {
    if (JSON.stringify(before[k]) !== JSON.stringify(v)) out[k] = { from: before[k] ?? null, to: v ?? null };
  }
  return out;
}

// ─────────────────────────────── Categorias

export async function listCategoriesAdmin() {
  return prisma.category.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }], include: { _count: { select: { events: true } } } });
}

export async function updateCategory(actor: AdminActor, id: string, data: CategoryInput) {
  await assertAdminActor(actor);
  const current = await prisma.category.findUnique({ where: { id } });
  if (!current) throw new AdminError("Categoria não encontrada.", "NOT_FOUND");
  const changes = diff(current, data);
  if (!Object.keys(changes).length) return current;
  const updated = await prisma.category.update({ where: { id }, data });
  await audit({ actorId: actor.id, action: "admin.category.update", targetType: "Category", targetId: id, metadata: { slug: current.slug, changes } as Prisma.InputJsonValue, ip: actor.ip });
  return updated;
}

export async function createCategory(actor: AdminActor, data: CategoryCreateInput) {
  await assertAdminActor(actor);
  const exists = await prisma.category.findUnique({ where: { slug: data.slug }, select: { id: true } });
  if (exists) throw new AdminError("Já existe uma categoria com este identificador.", "INVALID", { slug: "Este identificador já está em uso." });
  const created = await prisma.category.create({ data });
  await audit({ actorId: actor.id, action: "admin.category.create", targetType: "Category", targetId: created.id, metadata: { slug: created.slug, name: created.name }, ip: actor.ip });
  return created;
}

// ─────────────────────────────── Planos

export async function listPlansAdmin() {
  const [plans, counts] = await Promise.all([
    prisma.plan.findMany({ orderBy: { priceMonthlyCents: "asc" } }),
    prisma.organization.groupBy({ by: ["plan"], _count: { _all: true } }),
  ]);
  const orgs = Object.fromEntries(counts.map((c) => [c.plan, c._count._all])) as Partial<Record<PlanTier, number>>;
  return plans.map((p) => ({ ...p, organizations: orgs[p.tier] ?? 0 }));
}

export async function updatePlan(actor: AdminActor, tier: PlanTier, data: PlanInput) {
  await assertAdminActor(actor);
  const current = await prisma.plan.findUnique({ where: { tier } });
  if (!current) throw new AdminError("Plano não encontrado. Rode o seed (npm run db:seed).", "NOT_FOUND");
  if (tier === "FREE") {
    if (data.priceMonthlyCents !== 0 || (data.priceYearlyCents ?? 0) !== 0) {
      throw new AdminError("O plano Gratuito não pode ter preço.", "INVALID", { priceMonthlyCents: "O plano Gratuito custa R$ 0." });
    }
    if (data.stripePriceMonthly || data.stripePriceYearly) {
      throw new AdminError("O plano Gratuito não usa preços do Stripe.", "INVALID", { stripePriceMonthly: "Deixe vazio no plano Gratuito." });
    }
    if (!data.active) throw new AdminError("O plano Gratuito precisa continuar ativo.", "INVALID", { active: "O plano Gratuito é o padrão de toda organização." });
  } else if (data.priceMonthlyCents <= 0) {
    throw new AdminError("Planos pagos precisam de preço mensal.", "INVALID", { priceMonthlyCents: "Informe o preço mensal." });
  }
  for (const key of ["stripePriceMonthly", "stripePriceYearly"] as const) {
    const id = data[key];
    if (!id) continue;
    const clash = await prisma.plan.findFirst({ where: { tier: { not: tier }, OR: [{ stripePriceMonthly: id }, { stripePriceYearly: id }] }, select: { name: true } });
    if (clash) throw new AdminError(`Este ID de preço já está no plano ${clash.name}.`, "INVALID", { [key]: "ID de preço já usado em outro plano." });
  }
  const payload = { ...data, priceYearlyCents: data.priceYearlyCents && data.priceYearlyCents > 0 ? data.priceYearlyCents : null };
  const changes = diff(current, payload);
  if (!Object.keys(changes).length) return current;
  const updated = await prisma.plan.update({ where: { tier }, data: payload });
  await audit({ actorId: actor.id, action: "admin.plan.update", targetType: "Plan", targetId: tier, metadata: { changes } as Prisma.InputJsonValue, ip: actor.ip });
  return updated;
}

// ─────────────────────────────── Configurações

export async function getAdminSettings(): Promise<SettingsInput> {
  const [moderationMode, requireVerifiedEmail] = await Promise.all([getSetting("moderation.mode"), getSetting("publishing.requireVerifiedEmail")]);
  return { moderationMode, requireVerifiedEmail };
}

export async function updateSettings(actor: AdminActor, data: SettingsInput) {
  await assertAdminActor(actor);
  const current = await getAdminSettings();
  const changes = diff(current, data);
  if (!Object.keys(changes).length) return current;
  await setSetting("moderation.mode", data.moderationMode);
  await setSetting("publishing.requireVerifiedEmail", data.requireVerifiedEmail);
  await audit({ actorId: actor.id, action: "admin.settings.update", targetType: "AppSetting", metadata: { changes } as Prisma.InputJsonValue, ip: actor.ip });
  return data;
}
