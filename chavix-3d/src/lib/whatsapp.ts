import { onlyDigits } from "@/lib/text";

/** Normaliza para o formato do wa.me: DDI + DDD + número, só dígitos. */
export function normalizeWhatsapp(value: string | null | undefined): string | null {
  if (!value) return null;
  let digits = onlyDigits(value);
  if (digits.length === 10 || digits.length === 11) digits = `55${digits}`;
  return /^\d{12,15}$/.test(digits) ? digits : null;
}

export function whatsappLink(number: string | null | undefined, message: string): string | null {
  const normalized = normalizeWhatsapp(number);
  if (!normalized) return null;
  return `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`;
}

export const WHATSAPP_MESSAGES = {
  general: "Oi, CHAVIX! Vim pelo site e queria conversar com vocês.",
  question: "Oi, CHAVIX! Tenho uma dúvida.",
  custom: "Oi, CHAVIX! Quero um chaveiro personalizado. Posso mandar minha ideia?",
  product: (name: string, url: string) => `Oi, CHAVIX! Tenho uma dúvida sobre o chaveiro "${name}": ${url}`,
  order: (code: string) => `Oi, CHAVIX! Queria falar sobre o pedido ${code}.`,
};
