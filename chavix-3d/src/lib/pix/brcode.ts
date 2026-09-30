/**
 * Gerador de BR Code Pix estático (padrão EMV® QRCPS-MPM adotado pelo Banco Central).
 *
 * Referência: "Manual de Padrões para Iniciação do Pix" (BCB), anexo BR Code.
 * Estrutura gerada (ID + tamanho com 2 dígitos + valor):
 *
 *   00 Payload Format Indicator ............ "01"
 *   26 Merchant Account Information (Pix)
 *      00 GUI ............................... "br.gov.bcb.pix"
 *      01 Chave Pix
 *      02 Informação adicional (opcional)
 *   52 Merchant Category Code .............. "0000"
 *   53 Moeda ............................... "986" (BRL)
 *   54 Valor ............................... "123.45"
 *   58 País ................................ "BR"
 *   59 Nome do recebedor (até 25)
 *   60 Cidade do recebedor (até 15)
 *   62 Additional Data Field Template
 *      05 Reference Label (txid, até 25 alfanuméricos)
 *   63 CRC16-CCITT (polinômio 0x1021, valor inicial 0xFFFF) sobre todo o payload + "6304"
 */

import { stripAccents } from "@/lib/text";

export type PixKeyType = "CPF" | "CNPJ" | "EMAIL" | "PHONE" | "EVP";

export class PixConfigError extends Error {}

const GUI = "br.gov.bcb.pix";

/** Monta um campo TLV (ID de 2 dígitos + tamanho com 2 dígitos + valor). */
export function tlv(id: string, value: string): string {
  if (!/^\d{2}$/.test(id)) throw new Error(`ID EMV inválido: ${id}`);
  const length = new TextEncoder().encode(value).length;
  if (length > 99) throw new PixConfigError(`Campo ${id} excede 99 caracteres`);
  return `${id}${String(length).padStart(2, "0")}${value}`;
}

/** CRC-16/CCITT-FALSE, retornado com 4 dígitos hexadecimais maiúsculos. */
export function crc16(payload: string): string {
  let crc = 0xffff;
  for (const byte of new TextEncoder().encode(payload)) {
    crc ^= byte << 8;
    for (let bit = 0; bit < 8; bit++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

function isValidCpf(digits: string): boolean {
  if (!/^\d{11}$/.test(digits) || /^(\d)\1{10}$/.test(digits)) return false;
  const calc = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(digits[i]) * (len + 1 - i);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };
  return calc(9) === Number(digits[9]) && calc(10) === Number(digits[10]);
}

function isValidCnpj(digits: string): boolean {
  if (!/^\d{14}$/.test(digits) || /^(\d)\1{13}$/.test(digits)) return false;
  const calc = (len: number) => {
    const weights = len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const sum = weights.reduce((acc, w, i) => acc + Number(digits[i]) * w, 0);
    const rest = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
  };
  return calc(12) === Number(digits[12]) && calc(13) === Number(digits[13]);
}

/**
 * Normaliza e identifica a chave Pix no formato exigido pelo DICT:
 * CPF/CNPJ só dígitos, e-mail minúsculo, telefone +55DDDNÚMERO, EVP (UUID) minúsculo.
 */
export function normalizePixKey(rawKey: string): { key: string; type: PixKeyType } {
  const raw = rawKey.trim();
  if (!raw) throw new PixConfigError("Chave Pix não configurada");

  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw)) {
    return { key: raw.toLowerCase(), type: "EVP" };
  }
  if (raw.includes("@")) {
    const email = raw.toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 77) {
      throw new PixConfigError("Chave Pix de e-mail inválida");
    }
    return { key: email, type: "EMAIL" };
  }
  if (raw.startsWith("+")) {
    const phone = `+${raw.replace(/\D/g, "")}`;
    if (!/^\+55\d{10,11}$/.test(phone)) throw new PixConfigError("Chave Pix de telefone deve seguir +55DDDNÚMERO");
    return { key: phone, type: "PHONE" };
  }
  const digits = raw.replace(/[.\-/\s]/g, "");
  if (/^\d{11}$/.test(digits)) {
    if (!isValidCpf(digits)) {
      throw new PixConfigError("CPF da chave Pix inválido. Se a chave for um telefone, use o formato +55DDDNÚMERO");
    }
    return { key: digits, type: "CPF" };
  }
  if (/^\d{14}$/.test(digits)) {
    if (!isValidCnpj(digits)) throw new PixConfigError("CNPJ da chave Pix inválido");
    return { key: digits, type: "CNPJ" };
  }
  throw new PixConfigError("Formato de chave Pix não reconhecido");
}

