import { z } from "zod";
import { isoDateSchema, optionalText } from "@/lib/validation";

export const RETURN_TABS = ["hoje", "atrasados", "proximos", "contatados", "convertidos", "encerrados"] as const;
export type ReturnTab = (typeof RETURN_TABS)[number];

export const CONTACT_CHANNELS = ["WHATSAPP", "PHONE", "EMAIL", "IN_PERSON", "OTHER"] as const;
export const CONTACT_OUTCOMES = ["MESSAGE_SENT", "TALKED", "SCHEDULED", "NO_ANSWER", "DECLINED", "OPTED_OUT"] as const;

export const CHANNEL_LABEL: Record<(typeof CONTACT_CHANNELS)[number], string> = {
  WHATSAPP: "WhatsApp",
  PHONE: "Ligação",
  EMAIL: "E-mail",
  IN_PERSON: "Presencial",
  OTHER: "Outro",
};

export const OUTCOME_LABEL: Record<(typeof CONTACT_OUTCOMES)[number], string> = {
  MESSAGE_SENT: "Mensagem enviada",
  TALKED: "Conversamos",
  SCHEDULED: "Agendou atendimento",
  NO_ANSWER: "Sem resposta",
  DECLINED: "Não tem interesse agora",
  OPTED_OUT: "Pediu para não receber mensagens",
};

export const contactSchema = z.object({
  channel: z.enum(CONTACT_CHANNELS, { error: "Escolha o canal." }),
  outcome: z.enum(CONTACT_OUTCOMES, { error: "Escolha o resultado." }),
  note: optionalText(500, "A observação"),
  message: optionalText(1000, "A mensagem"),
});

export type ContactInput = z.input<typeof contactSchema>;

export const snoozeSchema = z.object({ until: isoDateSchema, note: optionalText(300, "A observação") });
export type SnoozeInput = z.input<typeof snoozeSchema>;

export const dismissSchema = z.object({ note: optionalText(300, "O motivo") });
