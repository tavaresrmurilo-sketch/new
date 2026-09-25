import type { ConnectorType, ImportTarget, SyncMode } from "@prisma/client";
import type { z } from "zod";
import type { CanonicalBatch } from "@/server/cortex/records";

export interface CredentialField {
  key: string;
  label: string;
  secret: boolean;
  required: boolean;
  placeholder?: string;
}

export interface ConnectorContext {
  tenantId: string;
  integrationId: string;
  config: Record<string, unknown>;
  credentials: Record<string, string>;
  /** tabelas/endpoints autorizados pelo cliente (fontes SQL e API REST) */
  tables: ConnectorTable[];
  log: (message: string, level?: "info" | "warn" | "error") => void;
}

export interface ConnectorTable {
  id: string;
  schemaName: string;
  tableName: string;
  entity: ImportTarget | null;
  mapping: Record<string, string | null>;
  columns: { name: string; type: string; kind: string }[];
  incrementalColumn: string | null;
  lastCursor: string | null;
}

export interface RowRejection {
  message: string;
  metadata?: Record<string, unknown>;
}

export interface FetchResult {
  batch: CanonicalBatch;
  /** cursor para sincronização incremental (ex.: maior updatedAt recebido) */
  nextCursor?: string | null;
  hasMore?: boolean;
  /** linhas rejeitadas antes da ingestão (validação/transformação) */
  rejected?: RowRejection[];
  /** executado somente após a ingestão bem-sucedida do lote (ex.: avançar cursor da tabela) */
  afterIngest?: () => Promise<void>;
}

/**
 * Contrato de todo conector. Para adicionar um ERP/CRM novo, implemente esta interface
 * convertendo os dados do sistema de origem para o modelo canônico do Cortex (records.ts).
 */
export interface ConnectorProvider {
  id: string;
  label: string;
  type: ConnectorType;
  description: string;
  /** "available" = funcional; "mock" = dados sintéticos para desenvolvimento; "planned" = arquitetura pronta, depende de API/credenciais externas */
  availability: "available" | "mock" | "planned";
  credentialFields: CredentialField[];
  configSchema?: z.ZodType<Record<string, unknown>>;
  testConnection(ctx: ConnectorContext): Promise<{ ok: boolean; message: string }>;
  fetch(ctx: ConnectorContext, opts: { mode: SyncMode; cursor: string | null; page: number }): Promise<FetchResult>;
}

export class ConnectorNotAvailableError extends Error {
  constructor(label: string) {
    super(`O conector "${label}" ainda depende de API/credenciais externas e não está disponível nesta versão. Nenhum dado foi sincronizado.`);
  }
}
