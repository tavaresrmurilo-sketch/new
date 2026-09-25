import { googleSheetsProvider } from "./providers/google-sheets";
import { mockErpProvider } from "./providers/mock-erp";
import { accountingProvider, crmProvider, erpProvider, financeProvider, logisticsProvider } from "./providers/planned";
import { restApiProvider } from "./providers/rest-api";
import { csvProvider, manualProvider, spreadsheetProvider } from "./providers/spreadsheet";
import { sqlProvider } from "./providers/sql";
import type { ConnectorProvider } from "./types";

export const postgresProvider = sqlProvider("postgresql", "PostgreSQL", "Conecte um banco PostgreSQL (somente leitura).");
export const mysqlProvider = sqlProvider("mysql", "MySQL", "Conecte um banco MySQL ou MariaDB (somente leitura).");
export const sqlServerProvider = sqlProvider("sqlserver", "SQL Server", "Conecte Microsoft SQL Server (somente leitura).");

export const PROVIDERS: ConnectorProvider[] = [
  postgresProvider,
  mysqlProvider,
  sqlServerProvider,
  restApiProvider,
  csvProvider,
  spreadsheetProvider,
  googleSheetsProvider,
  erpProvider,
  crmProvider,
  financeProvider,
  accountingProvider,
  logisticsProvider,
  manualProvider,
  mockErpProvider,
];

export function getProvider(id: string): ConnectorProvider | undefined {
  return PROVIDERS.find((p) => p.id === id);
}

export function providerSummary(p: ConnectorProvider) {
  return {
    id: p.id,
    label: p.label,
    type: p.type,
    description: p.description,
    availability: p.availability,
    credentialFields: p.credentialFields,
  };
}
