import "server-only";
import { normalizePixKey, PixConfigError, sanitizeMerchantText, type PixKeyType } from "./brcode";

export interface PixConfig {
  key: string;
  keyType: PixKeyType;
  receiverName: string;
  city: string;
}

/**
 * Lê a configuração Pix das variáveis de ambiente.
 * A chave nunca é escrita no código nem salva no banco: vem só de process.env.PIX_KEY.
 */
export function getPixConfig(): PixConfig {
  const { key, type } = normalizePixKey(process.env.PIX_KEY ?? "");
  const receiverName = sanitizeMerchantText(process.env.PIX_RECEIVER_NAME ?? "", 25);
  const city = sanitizeMerchantText(process.env.PIX_CITY ?? "", 15);
  if (!receiverName) throw new PixConfigError("Defina PIX_RECEIVER_NAME no ambiente");
  if (!city) throw new PixConfigError("Defina PIX_CITY no ambiente");
  return { key, keyType: type, receiverName, city };
}

export function getPixConfigStatus(): { ok: true; config: PixConfig } | { ok: false; error: string } {
  try {
    return { ok: true, config: getPixConfig() };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Configuração Pix inválida" };
  }
}

/** Exibe a chave parcialmente no painel (ex.: 072.•••.•••-77). */
export function maskPixKey(key: string, type: PixKeyType): string {
  if (type === "CPF") return `${key.slice(0, 3)}.•••.•••-${key.slice(-2)}`;
  if (type === "CNPJ") return `${key.slice(0, 2)}.•••.•••/••••-${key.slice(-2)}`;
  if (type === "EMAIL") return `${key.slice(0, 2)}•••${key.slice(key.indexOf("@"))}`;
  if (type === "PHONE") return `${key.slice(0, 5)}•••••${key.slice(-4)}`;
  return `${key.slice(0, 8)}-••••`;
}
