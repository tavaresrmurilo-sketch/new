import { lookup } from "node:dns/promises";
import net from "node:net";

/**
 * Impede que fontes externas apontem para a rede interna do JR Cortex (SSRF), como localhost,
 * metadados de nuvem ou endereços privados. Em desenvolvimento, ALLOW_PRIVATE_DB_HOSTS=true libera.
 */
export class PrivateHostError extends Error {
  constructor(host: string) {
    super(`O endereço ${host} é privado ou interno e não é permitido. Exponha o banco com segurança (IP público com firewall, VPN ou API intermediária).`);
  }
}

function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const v = ip.toLowerCase();
  if (v.startsWith("::ffff:")) return isPrivateIp(v.slice(7));
  return v === "::1" || v === "::" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80");
}

export async function assertPublicHost(host: string): Promise<void> {
  if (process.env.ALLOW_PRIVATE_DB_HOSTS === "true") return;
  const h = host.replace(/^\[|\]$/g, "");
  if (/^localhost$/i.test(h) || h.endsWith(".internal") || h.endsWith(".local")) throw new PrivateHostError(host);
  const addresses = net.isIP(h) ? [{ address: h }] : await lookup(h, { all: true }).catch(() => []);
  if (!addresses.length) return; // falha de DNS vira erro amigável "host não encontrado" na conexão
  if (addresses.some((a) => isPrivateIp(a.address))) throw new PrivateHostError(host);
}

export { isPrivateIp };
