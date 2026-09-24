import type { ConnectorType } from "@prisma/client";
import { ConnectorNotAvailableError, type ConnectorProvider, type CredentialField } from "../types";

/**
 * Conectores cuja arquitetura está pronta, mas dependem de APIs/credenciais/drivers externos
 * que ainda não possuímos. Eles NÃO fingem funcionar: testConnection e fetch retornam erro explícito.
 */
function planned(id: string, label: string, type: ConnectorType, description: string, credentialFields: CredentialField[]): ConnectorProvider {
  return {
    id,
    label,
    type,
    description,
    availability: "planned",
    credentialFields,
    async testConnection() {
      return { ok: false, message: `Conector "${label}" planejado: depende de API/credenciais externas. Use importação de planilhas ou API REST enquanto isso.` };
    },
    async fetch() {
      throw new ConnectorNotAvailableError(label);
    },
  };
}

const apiCreds: CredentialField[] = [
  { key: "baseUrl", label: "URL da API", secret: false, required: true },
  { key: "clientId", label: "Client ID", secret: false, required: true },
  { key: "clientSecret", label: "Client Secret", secret: true, required: true },
];
const dbCreds: CredentialField[] = [
  { key: "host", label: "Host", secret: false, required: true },
  { key: "port", label: "Porta", secret: false, required: true },
  { key: "database", label: "Banco", secret: false, required: true },
  { key: "user", label: "Usuário (somente leitura)", secret: false, required: true },
  { key: "password", label: "Senha", secret: true, required: true },
];

export const erpProvider = planned("erp", "ERP", "ERP", "Omie, Bling, TOTVS, SAP Business One, Sankhya e outros via adapter específico.", apiCreds);
export const crmProvider = planned("crm", "CRM", "CRM", "RD Station, Pipedrive, HubSpot, Salesforce via adapter específico.", apiCreds);
export const financeProvider = planned("finance", "Sistema financeiro", "FINANCE", "Conta Azul, Nibo, Granatum, extratos bancários (Open Finance).", apiCreds);
export const accountingProvider = planned("accounting", "Sistema contábil", "ACCOUNTING", "Domínio, Alterdata, Questor — balancetes e razão contábil.", apiCreds);
export const logisticsProvider = planned("logistics", "Logística", "LOGISTICS", "TMS/WMS: fretes, entregas e estoques.", apiCreds);
export const postgresProvider = planned("postgresql", "PostgreSQL", "DATABASE", "Leitura de views dedicadas com usuário somente leitura.", dbCreds);
export const mysqlProvider = planned("mysql", "MySQL", "DATABASE", "Leitura de views dedicadas com usuário somente leitura.", dbCreds);
