import type { ContactPreferenceValue } from "./csv";

export type ContactSubject = {
  contactPreference: ContactPreferenceValue;
  marketingConsent: boolean;
  doNotContact: boolean;
  email?: string | null;
};

export type ChannelDecision = { allowed: true } | { allowed: false; reason: string };

export const CONTACT_PREFERENCE_LABEL: Record<ContactPreferenceValue, string> = {
  WHATSAPP: "WhatsApp",
  PHONE: "Ligação",
  EMAIL: "E-mail",
  ANY: "Qualquer canal",
};

/**
 * Decide se o cliente pode receber mensagem por WhatsApp, respeitando
 * (1) pedido de não contato, (2) consentimento e (3) preferência de canal.
 */
export function whatsappDecision(subject: ContactSubject): ChannelDecision {
  if (subject.doNotContact) return { allowed: false, reason: "O cliente pediu para não receber mensagens." };
  if (!subject.marketingConsent) {
    return { allowed: false, reason: "Sem consentimento registrado para mensagens. Registre a autorização do cliente antes de enviar." };
  }
  if (subject.contactPreference === "PHONE") return { allowed: false, reason: "O cliente prefere ser contatado por ligação." };
  if (subject.contactPreference === "EMAIL") return { allowed: false, reason: "O cliente prefere ser contatado por e-mail." };
  return { allowed: true };
}

export function phoneCallDecision(subject: ContactSubject): ChannelDecision {
  if (subject.doNotContact) return { allowed: false, reason: "O cliente pediu para não ser contatado." };
  if (subject.contactPreference === "EMAIL") return { allowed: false, reason: "O cliente prefere ser contatado por e-mail." };
  return { allowed: true };
}

export function emailDecision(subject: ContactSubject): ChannelDecision {
  if (subject.doNotContact) return { allowed: false, reason: "O cliente pediu para não ser contatado." };
  if (!subject.email) return { allowed: false, reason: "Cliente sem e-mail cadastrado." };
  if (!subject.marketingConsent) return { allowed: false, reason: "Sem consentimento registrado para mensagens." };
  if (subject.contactPreference === "PHONE" || subject.contactPreference === "WHATSAPP") {
    return { allowed: false, reason: `O cliente prefere ${CONTACT_PREFERENCE_LABEL[subject.contactPreference]}.` };
  }
  return { allowed: true };
}
