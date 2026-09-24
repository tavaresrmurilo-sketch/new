import { cookies } from "next/headers";
import { cache } from "react";
import type { RoleKey } from "@prisma/client";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { hashToken, randomToken } from "@/server/security/crypto";
import { ROLE_PERMISSIONS, SUPPORT_PERMISSIONS, type PermissionKey } from "./permissions";

export const SESSION_COOKIE = "jrc_session";

export interface AuthContext {
  sessionId: string;
  userId: string;
  userEmail: string;
  userName: string;
  role: RoleKey;
  isPlatformAdmin: boolean;
  /** true quando um SUPER_ADMIN acessa um tenant via autorização de suporte */
  supportMode: boolean;
  tenantId: string | null;
  tenantName: string | null;
  tenantSlug: string | null;
  timezone: string;
  isDemo: boolean;
  onboardingCompleted: boolean;
  permissions: Set<PermissionKey>;
}

export interface TenantContext extends AuthContext {
  tenantId: string;
  tenantName: string;
}

export async function createSession(userId: string, tenantId: string | null, ip: string | null, userAgent: string | null) {
  const token = randomToken(32);
  const maxAgeMs = env().SESSION_MAX_AGE_HOURS * 3_600_000;
  const expiresAt = new Date(Date.now() + maxAgeMs);
  await prisma.session.create({
    data: { tokenHash: hashToken(token), userId, activeTenantId: tenantId, ip, userAgent, expiresAt },
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

async function loadPermissions(roleId: string): Promise<Set<PermissionKey>> {
  const rows = await prisma.rolePermission.findMany({ where: { roleId }, include: { permission: true } });
  return new Set(rows.map((r) => r.permission.key as PermissionKey));
}

/** Sessão da requisição atual (memoizada por requisição). Aplica expiração absoluta e por inatividade. */
export const getAuth = cache(async (): Promise<AuthContext | null> => {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: { include: { role: true } }, activeTenant: true },
  });
  if (!session) return null;

  const now = Date.now();
  const idleMs = env().SESSION_IDLE_TIMEOUT_MINUTES * 60_000;
  if (session.expiresAt.getTime() < now || now - session.lastActivityAt.getTime() > idleMs || !session.user.active) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => undefined);
    return null;
  }
  if (now - session.lastActivityAt.getTime() > 60_000) {
    await prisma.session.update({ where: { id: session.id }, data: { lastActivityAt: new Date() } }).catch(() => undefined);
  }

  const role = session.user.role.key;
  const isPlatformAdmin = role === "SUPER_ADMIN";
  let permissions = await loadPermissions(session.user.roleId);
  if (!permissions.size) permissions = new Set(ROLE_PERMISSIONS[role]);

  const tenant = session.activeTenant;
  let supportMode = false;
  if (isPlatformAdmin && tenant) {
    const grant = await prisma.supportAccessGrant.findFirst({
      where: { tenantId: tenant.id, revokedAt: null, expiresAt: { gt: new Date() } },
    });
    if (!grant) {
      await prisma.session.update({ where: { id: session.id }, data: { activeTenantId: null } });
      return {
        sessionId: session.id, userId: session.userId, userEmail: session.user.email, userName: session.user.name,
        role, isPlatformAdmin, supportMode: false, tenantId: null, tenantName: null, tenantSlug: null,
        timezone: "America/Sao_Paulo", isDemo: false, onboardingCompleted: true, permissions,
      };
    }
    supportMode = true;
    permissions = new Set([...SUPPORT_PERMISSIONS, "platform:admin"]);
  }

  return {
    sessionId: session.id,
    userId: session.userId,
    userEmail: session.user.email,
    userName: session.user.name,
    role,
    isPlatformAdmin,
    supportMode,
    tenantId: tenant?.id ?? null,
    tenantName: tenant?.name ?? null,
    tenantSlug: tenant?.slug ?? null,
    timezone: tenant?.timezone ?? "America/Sao_Paulo",
    isDemo: tenant?.isDemo ?? false,
    onboardingCompleted: tenant?.onboardingCompleted ?? true,
    permissions,
  };
});
