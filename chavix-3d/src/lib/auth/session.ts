import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { db } from "@/lib/db";
import { ADMIN_COOKIE } from "./constants";

/** Sessão expira após 12h sem uso e, no máximo, 7 dias após o login. */
const IDLE_TIMEOUT_MS = 12 * 60 * 60 * 1000;
const ABSOLUTE_MAX_MS = 7 * 24 * 60 * 60 * 1000;
const TOUCH_INTERVAL_MS = 10 * 60 * 1000;

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export interface AdminSession {
  sessionId: string;
  userId: string;
  adminId: string;
  name: string;
  email: string;
  role: "OWNER" | "MANAGER";
}

export async function createAdminSession(userId: string, meta: { ip: string; userAgent: string }): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const now = Date.now();
  await db.session.create({
    data: {
      tokenHash: hashToken(token),
      userId,
      expiresAt: new Date(now + IDLE_TIMEOUT_MS),
      ip: meta.ip,
      userAgent: meta.userAgent,
    },
  });
  const store = await cookies();
  store.set(ADMIN_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: ABSOLUTE_MAX_MS / 1000,
  });
}

/** Sessão atual do administrador (memoizada por requisição). */
export const getAdminSession = cache(async (): Promise<AdminSession | null> => {
  const store = await cookies();
  const token = store.get(ADMIN_COOKIE)?.value;
  if (!token || token.length > 100) return null;

  const session = await db.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: { include: { admin: true } } },
  });
  if (!session) return null;

  const now = Date.now();
  const expired = session.expiresAt.getTime() <= now || session.createdAt.getTime() + ABSOLUTE_MAX_MS <= now;
  const admin = session.user.admin;
  if (expired || !admin || !admin.active) {
    await db.session.delete({ where: { id: session.id } }).catch(() => undefined);
    return null;
  }

  if (now - session.lastSeenAt.getTime() > TOUCH_INTERVAL_MS) {
    await db.session
      .update({ where: { id: session.id }, data: { lastSeenAt: new Date(now), expiresAt: new Date(now + IDLE_TIMEOUT_MS) } })
      .catch(() => undefined);
  }

  return {
    sessionId: session.id,
    userId: session.userId,
    adminId: admin.id,
    name: session.user.name,
    email: session.user.email,
    role: admin.role,
  };
});

/** Use em páginas e Server Actions do painel. Redireciona para o login se não houver sessão válida. */
export async function requireAdmin(): Promise<AdminSession> {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");
  return session;
}

export async function destroyAdminSession(): Promise<void> {
  const store = await cookies();
  const token = store.get(ADMIN_COOKIE)?.value;
  if (token) await db.session.deleteMany({ where: { tokenHash: hashToken(token) } });
  store.delete(ADMIN_COOKIE);
}
