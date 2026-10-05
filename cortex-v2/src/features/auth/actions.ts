"use server";

import { redirect } from "next/navigation";
import { unstable_rethrow } from "next/navigation";
import { prisma } from "@/lib/db";
import { appUrl } from "@/lib/env";
import { toActionError, zodFieldErrors, type ActionResult } from "@/server/action";
import { audit } from "@/server/audit";
import { getCtx } from "@/server/auth/context";
import { hashPassword, verifyPassword } from "@/server/auth/password";
import { createSession, destroySession, getSession, revokeUserSessions, setActiveOrganization } from "@/server/auth/session";
import { AppError } from "@/server/errors";
import { createOrganization } from "@/server/modules/organization/setup";
import { getPlatformSetting } from "@/server/platform";
import { requestInfo } from "@/server/request";
import { hashToken, randomToken } from "@/server/security/crypto";
import { enforceRateLimit } from "@/server/security/rate-limit";
import { emailProvider, emailTemplates } from "@/services/email";
import { acceptInviteSchema, forgotSchema, loginSchema, registerSchema, resetSchema } from "./schemas";

const TERMS_VERSION = "2026-10";

function safeNext(next: string | undefined, fallback: string) {
  if (next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/api")) return next;
  return fallback;
}

export async function loginAction(input: unknown): Promise<ActionResult<{ redirectTo: string }>> {
  try {
    const parsed = loginSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: "Verifique os campos.", fieldErrors: zodFieldErrors(parsed.error) };
    const { email, password, next } = parsed.data;
    const { ip } = await requestInfo();
    await enforceRateLimit(`login:ip:${ip ?? "unknown"}`, 30, 900);
    await enforceRateLimit(`login:email:${email}`, 8, 900);

    const user = await prisma.user.findUnique({ where: { email } });
    const valid = await verifyPassword(password, user?.passwordHash);
    if (!user || !valid || user.anonymizedAt) {
      await audit(null, "auth.login_failed", { organizationId: null, metadata: { email } });
      return { ok: false, error: "E-mail ou senha incorretos." };
    }
    if (user.status !== "ACTIVE") return { ok: false, error: "Esta conta está bloqueada. Contate o administrador." };

    const membership = await prisma.organizationMember.findFirst({
      where: { userId: user.id, status: "ACTIVE" },
      orderBy: { joinedAt: "asc" },
    });
    await createSession(user.id, membership?.organizationId ?? null);
    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await audit({ user }, "auth.login", { organizationId: membership?.organizationId ?? null });

    const fallback = user.isSuperAdmin && !membership ? "/admin" : "/app";
    return { ok: true, data: { redirectTo: safeNext(next, fallback) } };
  } catch (error) {
    unstable_rethrow(error);
    return toActionError(error, "auth.login");
  }
}

export async function registerAction(input: unknown): Promise<ActionResult<{ redirectTo: string }>> {
  try {
    const parsed = registerSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: "Verifique os campos.", fieldErrors: zodFieldErrors(parsed.error) };
    const data = parsed.data;
    const { ip } = await requestInfo();
    await enforceRateLimit(`register:ip:${ip ?? "unknown"}`, 5, 3600);
    if (!(await getPlatformSetting("signup.enabled"))) {
      return { ok: false, error: "Novos cadastros estão temporariamente desabilitados." };
    }
    const exists = await prisma.user.findUnique({ where: { email: data.email }, select: { id: true } });
    if (exists) return { ok: false, error: "Este e-mail já possui conta. Faça login.", fieldErrors: { email: ["E-mail já cadastrado"] } };

    const user = await prisma.user.create({
      data: {
        email: data.email,
        name: data.name,
        passwordHash: await hashPassword(data.password),
        consents: {
          create: [
            { type: "TERMS", version: TERMS_VERSION, ip },
            { type: "PRIVACY", version: TERMS_VERSION, ip },
          ],
        },
      },
    });
    const { organization } = await createOrganization({ name: data.companyName, ownerUserId: user.id });
    await createSession(user.id, organization.id);
    await audit({ user, org: organization }, "auth.register", { entityType: "organization", entityId: organization.id });
    return { ok: true, data: { redirectTo: "/app/onboarding" } };
  } catch (error) {
    unstable_rethrow(error);
    return toActionError(error, "auth.register");
  }
}

export async function logoutAction() {
  const session = await getSession();
  if (session) await audit({ user: session.user }, "auth.logout", { organizationId: session.organizationId });
  await destroySession();
  redirect("/login");
}

