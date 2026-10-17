import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import type { OrgRole } from "@prisma/client";
import { prisma } from "@/server/db";
import { hasOrgRole, requireUser } from "@/server/auth/guards";
import type { SessionUser } from "@/server/auth/session";

/** Cookie com a organização ativa no painel (para quem participa de mais de uma). */
export const ORG_COOKIE = "mx_org";

export const getUserMemberships = cache(async (userId: string) =>
  prisma.membership.findMany({
    where: { userId },
    include: { organization: true },
    orderBy: { createdAt: "asc" },
  }),
);

export type MembershipWithOrg = Awaited<ReturnType<typeof getUserMemberships>>[number];

export async function getCurrentMembership(userId: string): Promise<MembershipWithOrg | null> {
  const list = await getUserMemberships(userId);
  if (!list.length) return null;
  const preferred = (await cookies()).get(ORG_COOKIE)?.value;
  return list.find((m) => m.organizationId === preferred) ?? list[0];
}

export interface OrgContext {
  user: SessionUser;
  membership: MembershipWithOrg;
  org: MembershipWithOrg["organization"];
  canManage: boolean; // ADMIN ou OWNER
  isOwner: boolean;
}

/**
 * Páginas do /painel: exige login e organização. Sem organização → /painel/comecar.
 * Com `minRole`, quem não tem o papel mínimo volta para /painel.
 */
export async function requireCurrentOrg(minRole: OrgRole = "EDITOR"): Promise<OrgContext> {
  const user = await requireUser("/painel");
  const membership = await getCurrentMembership(user.id);
  if (!membership) redirect("/painel/comecar");
  if (!hasOrgRole(membership.role, minRole)) redirect("/painel?acesso=restrito");
  return {
    user,
    membership,
    org: membership.organization,
    canManage: hasOrgRole(membership.role, "ADMIN"),
    isOwner: membership.role === "OWNER",
  };
}

/** Server Actions: troca a organização ativa (valida a participação antes). */
export async function setCurrentOrg(userId: string, organizationId: string): Promise<boolean> {
  const m = await prisma.membership.findUnique({ where: { organizationId_userId: { organizationId, userId } } });
  if (!m) return false;
  (await cookies()).set(ORG_COOKIE, organizationId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 365 * 86_400,
  });
  return true;
}
