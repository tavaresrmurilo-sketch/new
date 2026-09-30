import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

function secret(): string {
  const value = process.env.AUTH_SECRET;
  if (!value || value.length < 32) {
    throw new Error("AUTH_SECRET ausente ou curto demais (mínimo 32 caracteres)");
  }
  return value;
}

function mac(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

/** Assina um valor: "<payload base64url>.<hmac>" */
export function sign(value: string): string {
  const payload = Buffer.from(value, "utf8").toString("base64url");
  return `${payload}.${mac(payload)}`;
}

/** Devolve o valor original se a assinatura conferir; senão null. */
export function unsign(signed: string | undefined | null): string | null {
  if (!signed) return null;
  const [payload, signature] = signed.split(".");
  if (!payload || !signature) return null;
  const expected = Buffer.from(mac(payload));
  const received = Buffer.from(signature);
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) return null;
  return Buffer.from(payload, "base64url").toString("utf8");
}
