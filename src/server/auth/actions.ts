"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/server/db";
import { audit } from "@/server/audit";
import { sendEmail } from "@/server/email";
import { passwordChangedMessage, resetPasswordMessage, verifyEmailMessage } from "@/server/email/templates";
import { requestMeta } from "@/server/request";
import { rateLimit, retryMessage } from "@/server/security/rate-limit";
import { burnPasswordCheck, hashPassword, verifyPassword } from "./password";
import { createSession, destroyAllSessions, destroySession, getSessionUser } from "./session";
import { consumeToken, issueToken } from "./tokens";
import type { ActionState } from "@/lib/action";
import { safeNextPath } from "@/lib/utils";
import { emailSchema, loginSchema, passwordSchema, registerSchema, resetSchema } from "@/lib/validation/auth";
import { fieldErrors } from "@/lib/validation/zod-errors";

function form(fd: FormData) {
  return Object.fromEntries([...fd.entries()].filter(([, v]) => typeof v === "string")) as Record<string, string>;
}

export async function registerAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const meta = await requestMeta();
  const rl = await rateLimit("register", meta.ip ?? "unknown");
  if (!rl.allowed) return { status: "error", message: retryMessage(rl.retryAfterSeconds) };

  const parsed = registerSchema.safeParse(form(fd));
  if (!parsed.success) return { status: "error", message: "Revise os campos destacados.", fieldErrors: fieldErrors(parsed.error) };
  const { name, email, password } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) {
    return {
      status: "error",
      message: "Este e-mail já tem uma conta no Mixtour. Entre ou recupere sua senha.",
      fieldErrors: { email: "E-mail já cadastrado" },
    };
  }

  const user = await prisma.user.create({
    data: { name, email, passwordHash: await hashPassword(password), termsAcceptedAt: new Date() },
  });
  const token = await issueToken(user.id, "EMAIL_VERIFY");
  await sendEmail(email, verifyEmailMessage(name, token));
  await createSession(user.id, meta);
  await audit({ actorId: user.id, action: "user.register", targetType: "User", targetId: user.id, ip: meta.ip });

  redirect(safeNextPath(fd.get("next") as string | null, "/?bemvindo=1"));
}

export async function loginAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const meta = await requestMeta();
  const parsed = loginSchema.safeParse(form(fd));
  if (!parsed.success) return { status: "error", message: "Informe e-mail e senha.", fieldErrors: fieldErrors(parsed.error) };
  const { email, password } = parsed.data;

  const [byIp, byEmail] = await Promise.all([rateLimit("login", `ip:${meta.ip ?? "unknown"}`), rateLimit("login", `email:${email}`)]);
  if (!byIp.allowed || !byEmail.allowed) {
    return { status: "error", message: retryMessage(Math.max(byIp.retryAfterSeconds, byEmail.retryAfterSeconds)) };
  }

  const user = await prisma.user.findUnique({ where: { email } });
  const invalid: ActionState = { status: "error", message: "E-mail ou senha incorretos." };
  if (!user || !user.passwordHash) {
    await burnPasswordCheck(password);
    if (user && !user.passwordHash) {
      return { status: "error", message: "Esta conta usa login com Google. Entre com o Google ou crie uma senha em “Esqueci minha senha”." };
    }
    return invalid;
  }
  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) {
    await audit({ actorId: user.id, action: "user.login_failed", targetType: "User", targetId: user.id, ip: meta.ip });
    return invalid;
  }
  if (user.status === "SUSPENDED") return { status: "error", message: "Sua conta está suspensa. Fale com contato@mixtour.app." };
  if (user.status === "DELETED") return invalid;

  await createSession(user.id, meta);
  await audit({ actorId: user.id, action: "user.login", targetType: "User", targetId: user.id, ip: meta.ip });
  redirect(safeNextPath(fd.get("next") as string | null, user.role === "ADMIN" ? "/admin" : "/"));
}

export async function logoutAction() {
  await destroySession();
  redirect("/");
}

