import type { ConnectorProvider } from "../types";

/** Planilhas (CSV/XLSX) entram pelo assistente de importação com mapeamento confirmado pelo usuário. */
function uploadOnly(id: string, label: string, type: "CSV" | "SPREADSHEET" | "MANUAL", description: string): ConnectorProvider {
  return {
    id,
    label,
    type,
    description,
    availability: "available",
    credentialFields: [],
    async testConnection() {
      return { ok: true, message: "Este conector recebe arquivos pelo assistente de importação." };
    },
    async fetch() {
      throw new Error("Este conector não sincroniza automaticamente. Use Integrações → Importar planilha.");
    },
  };
}

export const csvProvider = uploadOnly("csv", "CSV", "CSV", "Upload de arquivos CSV com detecção de colunas e mapeamento sugerido.");
export const spreadsheetProvider = uploadOnly("xlsx", "Excel (XLSX)", "SPREADSHEET", "Upload de planilhas Excel com detecção de colunas e mapeamento sugerido.");
export const manualProvider = uploadOnly("manual", "Lançamento manual", "MANUAL", "Dados informados manualmente pelo cliente.");
