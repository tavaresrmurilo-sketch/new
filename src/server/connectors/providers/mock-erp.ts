import type { ConnectorProvider } from "../types";

/**
 * Conector MOCK isolado para desenvolvimento. Gera registros sintéticos determinísticos,
 * claramente identificados, para testar o pipeline (ingestão, idempotência, incremental).
 * Nunca deve ser usado para dados de produção.
 */
function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

export const mockErpProvider: ConnectorProvider = {
  id: "mock-erp",
  label: "ERP Simulado (MOCK)",
  type: "ERP",
  description: "Conector de desenvolvimento que simula um ERP com clientes, vendas e títulos. Dados sintéticos — não usar em produção.",
  availability: "mock",
  credentialFields: [{ key: "apiToken", label: "Token (qualquer valor)", secret: true, required: false }],
  async testConnection() {
    return { ok: true, message: "Conector MOCK: conexão simulada com sucesso (nenhum sistema externo foi contatado)." };
  },
  async fetch(ctx, { mode, cursor, page }) {
    const day = cursor && mode === "INCREMENTAL" ? Number(cursor) : 0;
    const rand = seeded(1000 + day + page);
    const today = new Date();
    const base = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
    const customers = Array.from({ length: 5 }, (_, i) => ({ externalId: `MOCK-C${i + 1}`, name: `[MOCK] Cliente Simulado ${i + 1}` }));
    const sales = Array.from({ length: 10 }, (_, i) => {
      const gross = Math.round(500 + rand() * 4500);
      return {
        externalId: `MOCK-S${day}-${page}-${i}`,
        date: new Date(base - Math.floor(rand() * 20) * 86_400_000),
        customerExternalId: `MOCK-C${1 + Math.floor(rand() * 5)}`,
        grossAmount: gross,
        costAmount: Math.round(gross * 0.55),
        category: "[MOCK] Categoria simulada",
        items: [],
      };
    });
    ctx.log(`MOCK: gerados ${customers.length} clientes e ${sales.length} vendas sintéticas (página ${page}).`);
    return { batch: { customers, sales }, nextCursor: String(day + 1), hasMore: false };
  },
};
