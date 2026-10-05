import "server-only";
import { prisma } from "@/lib/db";
import { orgShape, type Ctx } from "@/server/auth/context";
import { tenantDb, type TenantDb } from "@/server/db/tenant";

/** Escopo mínimo de um workspace para rotinas sem usuário (jobs, automações, webhooks). */
export interface OrgScope {
  org: Ctx["org"];
  db: TenantDb;
  subscription: Ctx["subscription"];
  /** usuário que originou a ação; null para rotinas do sistema */
  actorId: string | null;
  /** profundidade de encadeamento de automações (proteção contra loops) */
  depth: number;
}

export function scopeOf(ctx: Ctx, depth = 0): OrgScope {
  return { org: ctx.org, db: ctx.db, subscription: ctx.subscription, actorId: ctx.member ? ctx.user.id : null, depth };
}

export async function systemScope(organizationId: string): Promise<OrgScope | null> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    include: { subscription: { include: { plan: true } } },
  });
  if (!org) return null;
  return { org: orgShape(org), db: tenantDb(org.id), subscription: org.subscription, actorId: null, depth: 0 };
}
