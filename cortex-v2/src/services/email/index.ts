import "server-only";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface EmailProvider {
  readonly name: string;
  readonly configured: boolean;
  send(message: EmailMessage): Promise<{ delivered: boolean; id?: string }>;
}

class ResendProvider implements EmailProvider {
  readonly name = "resend";
  readonly configured = true;
  constructor(private apiKey: string, private from: string) {}

  async send(message: EmailMessage) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: this.from, to: [message.to], subject: message.subject, html: message.html, text: message.text }),
    });
    if (!res.ok) {
      logger.error("email.resend_failed", { status: res.status, body: (await res.text()).slice(0, 300) });
      return { delivered: false };
    }
    const data = (await res.json()) as { id?: string };
    return { delivered: true, id: data.id };
  }
}

/** Sem provedor configurado: em desenvolvimento o conteúdo vai para o log do servidor; nada é enviado. */
class LogOnlyProvider implements EmailProvider {
  readonly name = "log";
  readonly configured = false;
  async send(message: EmailMessage) {
    if (process.env.NODE_ENV !== "production") {
      logger.info("email.dev_preview", { to: message.to, subject: message.subject, text: message.text });
    } else {
      logger.warn("email.not_configured", { subject: message.subject });
    }
    return { delivered: false };
  }
}

export function isEmailConfigured() {
  return Boolean(env().RESEND_API_KEY);
}

export function emailProvider(): EmailProvider {
  const e = env();
  if (e.RESEND_API_KEY) return new ResendProvider(e.RESEND_API_KEY, e.EMAIL_FROM ?? "JR Córtex <no-reply@jrcortex.com.br>");
  return new LogOnlyProvider();
}

function layout(title: string, body: string, cta?: { label: string; url: string }) {
  const button = cta
    ? `<p style="margin:28px 0"><a href="${cta.url}" style="background:#4f46e5;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600">${cta.label}</a></p>`
    : "";
  return `<!doctype html><html><body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#f6f7f9;padding:32px">
<div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:32px">
<p style="font-weight:700;letter-spacing:-0.02em;margin:0 0 24px">JR Córtex</p>
<h1 style="font-size:20px;margin:0 0 12px">${title}</h1>${body}${button}
<p style="color:#6b7280;font-size:12px;margin-top:32px">Se você não esperava este e-mail, pode ignorá-lo com segurança.</p>
</div></body></html>`;
}

export const emailTemplates = {
  passwordReset(url: string) {
    return {
      subject: "Redefinição de senha — JR Córtex",
      html: layout("Redefina sua senha", `<p>Recebemos um pedido para redefinir sua senha. O link expira em 1 hora.</p>`, { label: "Redefinir senha", url }),
      text: `Redefina sua senha (link válido por 1 hora): ${url}`,
    };
  },
  invitation(orgName: string, inviterName: string, url: string) {
    return {
      subject: `${inviterName} convidou você para ${orgName} no JR Córtex`,
      html: layout(`Convite para ${orgName}`, `<p>${inviterName} convidou você para participar do workspace <strong>${orgName}</strong>. O convite expira em 7 dias.</p>`, { label: "Aceitar convite", url }),
      text: `${inviterName} convidou você para ${orgName}. Aceite em: ${url}`,
    };
  },
};
