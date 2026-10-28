import "server-only";
import { logger } from "./logger";

/**
 * Envio de e-mails transacionais via Resend (https://resend.com).
 * Configure RESEND_API_KEY e EMAIL_FROM para habilitar a recuperação de senha.
 */
export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

export async function sendEmail(input: { to: string; subject: string; html: string; text: string }) {
  if (!isEmailConfigured()) throw new Error("Serviço de e-mail não configurado.");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM,
      to: [input.to],
      subject: input.subject,
      html: input.html,
      text: input.text,
    }),
  });
  if (!response.ok) {
    logger.error("email_send_failed", new Error(`Resend HTTP ${response.status}`));
    throw new Error("Falha ao enviar e-mail.");
  }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export function resetPasswordEmail(name: string, url: string) {
  const safeName = escapeHtml(name.split(" ")[0] ?? "");
  const safeUrl = escapeHtml(url);
  return {
    subject: "Redefinição de senha — VoltaCliente",
    text: `Olá, ${name.split(" ")[0]}!\n\nRecebemos um pedido para redefinir sua senha no VoltaCliente.\nAcesse o link abaixo (válido por 1 hora):\n${url}\n\nSe você não fez esse pedido, ignore este e-mail.`,
    html: `<div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;color:#0f172a">
  <h2 style="color:#1e3a8a">VoltaCliente</h2>
  <p>Olá, ${safeName}!</p>
  <p>Recebemos um pedido para redefinir sua senha. O link é válido por 1 hora.</p>
  <p><a href="${safeUrl}" style="display:inline-block;background:#1e3a8a;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none">Redefinir senha</a></p>
  <p style="color:#64748b;font-size:13px">Se você não fez esse pedido, ignore este e-mail.</p>
</div>`,
  };
}
