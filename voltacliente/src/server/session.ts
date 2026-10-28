import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { MemberRole } from "@/generated/prisma/client";
import { auth } from "./auth";
import { db } from "./db";
import { AppError } from "./errors";

/**
 * Contexto de execução de uma empresa (tenant). É SEMPRE derivado da sessão
 * no servidor — nunca de um companyId enviado pelo navegador.
 */
export type TenantContext = {
  userId: string;
  companyId: string;
  role: MemberRole;
  timezone: string;
};

export type CurrentUser = { id: string; name: string; email: string };

/** Sessão validada no banco (uma vez por requisição). */
export const getSession = cache(async () => {
  return auth.api.getSession({ headers: await headers() });
});

export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await getSession();
  if (!session) return null;
  return { id: session.user.id, name: session.user.name, email: session.user.email };
});

const getMembership = cache(async (userId: string) => {
  return db.membership.findFirst({
    where: { userId },
    orderBy: { createdAt: "asc" },
    select: {
      role: true,
      company: { select: { id: true, name: true, timezone: true, segment: true, phone: true, defaultReturnIntervalDays: true } },
    },
  });
});

export const getTenant = cache(async (): Promise<(TenantContext & { company: CompanySummary; user: CurrentUser }) | null> => {
  const user = await getCurrentUser();
  if (!user) return null;
  const membership = await getMembership(user.id);
  if (!membership) return null;
  return {
    userId: user.id,
    companyId: membership.company.id,
    role: membership.role,
    timezone: membership.company.timezone,
    company: membership.company,
    user,
  };
});

export type CompanySummary = NonNullable<Awaited<ReturnType<typeof getMembership>>>["company"];

/** Para páginas: exige login. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/entrar");
  return user;
}

/** Para páginas: exige login e empresa configurada (senão leva ao onboarding). */
export async function requireTenantPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/entrar");
  const tenant = await getTenant();
  if (!tenant) redirect("/onboarding");
  return tenant;
}

/** Para Server Actions e Route Handlers: lança erro em vez de redirecionar. */
export async function requireTenant(): Promise<TenantContext> {
  const tenant = await getTenant();
  if (!tenant) throw new AppError("UNAUTHENTICATED", "Sua sessão expirou. Entre novamente.");
  return { userId: tenant.userId, companyId: tenant.companyId, role: tenant.role, timezone: tenant.timezone };
}