export async function forgotPasswordAction(input: unknown): Promise<ActionResult<{ emailConfigured: boolean }>> {
  try {
    const parsed = forgotSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: "Informe um e-mail válido.", fieldErrors: zodFieldErrors(parsed.error) };
    const { ip } = await requestInfo();
    await enforceRateLimit(`forgot:ip:${ip ?? "unknown"}`, 5, 3600);
    await enforceRateLimit(`forgot:email:${parsed.data.email}`, 3, 3600);
    const provider = emailProvider();
    const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
    if (user && user.status === "ACTIVE" && !user.anonymizedAt) {
      const token = randomToken(32);
      await prisma.passwordResetToken.create({
        data: { userId: user.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 3_600_000) },
      });
      const tpl = emailTemplates.passwordReset(`${appUrl()}/reset-password?token=${encodeURIComponent(token)}`);
      await provider.send({ to: user.email, ...tpl });
      await audit({ user }, "auth.password_reset_requested", { organizationId: null });
    }
    // resposta idêntica exista ou não o e-mail (evita enumeração de contas)
    return { ok: true, data: { emailConfigured: provider.configured } };
  } catch (error) {
    unstable_rethrow(error);
    return toActionError(error, "auth.forgot");
  }
}

export async function resetPasswordAction(input: unknown): Promise<ActionResult<{ redirectTo: string }>> {
  try {
    const parsed = resetSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: "Verifique os campos.", fieldErrors: zodFieldErrors(parsed.error) };
    const { ip } = await requestInfo();
    await enforceRateLimit(`reset:ip:${ip ?? "unknown"}`, 10, 3600);
    const record = await prisma.passwordResetToken.findUnique({ where: { tokenHash: hashToken(parsed.data.token) }, include: { user: true } });
    if (!record || record.usedAt || record.expiresAt < new Date()) {
      return { ok: false, error: "Link inválido ou expirado. Solicite uma nova redefinição." };
    }
    await prisma.$transaction([
      prisma.user.update({
        where: { id: record.userId },
        data: { passwordHash: await hashPassword(parsed.data.password), passwordChangedAt: new Date() },
      }),
      prisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
    ]);
    await revokeUserSessions(record.userId);
    await audit({ user: record.user }, "auth.password_reset", { organizationId: null });
    return { ok: true, data: { redirectTo: "/login?reset=1" } };
  } catch (error) {
    unstable_rethrow(error);
    return toActionError(error, "auth.reset");
  }
}

export async function acceptInviteAction(input: unknown): Promise<ActionResult<{ redirectTo: string }>> {
  try {
    const parsed = acceptInviteSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: "Verifique os campos.", fieldErrors: zodFieldErrors(parsed.error) };
    const { ip } = await requestInfo();
    await enforceRateLimit(`invite:ip:${ip ?? "unknown"}`, 20, 3600);
    const invite = await prisma.invitation.findUnique({
      where: { tokenHash: hashToken(parsed.data.token) },
      include: { organization: true },
    });
    if (!invite || invite.acceptedAt || invite.revokedAt || invite.expiresAt < new Date()) {
      return { ok: false, error: "Convite inválido ou expirado. Peça um novo convite ao administrador." };
    }
    const session = await getSession();
    let user = await prisma.user.findUnique({ where: { email: invite.email } });

    if (session && session.user.email !== invite.email) {
      throw new AppError("FORBIDDEN", `Este convite foi enviado para ${invite.email}. Saia da conta atual para aceitá-lo.`);
    }
    if (!user) {
      if (!parsed.data.name || !parsed.data.password || !parsed.data.acceptTerms) {
        return { ok: false, error: "Preencha nome, senha e aceite os termos para criar sua conta." };
      }
      user = await prisma.user.create({
        data: {
          email: invite.email,
          name: parsed.data.name,
          passwordHash: await hashPassword(parsed.data.password),
          emailVerifiedAt: new Date(),
          consents: { create: [{ type: "TERMS", version: TERMS_VERSION, ip }, { type: "PRIVACY", version: TERMS_VERSION, ip }] },
        },
      });
    } else if (!session) {
      return { ok: false, error: "Você já possui conta. Entre com seu e-mail e abra o link do convite novamente.", code: "LOGIN_REQUIRED" };
    }

    await prisma.$transaction(async (tx) => {
      await tx.organizationMember.upsert({
        where: { organizationId_userId: { organizationId: invite.organizationId, userId: user!.id } },
        create: { organizationId: invite.organizationId, userId: user!.id, roleId: invite.roleId },
        update: { status: "ACTIVE", roleId: invite.roleId },
      });
      await tx.invitation.update({ where: { id: invite.id }, data: { acceptedAt: new Date() } });
    });
    if (session) await setActiveOrganization(session.id, invite.organizationId);
    else await createSession(user.id, invite.organizationId);
    await audit({ user, org: invite.organization }, "member.invite_accepted", { entityType: "invitation", entityId: invite.id });
    return { ok: true, data: { redirectTo: "/app" } };
  } catch (error) {
    unstable_rethrow(error);
    return toActionError(error, "auth.invite");
  }
}

export async function switchOrganizationAction(organizationId: string): Promise<ActionResult<null>> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Sessão expirada." };
  const member = await prisma.organizationMember.findUnique({
    where: { organizationId_userId: { organizationId, userId: session.userId } },
  });
  if (!member || member.status !== "ACTIVE") return { ok: false, error: "Workspace indisponível." };
  await setActiveOrganization(session.id, organizationId);
  const ctx = await getCtx();
  await audit(ctx, "workspace.switched", { organizationId });
  return { ok: true, data: null };
}