/** Texto aceito nos campos 59/60: sem acentos, apenas caracteres seguros, com limite de tamanho. */
export function sanitizeMerchantText(value: string, maxLength: number): string {
  return stripAccents(value)
    .replace(/[^A-Za-z0-9 .\-&]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength)
    .trim();
}

/** txid do Pix estático: somente [A-Za-z0-9], até 25 caracteres. "***" quando ausente. */
export function sanitizeTxid(value: string | undefined | null): string {
  const cleaned = (value ?? "").replace(/[^A-Za-z0-9]/g, "").slice(0, 25);
  return cleaned || "***";
}

/** 12345 centavos → "123.45" */
export function formatAmount(cents: number): string {
  if (!Number.isSafeInteger(cents) || cents <= 0) throw new PixConfigError("Valor do Pix deve ser um inteiro positivo em centavos");
  const value = `${Math.trunc(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;
  if (value.length > 13) throw new PixConfigError("Valor do Pix excede o limite do BR Code");
  return value;
}

export interface PixPayloadInput {
  key: string;
  receiverName: string;
  city: string;
  amountCents: number;
  txid?: string;
  description?: string;
}

export function buildPixPayload(input: PixPayloadInput): string {
  const { key } = normalizePixKey(input.key);
  const name = sanitizeMerchantText(input.receiverName, 25);
  const city = sanitizeMerchantText(input.city, 15);
  if (!name) throw new PixConfigError("Nome do recebedor (PIX_RECEIVER_NAME) não configurado");
  if (!city) throw new PixConfigError("Cidade do recebedor (PIX_CITY) não configurada");

  const accountFields = [tlv("00", GUI), tlv("01", key)];
  const description = input.description ? sanitizeMerchantText(input.description, 40) : "";
  if (description) {
    // A descrição é opcional: só entra se couber no limite de 99 do campo 26.
    const candidate = accountFields.join("") + tlv("02", description);
    if (candidate.length <= 99) accountFields.push(tlv("02", description));
  }

  const payload =
    tlv("00", "01") +
    tlv("26", accountFields.join("")) +
    tlv("52", "0000") +
    tlv("53", "986") +
    tlv("54", formatAmount(input.amountCents)) +
    tlv("58", "BR") +
    tlv("59", name) +
    tlv("60", city) +
    tlv("62", tlv("05", sanitizeTxid(input.txid))) +
    "6304";

  return payload + crc16(payload);
}

/** Lê um payload EMV em uma lista de campos (não recursivo). */
export function parseTlv(payload: string): Array<{ id: string; value: string }> {
  const fields: Array<{ id: string; value: string }> = [];
  let i = 0;
  while (i < payload.length) {
    const id = payload.slice(i, i + 2);
    const length = Number(payload.slice(i + 2, i + 4));
    if (!/^\d{2}$/.test(id) || Number.isNaN(length)) throw new Error("Payload EMV malformado");
    const value = payload.slice(i + 4, i + 4 + length);
    if (value.length !== length) throw new Error("Payload EMV truncado");
    fields.push({ id, value });
    i += 4 + length;
  }
  return fields;
}

/** Confere se os 4 últimos caracteres correspondem ao CRC do restante do payload. */
export function verifyPixPayload(payload: string): boolean {
  if (payload.length < 8 || payload.slice(-8, -4) !== "6304") return false;
  return crc16(payload.slice(0, -4)) === payload.slice(-4);
}
