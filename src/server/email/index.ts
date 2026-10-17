import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import { prisma } from "@/server/db";
import { env, integrations } from "@/server/env";
import type { EmailMessage } from "./templates";

export type { EmailMessage } from "./templates";

/**
 * Envia um e-mail transacional. Toda mensagem é registrada em EmailOutbox.
 * Sem provedor configurado, a mensagem fica com status SKIPPED (visível no /admin)
 * e, fora de produção, o conteúdo de texto é exibido no console para testes locais.
 */
export async function sendEmail(to: string, message: EmailMessage): Promise<{ id: string; status: string }> {
  const e = env();
  const row = await prisma.emailOutbox.create({
    data: { to, subject: message.subject, template: message.template, html: message.html, text: message.text },
  });

  if (!integrations().email) {
    if (e.NODE_ENV !== "production") {
      console.info(`\n[email:dev] para ${to} — ${message.subject}\n${message.text}\n`);
    }
    await prisma.emailOutbox.update({ where: { id: row.id }, data: { status: "SKIPPED", provider: "none" } });
    return { id: row.id, status: "SKIPPED" };
  }

  try {
    const providerMessageId = e.EMAIL_PROVIDER === "resend" ? await sendViaResend(to, message) : await sendViaSmtp(to, message);
    await prisma.emailOutbox.update({
      where: { id: row.id },
      data: { status: "SENT", provider: e.EMAIL_PROVIDER, providerMessageId, sentAt: new Date(), attempts: { increment: 1 } },
    });
    return { id: row.id, status: "SENT" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[email] falha no envio", to, message.template, msg);
    await prisma.emailOutbox.update({
      where: { id: row.id },
      data: { status: "FAILED", provider: e.EMAIL_PROVIDER, error: msg.slice(0, 1000), attempts: { increment: 1 } },
    });
    return { id: row.id, status: "FAILED" };
  }
}

async function sendViaResend(to: string, m: EmailMessage): Promise<string | null> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${env().RESEND_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ from: env().EMAIL_FROM, to: [to], subject: m.subject, html: m.html, text: m.text }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const body = (await res.json()) as { id?: string };
  return body.id ?? null;
}

let transporter: Transporter | null = null;
async function sendViaSmtp(to: string, m: EmailMessage): Promise<string | null> {
  const e = env();
  transporter ??= nodemailer.createTransport({
    host: e.SMTP_HOST,
    port: e.SMTP_PORT ?? 587,
    secure: e.SMTP_SECURE,
    auth: e.SMTP_USER ? { user: e.SMTP_USER, pass: e.SMTP_PASSWORD } : undefined,
  });
  const info = await transporter.sendMail({ from: e.EMAIL_FROM, to, subject: m.subject, html: m.html, text: m.text });
  return info.messageId ?? null;
}
