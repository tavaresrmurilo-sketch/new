"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { createAdminSession, destroyAdminSession, requireAdmin } from "@/lib/auth/session";
import { burnPasswordCheck, hashPassword, passwordProblems, verifyPassword } from "@/lib/security/password";
import { getClientIp, getUserAgent } from "@/lib/security/request";
import { rateLimit } from "@/lib/security/rate-limit";

const MAX_FAILED = 5;
const LOCK_MINUTES = 15;
const GENERIC_ERROR = "E-mail ou senha incorretos.";

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().max(160),
  password: z.string().min(1).max(200),
  next: z.string().max(200).optional(),
});

export type LoginState = { error?: string } | undefined;

function safeNext(next: string | undefined): string {
  return next && next.startsWith("/admin") && !next.startsWith("//") && !next.includes("\\") ? next : "/admin";
}

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    next: formData.get("next") || undefined,
  });
  if (!parsed.success) return { error: GENERIC_ERROR };
  const { email, password, next } = parsed.data;

  const ip = await getClientIp();
  const [byIp, byEmail] = await Promise.all([rateLimit(`login-ip:${ip}`, 10, 900), rateLimit(`login-email:${email}`, 8, 900)]);
  if (!byIp.allowed || !byEmail.allowed) return { error: "Muitas tentativas. Aguarde 15 minutos e tente novamente." };

  const user = await db.user.findUnique({ where: { email }, include: { admin: true } });
  if (!user || !user.admin || !user.admin.active) {
    await burnPasswordCheck(password);
    return { error: GENERIC_ERROR };
  }
  if (user.admin.lockedUntil && user.admin.lockedUntil > new Date()) {
    await burnPasswordCheck(password);
    return { error: "Acesso bloqueado temporariamente por excesso de tentativas. Tente mais tarde." };
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    const failed = user.admin.failedLoginCount + 1;
    await db.admin.update({
      where: { id: user.admin.id },
      data:
        failed >= MAX_FAILED
          ? { failedLoginCount: 0, lockedUntil: new Date(Date.now() + LOCK_MINUTES * 60_000) }
          : { failedLoginCount: failed },
    });
    return { error: GENERIC_ERROR };
  }

  await db.admin.update({ where: { id: user.admin.id }, data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() } });
  await db.session.deleteMany({ where: { userId: user.id, expiresAt: { lt: new Date() } } });
  await createAdminSession(user.id, { ip, userAgent: await getUserAgent() });
  redirect(safeNext(next));
}

export async function logout(): Promise<void> {
  await destroyAdminSession();
  redirect("/admin/login");
}

const passwordSchema = z.object({ current: z.string().min(1).max(200), next: z.string().max(200), confirm: z.string().max(200) });

export async function changePassword(input: z.input<typeof passwordSchema>): Promise<{ ok: boolean; error?: string }> {
  const session = await requireAdmin();
  const parsed = passwordSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Preencha todos os campos" };
  const { current, next, confirm } = parsed.data;
  if (next !== confirm) return { ok: false, error: "A confirmação não bate com a nova senha" };
  const problem = passwordProblems(next);
  if (problem) return { ok: false, error: problem };

  const ip = await getClientIp();
  if (!(await rateLimit(`pwchange:${ip}`, 6, 900)).allowed) return { ok: false, error: "Muitas tentativas. Aguarde alguns minutos." };

  const user = await db.user.findUniqueOrThrow({ where: { id: session.userId } });
  if (!(await verifyPassword(current, user.passwordHash))) return { ok: false, error: "Senha atual incorreta" };

  await db.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(next) } });
  // Encerra as outras sessões abertas com a senha antiga
  await db.session.deleteMany({ where: { userId: user.id, id: { not: session.sessionId } } });
  return { ok: true };
}
