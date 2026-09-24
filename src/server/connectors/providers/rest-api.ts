import { z } from "zod";
import { parseDate, parseNumber } from "@/server/cortex/mapping";
import type { CanonicalBatch, EntityKey } from "@/server/cortex/records";
import type { ConnectorProvider } from "../types";

const configSchema = z.object({
  baseUrl: z.string().url().refine((u) => u.startsWith("https://"), "A URL deve usar HTTPS"),
  endpoints: z
    .array(
      z.object({
        entity: z.enum(["customers", "products", "sales", "expenses", "revenues", "payables", "receivables"]),
        path: z.string().startsWith("/"),
        dataPath: z.string().optional(),
        fieldMap: z.record(z.string(), z.string()),
      }),
    )
    .min(1),
  authHeader: z.string().default("Authorization"),
  authScheme: z.string().default("Bearer"),
});

const DATE_FIELDS = new Set(["date", "issueDate", "dueDate", "paidAt", "receivedAt"]);
const NUMBER_FIELDS = new Set(["grossAmount", "discountAmount", "taxAmount", "costAmount", "amount", "paidAmount", "receivedAmount", "unitPrice", "unitCost"]);

function pick(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, k) => (acc && typeof acc === "object" ? (acc as Record<string, unknown>)[k] : undefined), obj);
}

function isPrivateHost(host: string): boolean {
  return /^(localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|0\.|\[?::1\]?$|metadata)/i.test(host);
}

/**
 * Conector REST genérico e funcional: consome endpoints JSON (HTTPS) e converte campos para o
 * modelo canônico via "fieldMap" configurado pelo administrador (campo canônico → caminho no JSON).
 */
export const restApiProvider: ConnectorProvider = {
  id: "rest-api",
  label: "API REST (genérica)",
  type: "API",
  description: "Conecte qualquer sistema que exponha uma API REST JSON sobre HTTPS, mapeando campos para o modelo do Cortex.",
  availability: "available",
  credentialFields: [{ key: "token", label: "Token de acesso", secret: true, required: false }],
  configSchema: configSchema as unknown as z.ZodType<Record<string, unknown>>,
  async testConnection(ctx) {
    const cfg = configSchema.safeParse(ctx.config);
    if (!cfg.success) return { ok: false, message: "Configuração inválida: " + cfg.error.issues.map((i) => i.message).join("; ") };
    const url = new URL(cfg.data.baseUrl + cfg.data.endpoints[0].path);
    if (isPrivateHost(url.hostname)) return { ok: false, message: "Endereços internos/privados não são permitidos." };
    const res = await fetch(url, { headers: authHeaders(cfg.data, ctx.credentials), signal: AbortSignal.timeout(10_000) });
    return { ok: res.ok, message: res.ok ? `Conexão OK (HTTP ${res.status}).` : `Falha: HTTP ${res.status}.` };
  },
  async fetch(ctx) {
    const cfg = configSchema.parse(ctx.config);
    const batch: CanonicalBatch = {};
    for (const ep of cfg.endpoints) {
      const url = new URL(cfg.baseUrl + ep.path);
      if (isPrivateHost(url.hostname)) throw new Error("Endereços internos/privados não são permitidos.");
      const res = await fetch(url, { headers: authHeaders(cfg, ctx.credentials), signal: AbortSignal.timeout(30_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status} em ${ep.path}`);
      const body = (await res.json()) as unknown;
      const list = ep.dataPath ? pick(body, ep.dataPath) : body;
      if (!Array.isArray(list)) throw new Error(`Resposta de ${ep.path} não é uma lista.`);
      const records = list.slice(0, 50_000).map((item) => {
        const rec: Record<string, unknown> = {};
        for (const [field, path] of Object.entries(ep.fieldMap)) {
          let v = pick(item, path);
          if (DATE_FIELDS.has(field)) v = parseDate(v);
          else if (NUMBER_FIELDS.has(field)) v = parseNumber(v);
          else if (v !== undefined && v !== null) v = String(v);
          rec[field] = v;
        }
        return rec;
      });
      batch[ep.entity as EntityKey] = [...(batch[ep.entity as EntityKey] ?? []), ...records];
      ctx.log(`${ep.path}: ${records.length} registros recebidos.`);
    }
    return { batch, hasMore: false };
  },
};

function authHeaders(cfg: z.infer<typeof configSchema>, creds: Record<string, string>): Record<string, string> {
  const h: Record<string, string> = { Accept: "application/json" };
  if (creds.token) h[cfg.authHeader] = cfg.authScheme ? `${cfg.authScheme} ${creds.token}` : creds.token;
  return h;
}
