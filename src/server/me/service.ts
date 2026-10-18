import "server-only";
import type { NotificationType } from "@prisma/client";
import { prisma } from "@/server/db";
import { describeUserAgent, internalPath, maskIp, type DeviceInfo } from "./helpers";
import type { PreferenceKey, ProfileInput } from "./schemas";

/**
 * Conta do explorador: notificações, perfil, preferências e sessões.
 * Toda função recebe o `userId` da sessão e só lê/escreve dados dessa pessoa.
 */

export class MeError extends Error {
  constructor(
    message: string,
    public fieldErrors?: Record<string, string>,
  ) {
    super(message);
  }
}

// ─────────────────────────────────────────────────────────────
// Notificações
// ─────────────────────────────────────────────────────────────

export const NOTIFICATIONS_PAGE = 30;

export interface NotificationItem {
  id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  /** Somente caminhos internos; URLs externas viram null. */
  url: string | null;
  read: boolean;
  createdAt: string;
}

/** Página de notificações, mais recentes primeiro. `before` = id da última notificação já exibida. */
export async function listNotifications(
  userId: string,
  opts: { before?: string | null; take?: number } = {},
): Promise<{ items: NotificationItem[]; nextCursor: string | null }> {
  const take = Math.min(100, Math.max(1, opts.take ?? NOTIFICATIONS_PAGE));
  let cursorDate: Date | null = null;
  let cursorId: string | null = null;
  if (opts.before) {
    const c = await prisma.notification.findFirst({ where: { id: opts.before, userId }, select: { id: true, createdAt: true } });
    if (c) {
      cursorDate = c.createdAt;
      cursorId = c.id;
    }
  }
  const rows = await prisma.notification.findMany({
    where: {
      userId,
      ...(cursorDate && cursorId
        ? { OR: [{ createdAt: { lt: cursorDate } }, { createdAt: cursorDate, id: { lt: cursorId } }] }
        : {}),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: take + 1,
  });
  const page = rows.slice(0, take);
  return {
    items: page.map((n) => ({
      id: n.id,
      type: n.type,
      title: n.title,
      body: n.body,
      url: internalPath(n.url),
      read: Boolean(n.readAt),
      createdAt: n.createdAt.toISOString(),
    })),
    nextCursor: rows.length > take ? page[page.length - 1].id : null,
  };
}

/** Marca uma notificação da própria pessoa como lida e devolve o destino interno (ou null). */
export async function markNotificationRead(userId: string, id: string): Promise<{ url: string | null } | null> {
  const n = await prisma.notification.findFirst({ where: { id, userId }, select: { id: true, url: true, readAt: true } });
  if (!n) return null;
  if (!n.readAt) await prisma.notification.updateMany({ where: { id: n.id, userId, readAt: null }, data: { readAt: new Date() } });
  return { url: internalPath(n.url) };
}

export async function markAllNotificationsRead(userId: string): Promise<number> {
  const res = await prisma.notification.updateMany({ where: { userId, readAt: null }, data: { readAt: new Date() } });
  return res.count;
}

// ─────────────────────────────────────────────────────────────
// Perfil e preferências
// ─────────────────────────────────────────────────────────────

export async function getProfile(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      avatarUrl: true,
      emailVerifiedAt: true,
      passwordHash: true,
      homeCity: true,
      homeLat: true,
      homeLng: true,
      favoriteCategories: true,
      notifyEmail: true,
      notifyPush: true,
      marketingOptIn: true,
      createdAt: true,
      _count: { select: { oauthAccounts: true, pushSubscriptions: true, memberships: true } },
    },
  });
  const { passwordHash, _count, ...rest } = user;
  return {
    ...rest,
    hasPassword: Boolean(passwordHash),
    hasGoogle: _count.oauthAccounts > 0,
    pushDevices: _count.pushSubscriptions,
    organizations: _count.memberships,
  };
}

export type Profile = Awaited<ReturnType<typeof getProfile>>;

export async function activeCategories() {
  return prisma.category.findMany({
    where: { active: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, slug: true, name: true, icon: true, color: true },
  });
}

export async function updateProfile(userId: string, input: ProfileInput) {
  let favorites: string[] = [];
  if (input.favoriteCategories.length) {
    const valid = await prisma.category.findMany({
      where: { active: true, slug: { in: input.favoriteCategories } },
      select: { slug: true },
    });
    const ok = new Set(valid.map((c) => c.slug));
    favorites = input.favoriteCategories.filter((s) => ok.has(s));
  }
  return prisma.user.update({
    where: { id: userId },
    data: {
      name: input.name,
      homeCity: input.homeCity,
      homeLat: input.homeLat,
      homeLng: input.homeLng,
      favoriteCategories: favorites,
    },
    select: { name: true, homeCity: true, homeLat: true, homeLng: true, favoriteCategories: true },
  });
}

/**
 * Troca a foto de perfil. Só aceita imagens enviadas pela própria pessoa
 * como "avatar" (impede apontar para URLs arbitrárias ou imagens de terceiros).
 */
export async function setAvatar(userId: string, url: string | null) {
  if (url !== null) {
    const upload = await prisma.upload.findFirst({
      where: { url, uploadedById: userId, purpose: "avatar" },
      select: { id: true },
    });
    if (!upload) throw new MeError("Envie a foto novamente para continuar.");
  }
  await prisma.user.update({ where: { id: userId }, data: { avatarUrl: url } });
  return { avatarUrl: url };
}

export async function setPreference(userId: string, key: PreferenceKey, value: boolean) {
  const user = await prisma.user.update({
    where: { id: userId },
    data: { [key]: value },
    select: { notifyEmail: true, notifyPush: true, marketingOptIn: true },
  });
  return user;
}

// ─────────────────────────────────────────────────────────────
// Sessões
// ─────────────────────────────────────────────────────────────

export interface SessionItem {
  id: string;
  device: DeviceInfo;
  ip: string | null;
  createdAt: string;
  lastActivityAt: string;
  current: boolean;
}

export async function listSessions(userId: string, currentSessionId: string | null, now: Date = new Date()): Promise<SessionItem[]> {
  const rows = await prisma.session.findMany({
    where: { userId, expiresAt: { gt: now } },
    orderBy: [{ lastActivityAt: "desc" }, { id: "asc" }],
    take: 50,
    select: { id: true, ip: true, userAgent: true, createdAt: true, lastActivityAt: true },
  });
  const items = rows.map((s) => ({
    id: s.id,
    device: describeUserAgent(s.userAgent),
    ip: maskIp(s.ip),
    createdAt: s.createdAt.toISOString(),
    lastActivityAt: s.lastActivityAt.toISOString(),
    current: s.id === currentSessionId,
  }));
  // A sessão atual sempre primeiro.
  return items.sort((a, b) => Number(b.current) - Number(a.current));
}

/** Encerra uma sessão da própria pessoa (nunca a atual — para isso existe "Sair"). */
export async function revokeSession(userId: string, sessionId: string, currentSessionId: string): Promise<boolean> {
  if (sessionId === currentSessionId) throw new MeError("Para encerrar esta sessão, use “Sair”.");
  const res = await prisma.session.deleteMany({ where: { id: sessionId, userId } });
  return res.count > 0;
}

export async function revokeOtherSessions(userId: string, currentSessionId: string): Promise<number> {
  const res = await prisma.session.deleteMany({ where: { userId, id: { not: currentSessionId } } });
  return res.count;
}
