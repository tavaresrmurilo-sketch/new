import "server-only";
import type { Prisma, UserStatus } from "@prisma/client";
import { audit } from "@/server/audit";
import { prisma } from "@/server/db";
import { AdminError, assertAdminActor, paged, paging, type AdminActor, type Paged } from "./common";

export const USER_PAGE_SIZE = 25;

export interface UserListFilters {
  q?: string;
  status?: UserStatus;
  verified?: "sim" | "nao";
  role?: "ADMIN" | "USER";
  page?: number;
}

const LIST_SELECT = {
  id: true,
  name: true,
  email: true,
  avatarUrl: true,
  role: true,
  status: true,
  emailVerifiedAt: true,
  lastLoginAt: true,
  createdAt: true,
  homeCity: true,
  _count: { select: { memberships: true } },
} satisfies Prisma.UserSelect;

export type AdminUserRow = Prisma.UserGetPayload<{ select: typeof LIST_SELECT }>;

export async function listUsers(f: UserListFilters = {}): Promise<Paged<AdminUserRow>> {
  const { page, skip, take } = paging(f.page ?? 1, USER_PAGE_SIZE);
  const where: Prisma.UserWhereInput = {
    ...(f.q ? { OR: [{ name: { contains: f.q, mode: "insensitive" } }, { email: { contains: f.q, mode: "insensitive" } }] } : {}),
    ...(f.status ? { status: f.status } : {}),
    ...(f.verified ? { emailVerifiedAt: f.verified === "sim" ? { not: null } : null } : {}),
    ...(f.role ? { role: f.role } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.user.findMany({ where, select: LIST_SELECT, orderBy: [{ createdAt: "desc" }, { id: "asc" }], skip, take }),
    prisma.user.count({ where }),
  ]);
  return paged(items, total, page, USER_PAGE_SIZE);
}

export async function getUserDetail(id: string) {
  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      ...LIST_SELECT,
      updatedAt: true,
      deletedAt: true,
      notifyEmail: true,
      notifyPush: true,
      marketingOptIn: true,
      termsAcceptedAt: true,
      oauthAccounts: { select: { provider: true, createdAt: true } },
      memberships: {
        orderBy: { createdAt: "asc" },
        select: { role: true, createdAt: true, organization: { select: { id: true, name: true, slug: true, plan: true, status: true, logoUrl: true, verified: true } } },
      },
      _count: { select: { sessions: true, saves: true, rsvps: true, follows: true, reports: true, createdEvents: true } },
    },
  });
  if (!user) return null;
  const lastSession = await prisma.session.findFirst({ where: { userId: id }, orderBy: { lastActivityAt: "desc" }, select: { lastActivityAt: true } });
  return { user, lastActivityAt: lastSession?.lastActivityAt ?? null };
}

async function loadTarget(actor: AdminActor, userId: string) {
  if (userId === actor.id) throw new AdminError("Você não pode alterar o status da sua própria conta.", "FORBIDDEN");
  const target = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true, name: true, role: true, status: true } });
  if (!target) throw new AdminError("Conta não encontrada.", "NOT_FOUND");
  if (target.role === "ADMIN") throw new AdminError("Contas da equipe Mixtour não podem ser suspensas pelo painel.", "FORBIDDEN");
  return target;
}

/** Suspende a conta e encerra todas as sessões abertas (efeito imediato em todos os dispositivos). */
export async function suspendUser(actor: AdminActor, userId: string, reason: string) {
  await assertAdminActor(actor);
  const target = await loadTarget(actor, userId);
  if (target.status === "SUSPENDED") throw new AdminError("Esta conta já está suspensa.");
  if (target.status === "DELETED") throw new AdminError("Esta conta foi excluída pela própria pessoa.");
  const [, sessions] = await prisma.$transaction([
    prisma.user.update({ where: { id: target.id }, data: { status: "SUSPENDED" } }),
    prisma.session.deleteMany({ where: { userId: target.id } }),
  ]);
  await audit({
    actorId: actor.id,
    action: "admin.user.suspend",
    targetType: "User",
    targetId: target.id,
    metadata: { reason, sessionsEnded: sessions.count },
    ip: actor.ip,
  });
  return { sessionsEnded: sessions.count };
}

export async function reactivateUser(actor: AdminActor, userId: string) {
  await assertAdminActor(actor);
  const target = await loadTarget(actor, userId);
  if (target.status === "ACTIVE") throw new AdminError("Esta conta já está ativa.");
  if (target.status === "DELETED") throw new AdminError("Contas excluídas não podem ser reativadas.");
  await prisma.user.update({ where: { id: target.id }, data: { status: "ACTIVE" } });
  await audit({ actorId: actor.id, action: "admin.user.reactivate", targetType: "User", targetId: target.id, ip: actor.ip });
}
