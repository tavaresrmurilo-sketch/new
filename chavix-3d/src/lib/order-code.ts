import { randomInt } from "node:crypto";

/**
 * Código público do pedido: "CHX-" + 6 caracteres aleatórios de um alfabeto sem
 * caracteres ambíguos (sem 0/O, 1/I). 32^6 ≈ 1 bilhão de combinações, gerados com
 * crypto.randomInt — nada sequencial ou previsível.
 */
export const ORDER_CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const CODE_LENGTH = 6;
const PREFIX = "CHX-";

export function generateOrderCode(): string {
  let suffix = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    suffix += ORDER_CODE_ALPHABET[randomInt(ORDER_CODE_ALPHABET.length)];
  }
  return PREFIX + suffix;
}

/** Aceita "chx-a82f91", "CHXA82F91" ou " CHX-A82F91 " e devolve "CHX-A82F91". */
export function normalizeOrderCode(input: string): string | null {
  const cleaned = input.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const match = /^CHX([A-Z0-9]{6})$/.exec(cleaned);
  return match ? `${PREFIX}${match[1]}` : null;
}

/** O txid do Pix estático só aceita letras e números: "CHX-A82F91" → "CHXA82F91". */
export function orderCodeToTxid(code: string): string {
  return code.replace(/[^A-Za-z0-9]/g, "");
}
