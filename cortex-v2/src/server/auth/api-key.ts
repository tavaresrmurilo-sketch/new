import "server-only";
import type { Permission } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import { computeAccess } from "@/server/billing/access";
import { hasFeature } from "@/server/billing/feature-gate";
import { tenantDb } from "@/server/db/tenant";
import { hashToken } from "@/server/security/crypto";
import { orgShape, type Ctx } from "./context";

/** Mapeia escopos de API key para permissões internas (somente o que o escopo cobre). */
const SCOPE_PERMS: Record<string, Permission[]> = {
  "clients:read": ["clients.read"],
  "clients:write": ["clients.read", "clients.write"],
  "leads:read": ["leads.read"],
  "leads:write": ["leads.read", "leads.write"],
  "opportunities:read": ["opportunities.read"],
  "projects:read": ["projects.read"],
  "tasks:read": ["tasks.read"],
  "tasks:write": ["tasks.read", "tasks.write"],
};

/** Contexto a partir de `Authorization: Bearer ctx_live_…`. Retorna null para chave inválida, revogada ou expirada. */
export async function ctxFromApiKey(req: Request): Promise<{ ctx: Ctx; scopes: string[] } | { error: string; status: number }> {
  const header = req.headers.get("authorization") ?? "";
  const raw = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!raw.startsWith("ctx_live_")) return { error: "API key ausente ou inválida.", status: 401 };
  const key = await prisma.apiKey.findUnique({ where: { keyHash: hashToken(raw) } });
  if (!key || key.revokedAt || (key.expiresAt && key.expiresAt < new Date())) return { error: "API key inválida, revogada ou expirada.", status: 401 };
  const org = await prisma.organization.findUnique({ where: { id: key.organizationId }, include: { subscription: { include: { plan: true } } } });
  if (!org) return { error: "Workspace não encontrado.", status: 401 };
  const author = key.createdById ? await prisma.user.findUnique({ where: { id: key.createdById }, select: { id: true, name: true, email: true } }) : null;
  // as ações via API são atribuídas a quem criou a chave (precisa continuar membro ativo)
  const active = author ? await prisma.organizationMember.count({ where: { organizationId: org.id, userId: author.id, status: "ACTIVE" } }) : 0;
  if (!author || !active) return { error: "O criador desta API key não é mais membro ativo do workspace. Gere uma nova chave.", status: 401 };
  const ctx: Ctx = {
    via: "api_key",
    sessionId: null,
    user: { id: author.id, name: `API: ${key.name}`, email: author.email, avatarUrl: null, isSuperAdmin: false },
    org: orgShape(org),
    member: null,
    permissions: new Set(key.scopes.flatMap((s) => SCOPE_PERMS[s] ?? [])),
    support: null,
    subscription: org.subscription,
    access: computeAccess({ blockedAt: org.blockedAt, deletionRequestedAt: org.deletionRequestedAt, subscription: org.subscription }),
    db: tenantDb(org.id),
  };
  if (!hasFeature(ctx, "api_access")) return { error: "A API pública não está incluída no plano do workspace.", status: 402 };
  if (ctx.access.level === "BLOCKED") return { error: "Workspace bloqueado.", status: 403 };
  await prisma.apiKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } }).catch(() => undefined);
  return { ctx, scopes: key.scopes };
}
