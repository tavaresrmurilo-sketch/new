import { googleSheetsProvider } from "./providers/google-sheets";
import { mockErpProvider } from "./providers/mock-erp";
import {
  accountingProvider, crmProvider, erpProvider, financeProvider, logisticsProvider, mysqlProvider, postgresProvider,
} from "./providers/planned";
import { restApiProvider } from "./providers/rest-api";
import { csvProvider, manualProvider, spreadsheetProvider } from "./providers/spreadsheet";
import type { ConnectorProvider } from "./types";

export const PROVIDERS: ConnectorProvider[] = [
  erpProvider,
  crmProvider,
  postgresProvider,
  mysqlProvider,
  financeProvider,
  accountingProvider,
  logisticsProvider,
  googleSheetsProvider,
  spreadsheetProvider,
  csvProvider,
  restApiProvider,
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
