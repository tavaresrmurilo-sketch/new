import "server-only";
import { cookies } from "next/headers";
import { cache } from "react";
import type { UserRole } from "@prisma/client";
import { prisma } from "@/server/db";
import { env } from "@/server/env";
import { hashToken, randomToken } from "@/server/security/crypto";

export const SESSION_COOKIE = process.env.NODE_ENV === "production" ? "__Host-mx_session" : "mx_session";

export interface SessionUser {
  sessionId: string;
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  role: UserRole;
  isAdmin: boolean;
  emailVerified: boolean;
}

export async function createSession(userId: string, meta: { ip: string | null; userAgent: string | null }) {
  const token = randomToken(32);
  const expiresAt = new Date(Date.now() + env().SESSION_MAX_AGE_DAYS * 86_400_000);
  await prisma.session.create({
    data: { tokenHash: hashToken(token), userId, ip: meta.ip, userAgent: meta.userAgent, expiresAt },
  });
  await prisma.user.update({ where: { id: userId }, data: { lastLoginAt: new Date() } });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
  jar.delete(SESSION_COOKIE);
}

/** Encerra todas as sessões de um usuário (troca de senha, suspensão, exclusão). */
export async function destroyAllSessions(userId: string, exceptSessionId?: string) {
  await prisma.session.deleteMany({ where: { userId, ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}) } });
}

/** Usuário da requisição atual (memoizado por requisição). Sessão deslizante. */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token || token.length > 200) return null;

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });
  if (!session) return null;

  const now = Date.now();
  if (session.expiresAt.getTime() < now || session.user.status !== "ACTIVE") {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => undefined);
    return null;
  }

  // Renova a sessão (no máximo uma escrita a cada 10 minutos).
  if (now - session.lastActivityAt.getTime() > 10 * 60_000) {
    const expiresAt = new Date(now + env().SESSION_MAX_AGE_DAYS * 86_400_000);
    await prisma.session
      .update({ where: { id: session.id }, data: { lastActivityAt: new Date(now), expiresAt } })
      .catch(() => undefined);
  }

  const u = session.user;
  return {
    sessionId: session.id,
    id: u.id,
    email: u.email,
    name: u.name,
    avatarUrl: u.avatarUrl,
    role: u.role,
    isAdmin: u.role === "ADMIN",
    emailVerified: Boolean(u.emailVerifiedAt),
  };
});
