import { z } from "zod";
import { detectColumnType, type ColumnKind } from "@/server/cortex/mapping";
import { assertPublicHost } from "./sql/network";

const headerName = z.string().trim().regex(/^[A-Za-z0-9-]{1,60}$/, "Nome de header inválido");

/** Configuração de API REST (armazenada inteira no Credentials Vault). */
export const restConnectionSchema = z.object({
  baseUrl: z.string().trim().url("URL inválida").refine((u) => u.startsWith("https://") || (process.env.ALLOW_PRIVATE_DB_HOSTS === "true" && u.startsWith("http://")), "A URL deve usar HTTPS"),
  authType: z.enum(["NONE", "API_KEY", "BEARER_TOKEN", "BASIC_AUTH"]).default("NONE"),
  apiKeyHeader: headerName.default("X-API-Key"),
  apiKey: z.string().max(2000).optional(),
  token: z.string().max(4000).optional(),
  username: z.string().max(200).optional(),
  password: z.string().max(500).optional(),
  headers: z.array(z.object({ name: headerName, value: z.string().max(2000) })).max(20).default([]),
});

export type RestConnection = z.infer<typeof restConnectionSchema>;

export const endpointPathSchema = z.string().trim().max(300).regex(/^\/[A-Za-z0-9\-._~!$&'()*+,;=:@/%?]*$/, "Endpoint inválido (ex.: /customers)");

const TIMEOUT_MS = 15_000;
const MAX_BYTES = 20 * 1024 * 1024;

export function restHeaders(cfg: RestConnection): Record<string, string> {
  const h: Record<string, string> = { Accept: "application/json", "User-Agent": "JR-Cortex-AI/1.0 (read-only)" };
  for (const x of cfg.headers) h[x.name] = x.value;
  if (cfg.authType === "API_KEY" && cfg.apiKey) h[cfg.apiKeyHeader] = cfg.apiKey;
  if (cfg.authType === "BEARER_TOKEN" && cfg.token) h.Authorization = `Bearer ${cfg.token}`;
  if (cfg.authType === "BASIC_AUTH" && cfg.username) h.Authorization = `Basic ${Buffer.from(`${cfg.username}:${cfg.password ?? ""}`).toString("base64")}`;
  return h;
}

export function endpointUrl(cfg: RestConnection, path: string): URL {
  const base = cfg.baseUrl.replace(/\/+$/, "");
  const url = new URL(base + path);
  if (url.origin !== new URL(base).origin) throw new Error("O endpoint deve pertencer à mesma origem da Base URL.");
  return url;
}

/** Somente GET, sem seguir redirecionamentos, com timeout e limite de tamanho. */
export async function restGet(cfg: RestConnection, path: string): Promise<{ status: number; ms: number; body: unknown }> {
  const url = endpointUrl(cfg, path);
  await assertPublicHost(url.hostname);
  const started = Date.now();
  const res = await fetch(url, { method: "GET", headers: restHeaders(cfg), redirect: "manual", signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
  const ms = Date.now() - started;
  if (res.status >= 300 && res.status < 400) return { status: res.status, ms, body: null };
  const text = await res.text();
  if (text.length > MAX_BYTES) throw new Error("Resposta da API maior que 20 MB.");
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  return { status: res.status, ms, body };
}

export function extractItems(body: unknown, dataPath?: string | null): Record<string, unknown>[] {
  let v: unknown = body;
  if (dataPath) v = dataPath.split(".").reduce<unknown>((acc, k) => (acc && typeof acc === "object" ? (acc as Record<string, unknown>)[k] : undefined), body);
  else if (v && !Array.isArray(v) && typeof v === "object") {
    const o = v as Record<string, unknown>;
    v = ["data", "items", "results", "records", "rows"].map((k) => o[k]).find(Array.isArray) ?? [v];
  }
  return Array.isArray(v) ? (v.filter((x) => x && typeof x === "object") as Record<string, unknown>[]) : [];
}

/** Achata objetos aninhados em chaves com ponto (cliente.nome), até 3 níveis; listas são ignoradas. */
export function flatten(obj: Record<string, unknown>, prefix = "", depth = 0, out: Record<string, unknown> = {}): Record<string, unknown> {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v) && !(v instanceof Date) && depth < 3) flatten(v as Record<string, unknown>, key, depth + 1, out);
    else if (!Array.isArray(v)) out[key] = v;
  }
  return out;
}

export function describeFields(items: Record<string, unknown>[]): { name: string; type: string; kind: ColumnKind }[] {
  const flat = items.slice(0, 50).map((i) => flatten(i));
  const keys = [...new Set(flat.flatMap((f) => Object.keys(f)))].slice(0, 200);
  return keys.map((k) => {
    const kind = detectColumnType(flat.map((f) => f[k]));
    return { name: k, type: kind, kind };
  });
}
