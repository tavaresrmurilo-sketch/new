import "server-only";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { AppError } from "@/server/errors";

function isPrivateIp(ip: string): boolean {
  if (ip.includes(":")) {
    const v = ip.toLowerCase();
    if (v === "::1" || v === "::") return true;
    if (v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80")) return true;
    if (v.startsWith("::ffff:")) return isPrivateIp(v.slice(7));
    return false;
  }
  const [a, b] = ip.split(".").map(Number) as [number, number];
  return (
    a === 10 ||
    a === 127 ||
    a === 0 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) ||
    a >= 224
  );
}

/**
 * Proteção contra SSRF para URLs informadas por clientes (webhooks): exige HTTPS em produção e
 * bloqueia destinos em redes privadas/locais.
 */
export async function assertPublicUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new AppError("VALIDATION", "URL inválida.");
  }
  const allowInsecure = process.env.NODE_ENV !== "production" && process.env.ALLOW_PRIVATE_WEBHOOKS === "true";
  if (url.protocol !== "https:" && !(allowInsecure && url.protocol === "http:")) {
    throw new AppError("VALIDATION", "Use uma URL HTTPS.");
  }
  if (url.username || url.password) throw new AppError("VALIDATION", "A URL não pode conter credenciais.");
  if (allowInsecure) return url;
  const host = url.hostname;
  const addresses = isIP(host) ? [host] : (await lookup(host, { all: true }).catch(() => [])).map((a) => a.address);
  if (!addresses.length) throw new AppError("VALIDATION", "Não foi possível resolver o endereço informado.");
  if (addresses.some(isPrivateIp)) throw new AppError("VALIDATION", "Endereços internos ou privados não são permitidos.");
  return url;
}
