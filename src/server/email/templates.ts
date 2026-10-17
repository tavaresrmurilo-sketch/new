import "server-only";
import { appUrl } from "@/server/env";
import { renderEmail } from "./layout";

export interface EmailMessage {
  template: string;
  subject: string;
  html: string;
  text: string;
}

export function verifyEmailMessage(name: string, token: string): EmailMessage {
  const url = appUrl(`/verificar-email?token=${encodeURIComponent(token)}`);
  return {
    template: "verify-email",
    subject: "Confirme seu e-mail no Mixtour",
    ...renderEmail({
      preheader: "Falta só um passo para ativar sua conta.",
      heading: `Oi, ${name.split(" ")[0]}! Confirme seu e-mail`,
      paragraphs: ["Para proteger sua conta e liberar todos os recursos do Mixtour, confirme que este e-mail é seu."],
      cta: { label: "Confirmar e-mail", url },
      footnote: "O link vale por 48 horas. Se você não criou uma conta no Mixtour, ignore esta mensagem.",
    }),
  };
}

export function resetPasswordMessage(name: string, token: string): EmailMessage {
  const url = appUrl(`/redefinir-senha?token=${encodeURIComponent(token)}`);
  return {
    template: "reset-password",
    subject: "Redefina sua senha do Mixtour",
    ...renderEmail({
      preheader: "Recebemos um pedido para redefinir sua senha.",
      heading: "Redefinir senha",
      paragraphs: [`Oi, ${name.split(" ")[0]}. Recebemos um pedido para redefinir a senha da sua conta.`],
      cta: { label: "Criar nova senha", url },
      footnote: "O link vale por 1 hora e só pode ser usado uma vez. Se você não pediu, ignore — sua senha continua a mesma.",
    }),
  };
}

export function passwordChangedMessage(name: string): EmailMessage {
  return {
    template: "password-changed",
    subject: "Sua senha do Mixtour foi alterada",
    ...renderEmail({
      preheader: "Sua senha foi alterada.",
      heading: "Senha alterada",
      paragraphs: [
        `Oi, ${name.split(" ")[0]}. A senha da sua conta foi alterada e as outras sessões foram encerradas.`,
        "Se não foi você, redefina a senha imediatamente e fale com a gente.",
      ],
      cta: { label: "Redefinir senha", url: appUrl("/recuperar-senha") },
    }),
  };
}

export function genericMessage(input: { template: string; subject: string; heading: string; paragraphs: string[]; cta?: { label: string; path: string }; footnote?: string }): EmailMessage {
  return {
    template: input.template,
    subject: input.subject,
    ...renderEmail({
      preheader: input.paragraphs[0] ?? input.heading,
      heading: input.heading,
      paragraphs: input.paragraphs,
      cta: input.cta ? { label: input.cta.label, url: appUrl(input.cta.path) } : undefined,
      footnote: input.footnote,
    }),
  };
}
