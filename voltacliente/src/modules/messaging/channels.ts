/**
 * Canais de envio de mensagens.
 *
 * MVP: envio ASSISTIDO — o sistema monta a mensagem e abre o WhatsApp
 * (wa.me) com o texto preenchido; o envio é feito manualmente pelo usuário e
 * só é registrado quando ele confirma ("Marcar como contatado").
 *
 * Futuro: a API oficial do WhatsApp Business (Cloud API) poderá implementar
 * `MessageChannel` com envio automático. Requisitos já previstos no modelo
 * de dados: consentimento (Customer.marketingConsent), opt-out
 * (Customer.doNotContact) e histórico (ContactLog). Disparos automáticos NÃO
 * estão implementados nesta versão.
 */
import { whatsappUrl } from "@/lib/phone";

export type OutgoingMessage = { phoneNormalized: string; text: string };

export interface MessageChannel {
  readonly id: "whatsapp-assisted" | "whatsapp-cloud-api";
  /** Envio automático? Canais assistidos apenas preparam a mensagem. */
  readonly automatic: boolean;
  prepare(message: OutgoingMessage): { url: string };
}

export const assistedWhatsAppChannel: MessageChannel = {
  id: "whatsapp-assisted",
  automatic: false,
  prepare(message) {
    return { url: whatsappUrl(message.phoneNormalized, message.text) };
  },
};
