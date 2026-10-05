import "server-only";
import { cookies } from "next/headers";
import { cache } from "react";
import { prisma } from "@/lib/db";
import { sessionIdleMinutes, sessionMaxAgeHours } from "@/lib/env";
import { hashToken, randomToken } from "@/server/security/crypto";
import { requestInfo } from "@/server/request";

export const SESSION_COOKIE = process.env.NODE_ENV === "production" ? "__Host-cortex_session" : "cortex_session";

export async function createSession(userId: string, organizationId: string | null) {
  const token = randomToken(32);
  const expiresAt = new Date(Date.now() + sessionMaxAgeHours() * 3_600_000);
  const { ip, userAgent } = await requestInfo();
  await prisma.session.create({
    data: { tokenHash: hashToken(token), userId, organizationId, ip, userAgent, expiresAt },
  });
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

/** Encerra todas as sessões de um usuário (troca de senha, bloqueio). */
export async function revokeUserSessions(userId: string, exceptSessionId?: string) {
  await prisma.session.deleteMany({ where: { userId, ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}) } });
}

/** Sessão da requisição atual (memoizada). Aplica expiração absoluta, por inatividade e bloqueio do usuário. */
export const getSession = cache(async () => {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await prisma.session.findUnique({ where: { tokenHash: hashToken(token) }, include: { user: true } });
  if (!session) return null;
  const now = Date.now();
  const idle = now - session.lastActivityAt.getTime() > sessionIdleMinutes() * 60_000;
  if (session.expiresAt.getTime() < now || idle || session.user.status !== "ACTIVE" || session.user.anonymizedAt) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => undefined);
    return null;
  }
  if (now - session.lastActivityAt.getTime() > 5 * 60_000) {
    await prisma.session.update({ where: { id: session.id }, data: { lastActivityAt: new Date() } }).catch(() => undefined);
  }
  return session;
});

export async function setActiveOrganization(sessionId: string, organizationId: string | null) {
  await prisma.session.update({ where: { id: sessionId }, data: { organizationId } });
}
