import "server-only";
import { redirect } from "next/navigation";
import type { OrgRole } from "@prisma/client";
import { prisma } from "@/server/db";
import { getSessionUser, type SessionUser } from "./session";

export class AuthError extends Error {
  constructor(
    message: string,
    public code: "UNAUTHENTICATED" | "FORBIDDEN" | "NOT_FOUND" = "FORBIDDEN",
  ) {
    super(message);
  }
}

/** Páginas: exige login (redireciona para /entrar com retorno). */
export async function requireUser(nextPath?: string): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect(`/entrar${nextPath ? `?next=${encodeURIComponent(nextPath)}` : ""}`);
  return user;
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser("/admin");
  if (!user.isAdmin) redirect("/");
  return user;
}

/** Actions/APIs: exige login sem redirecionar. */
export async function assertUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new AuthError("Entre na sua conta para continuar.", "UNAUTHENTICATED");
  return user;
}

export async function assertAdmin(): Promise<SessionUser> {
  const user = await assertUser();
  if (!user.isAdmin) throw new AuthError("Acesso restrito à equipe Mixtour.");
  return user;
}

const ROLE_RANK: Record<OrgRole, number> = { EDITOR: 1, ADMIN: 2, OWNER: 3 };

export function hasOrgRole(role: OrgRole, min: OrgRole): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[min];
}

/**
 * Garante que o usuário pertence à organização com o papel mínimo exigido.
 * Administradores da plataforma não ganham acesso implícito ao painel de organizações.
 */
export async function assertOrgRole(userId: string, organizationId: string, min: OrgRole = "EDITOR") {
  const membership = await prisma.membership.findUnique({
    where: { organizationId_userId: { organizationId, userId } },
    include: { organization: true },
  });
  if (!membership) throw new AuthError("Você não faz parte desta organização.", "NOT_FOUND");
  if (!hasOrgRole(membership.role, min)) throw new AuthError("Seu papel na equipe não permite esta ação.");
  if (membership.organization.status === "SUSPENDED") throw new AuthError("Esta organização está suspensa. Fale com o suporte.");
  return membership;
}
