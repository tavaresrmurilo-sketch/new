import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { audit } from "@/server/audit";
import { apiRoute, clientKey, enforceRateLimit } from "@/server/auth/guard";
import { dummyHash, verifyPassword } from "@/server/auth/password";
import { createSession, homeFor } from "@/server/auth/session";
import { AppError } from "@/server/errors";
import { requestInfo } from "@/server/request";
import { LIMITS } from "@/server/security/rate-limit";

const schema = z.object({ email: z.string().email().max(200).transform((v) => v.toLowerCase().trim()), password: z.string().min(1).max(200) });
const MAX_FAILS = 5;

export const POST = apiRoute(async (req) => {
  enforceRateLimit(clientKey(req, "login"), LIMITS.login);
  const { email, password } = schema.parse(await req.json());
  enforceRateLimit(`login-email:${email}`, LIMITS.login);
  const user = await prisma.user.findUnique({ where: { email } });
  const actor = { tenantId: user?.tenantId ?? null, userId: user?.id ?? null, userEmail: email };

  if (user?.lockedUntil && user.lockedUntil > new Date()) {
    await audit(actor, { action: "auth.login", resource: "session", result: "DENIED", metadata: { reason: "locked" } });
    throw new AppError("Conta temporariamente bloqueada por tentativas inválidas. Tente novamente em alguns minutos.", 423, "LOCKED");
  }
  const ok = await verifyPassword(password, user?.passwordHash ?? (await dummyHash()));
  if (user && ok && !user.active) {
    await audit(actor, { action: "auth.login", resource: "session", result: "DENIED", metadata: { reason: "blocked" } });
    throw new AppError("Esta conta está bloqueada. Entre em contato com o suporte.", 403, "ACCOUNT_BLOCKED");
  }
  if (!user || !ok) {
    if (user) {
      const fails = user.failedLogins + 1;
      await prisma.user.update({ where: { id: user.id }, data: { failedLogins: fails, lockedUntil: fails >= MAX_FAILS ? new Date(Date.now() + 15 * 60_000) : null } });
    }
    await audit(actor, { action: "auth.login", resource: "session", result: "DENIED", metadata: { reason: "invalid_credentials" } });
    throw new AppError("E-mail ou senha inválidos.", 401, "INVALID_CREDENTIALS");
  }

  await prisma.user.update({ where: { id: user.id }, data: { failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() } });
  const info = await requestInfo();
  await createSession(user.id, user.tenantId, info.ip, info.userAgent);
  await audit(actor, { action: "auth.login", resource: "session", result: "SUCCESS" });
  let onboardingCompleted = true;
  if (user.tenantId) {
    const t = await prisma.tenant.findUnique({ where: { id: user.tenantId }, select: { onboardingCompleted: true } });
    onboardingCompleted = t?.onboardingCompleted ?? true;
  }
  const redirect = homeFor(user.userRole, Boolean(user.tenantId), onboardingCompleted);
  return NextResponse.json({ redirect });
});