export async function requestPasswordResetAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const meta = await requestMeta();
  const parsed = emailSchema.safeParse(fd.get("email"));
  if (!parsed.success) return { status: "error", message: "Informe um e-mail válido.", fieldErrors: { email: "E-mail inválido" } };
  const email = parsed.data;

  const [byIp, byEmail] = await Promise.all([rateLimit("passwordReset", `ip:${meta.ip ?? "unknown"}`), rateLimit("passwordReset", `email:${email}`)]);
  if (!byIp.allowed || !byEmail.allowed) return { status: "error", message: retryMessage(Math.max(byIp.retryAfterSeconds, byEmail.retryAfterSeconds)) };

  const user = await prisma.user.findUnique({ where: { email } });
  if (user && user.status === "ACTIVE") {
    const token = await issueToken(user.id, "PASSWORD_RESET");
    await sendEmail(email, resetPasswordMessage(user.name, token));
    await audit({ actorId: user.id, action: "user.password_reset_requested", targetType: "User", targetId: user.id, ip: meta.ip });
  }
  // Mesma resposta exista ou não a conta (evita enumeração).
  return { status: "success", message: "Se houver uma conta com este e-mail, você vai receber um link para criar uma nova senha em instantes." };
}

export async function resetPasswordAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const meta = await requestMeta();
  const parsed = resetSchema.safeParse(form(fd));
  if (!parsed.success) return { status: "error", message: "Revise os campos destacados.", fieldErrors: fieldErrors(parsed.error) };

  const userId = await consumeToken(parsed.data.token, "PASSWORD_RESET");
  if (!userId) return { status: "error", message: "Este link expirou ou já foi usado. Peça um novo em “Esqueci minha senha”." };

  const user = await prisma.user.update({
    where: { id: userId },
    // Quem redefine a senha pelo link prova acesso ao e-mail.
    data: { passwordHash: await hashPassword(parsed.data.password), emailVerifiedAt: new Date() },
  });
  await destroyAllSessions(userId);
  await sendEmail(user.email, passwordChangedMessage(user.name));
  await audit({ actorId: userId, action: "user.password_reset", targetType: "User", targetId: userId, ip: meta.ip });
  await createSession(userId, meta);
  redirect("/?senha=redefinida");
}

export async function changePasswordAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const session = await getSessionUser();
  if (!session) return { status: "error", message: "Entre novamente para continuar." };
  const meta = await requestMeta();
  const current = String(fd.get("current") ?? "");
  const next = passwordSchema.safeParse(fd.get("password"));
  if (!next.success) return { status: "error", message: "Revise a nova senha.", fieldErrors: { password: next.error.issues[0].message } };
  if (fd.get("password") !== fd.get("confirm")) return { status: "error", message: "As senhas não conferem.", fieldErrors: { confirm: "As senhas não conferem" } };

  const rl = await rateLimit("login", `pwchange:${session.id}`);
  if (!rl.allowed) return { status: "error", message: retryMessage(rl.retryAfterSeconds) };

  const user = await prisma.user.findUniqueOrThrow({ where: { id: session.id } });
  if (user.passwordHash && !(await verifyPassword(current, user.passwordHash))) {
    return { status: "error", message: "Senha atual incorreta.", fieldErrors: { current: "Senha atual incorreta" } };
  }
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(next.data) } });
  await destroyAllSessions(user.id, session.sessionId);
  await sendEmail(user.email, passwordChangedMessage(user.name));
  await audit({ actorId: user.id, action: "user.password_changed", targetType: "User", targetId: user.id, ip: meta.ip });
  return { status: "success", message: "Senha alterada. As outras sessões foram encerradas." };
}

export async function resendVerificationAction(): Promise<ActionState> {
  const session = await getSessionUser();
  if (!session) return { status: "error", message: "Entre na sua conta para continuar." };
  if (session.emailVerified) return { status: "success", message: "Seu e-mail já está confirmado." };
  const rl = await rateLimit("verifyResend", session.id);
  if (!rl.allowed) return { status: "error", message: retryMessage(rl.retryAfterSeconds) };
  const token = await issueToken(session.id, "EMAIL_VERIFY");
  await sendEmail(session.email, verifyEmailMessage(session.name, token));
  return { status: "success", message: `Enviamos um novo link para ${session.email}.` };
}

/** Usado pela página /verificar-email. */
export async function verifyEmailToken(token: string): Promise<boolean> {
  const userId = await consumeToken(token, "EMAIL_VERIFY");
  if (!userId) return false;
  await prisma.user.update({ where: { id: userId }, data: { emailVerifiedAt: new Date() } });
  await audit({ actorId: userId, action: "user.email_verified", targetType: "User", targetId: userId });
  return true;
}
