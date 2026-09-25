import type { ImportTarget, Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { audit, type AuditActor } from "@/server/audit";
import { ensureDataSource } from "@/server/cortex/ingest";
import { suggestEntity, suggestMappingFromColumns, TARGET_FIELDS, type ColumnMapping } from "@/server/cortex/mapping";
import { AppError, NotFoundError } from "@/server/errors";
import { sanitizeText } from "@/server/security/sanitize";
import { describeFields, endpointPathSchema, extractItems, restConnectionSchema, restGet, type RestConnection } from "./rest";
import { withSqlSession } from "./sql";
import { friendlyError, type FriendlyError } from "./sql/errors";
import { dbConnectionSchema, LIMITS, normalizeConnection, tableKey, type ColumnMeta, type DbConnection, type SqlKind } from "./sql/types";
import { loadCredentials, storeCredentials } from "./vault";

/**
 * Serviço de fontes EXTERNAS (bancos e APIs dos clientes). O Neon continua sendo o banco interno
 * do JR Cortex; as fontes externas são acessadas somente para leitura e nunca recebem escrita.
 */

export const SQL_KINDS = ["postgresql", "mysql", "sqlserver"] as const;
export const EXTERNAL_KINDS = [...SQL_KINDS, "rest-api"] as const;
export type ExternalKind = (typeof EXTERNAL_KINDS)[number];
export const isSqlKind = (k: string): k is SqlKind => (SQL_KINDS as readonly string[]).includes(k);

export const endpointInputSchema = z.object({ path: endpointPathSchema, dataPath: z.string().trim().max(120).regex(/^[A-Za-z0-9_.-]*$/, "Caminho de dados inválido").default("") });

export const sourceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("postgresql"), connection: dbConnectionSchema }),
  z.object({ kind: z.literal("mysql"), connection: dbConnectionSchema }),
  z.object({ kind: z.literal("sqlserver"), connection: dbConnectionSchema }),
  z.object({ kind: z.literal("rest-api"), connection: restConnectionSchema, endpoints: z.array(endpointInputSchema).min(1, "Informe ao menos um endpoint").max(30) }),
]);
export type SourceInput = z.infer<typeof sourceSchema>;

const identifier = z.string().max(128);
export const tableSelectionSchema = z.object({
  schema: identifier.default(""),
  name: z.string().min(1).max(300),
  entity: z.enum(["SALES", "EXPENSES", "REVENUES", "CUSTOMERS", "PRODUCTS", "ACCOUNTS_PAYABLE", "ACCOUNTS_RECEIVABLE", "INVOICES", "ORDERS"]).nullable(),
  mapping: z.record(z.string().max(60), z.string().max(300).nullable()).default({}),
  incrementalColumn: z.string().max(300).nullable().default(null),
  enabled: z.boolean().default(true),
});
export type TableSelection = z.infer<typeof tableSelectionSchema>;

export const SYNC_INTERVALS = [null, 60, 360, 1440] as const;
export const syncIntervalSchema = z.union([z.literal(60), z.literal(360), z.literal(1440), z.null()]);

export const createIntegrationSchema = z.object({
  name: z.string().trim().min(2).max(80),
  source: sourceSchema,
  tables: z.array(tableSelectionSchema).min(1, "Selecione ao menos uma tabela/endpoint").max(200),
  syncIntervalMinutes: syncIntervalSchema.default(null),
});

export interface DiscoveredTable {
  schema: string;
  name: string;
  type?: "TABLE" | "VIEW" | "ENDPOINT";
}

export interface DiscoveredColumns extends DiscoveredTable {
  columns: ColumnMeta[];
  suggestedEntity: ImportTarget | null;
  suggestedMapping: ColumnMapping;
  suggestedIncremental: string | null;
}

export interface TestResult {
  ok: boolean;
  message: string;
  reason?: string;
  causes?: string[];
  code?: string;
  durationMs: number;
  tables: DiscoveredTable[];
  endpoints?: { path: string; status: number; ms: number; items: number }[];
}

const INCREMENTAL_HINTS = ["updated_at", "updatedat", "modified_at", "modifiedat", "last_modified", "data_alteracao", "dt_alteracao", "created_at", "createdat", "data_criacao"];

function suggestIncremental(columns: ColumnMeta[]): string | null {
  const byName = new Map(columns.map((c) => [c.name.toLowerCase(), c]));
  for (const h of INCREMENTAL_HINTS) {
    const c = byName.get(h);
    if (c && (c.kind === "date" || c.kind === "other")) return c.name;
  }
  const id = byName.get("id");
  return id && id.kind === "number" ? id.name : null;
}

function describe(t: DiscoveredTable, columns: ColumnMeta[]): DiscoveredColumns {
  const entity = suggestEntity(t.name);
  return { ...t, columns, suggestedEntity: entity, suggestedMapping: entity ? suggestMappingFromColumns(entity, columns) : {}, suggestedIncremental: suggestIncremental(columns) };
}

/** Segredos conhecidos da configuração — usados para limpar mensagens de erro. */
function secretsOf(source: SourceInput): string[] {
  const c = source.connection as Record<string, unknown>;
  const vals = [c.password, c.connectionString, c.apiKey, c.token].filter((v): v is string => typeof v === "string");
  if (source.kind === "rest-api") vals.push(...source.connection.headers.map((h) => h.value));
  return vals;
}

function sqlConfig(source: SourceInput): DbConnection {
  if (!isSqlKind(source.kind)) throw new AppError("Fonte não é um banco de dados.", 422);
  return normalizeConnection(source.kind, source.connection as z.infer<typeof dbConnectionSchema>);
}

function failure(f: FriendlyError, started: number): TestResult {
  return { ok: false, message: f.message, reason: f.reason, causes: f.causes, code: f.code, durationMs: Date.now() - started, tables: [] };
}

/** Testa a conexão e lista tabelas/views (ou endpoints). Nunca lança: devolve mensagem amigável. */
export async function testSource(source: SourceInput): Promise<TestResult> {
  const started = Date.now();
  try {
    if (source.kind === "rest-api") {
      const endpoints: NonNullable<TestResult["endpoints"]> = [];
      for (const ep of source.endpoints) {
        const r = await restGet(source.connection, ep.path);
        endpoints.push({ path: ep.path, status: r.status, ms: r.ms, items: extractItems(r.body, ep.dataPath || null).length });
      }
      const ok = endpoints.every((e) => e.status >= 200 && e.status < 300);
      const bad = endpoints.find((e) => !(e.status >= 200 && e.status < 300));
      return {
        ok,
        message: ok ? "Conexão realizada com sucesso." : "Não foi possível acessar a API.",
        reason: bad ? `O endpoint ${bad.path} respondeu HTTP ${bad.status}.${bad.status === 401 || bad.status === 403 ? " Verifique a autenticação." : ""}` : undefined,
        causes: bad ? (bad.status === 401 || bad.status === 403 ? ["credenciais inválidas"] : ["endpoint incorreto", "API indisponível"]) : undefined,
        durationMs: Date.now() - started,
        tables: source.endpoints.map((e) => ({ schema: e.dataPath, name: e.path, type: "ENDPOINT" as const })),
        endpoints,
      };
    }
    const cfg = sqlConfig(source);
    const tables = await withSqlSession(source.kind, cfg, (s) => s.listTables());
    return { ok: true, message: "Conexão realizada com sucesso.", durationMs: Date.now() - started, tables: tables.slice(0, LIMITS.maxTables) };
  } catch (err) {
    return failure(friendlyError(err, secretsOf(source)), started);
  }
}

/** Lê metadados das colunas das tabelas escolhidas (ou amostra dos endpoints) e sugere mapeamento. */
export async function discoverColumns(source: SourceInput, tables: DiscoveredTable[]): Promise<DiscoveredColumns[]> {
  if (tables.length > 200) throw new AppError("Selecione no máximo 200 tabelas por vez.", 422);
  try {
    if (source.kind === "rest-api") {
      const out: DiscoveredColumns[] = [];
      for (const ep of source.endpoints.filter((e) => tables.some((t) => t.name === e.path))) {
        out.push(describe({ schema: ep.dataPath, name: ep.path, type: "ENDPOINT" }, await endpointFields(source.connection, ep.path, ep.dataPath)));
      }
      return out;
    }
    const cfg = sqlConfig(source);
    return await withSqlSession(source.kind, cfg, async (s) => {
      const known = await s.listTables();
      const refs = tables.map((t) => {
        const k = known.find((x) => x.schema === t.schema && x.name === t.name);
        if (!k) throw new AppError(`A tabela ${tableKey(t)} não existe na fonte.`, 422);
        return k;
      });
      const cols = await s.listColumns(refs);
      return refs.map((r) => describe({ schema: r.schema, name: r.name, type: r.type }, cols.get(tableKey(r)) ?? []));
    });
  } catch (err) {
    if (err instanceof AppError) throw err;
    const f = friendlyError(err, secretsOf(source));
    throw new AppError(`${f.message} ${f.reason}`, 422);
  }
}

async function endpointFields(cfg: RestConnection, path: string, dataPath: string): Promise<ColumnMeta[]> {
  const r = await restGet(cfg, path);
  if (r.status < 200 || r.status >= 300) throw new AppError(`O endpoint ${path} respondeu HTTP ${r.status}.`, 422);
  return describeFields(extractItems(r.body, dataPath || null)).map((f) => ({ name: f.name, type: f.type, kind: f.kind }));
}

/** Valida seleção contra os metadados descobertos: tabela existe, colunas existem, campos obrigatórios mapeados. */
export function validateSelection(sel: TableSelection, columns: ColumnMeta[]): string[] {
  const errors: string[] = [];
  const names = new Set(columns.map((c) => c.name));
  const label = sel.schema && !sel.name.startsWith("/") ? `${sel.schema}.${sel.name}` : sel.name;
  if (!sel.enabled) return errors;
  if (!sel.entity) {
    errors.push(`${label}: escolha o tipo de dado (Clientes, Vendas, ...).`);
    return errors;
  }
  const fields = TARGET_FIELDS[sel.entity];
  for (const [field, col] of Object.entries(sel.mapping)) {
    if (!fields.some((f) => f.key === field)) errors.push(`${label}: campo "${field}" desconhecido.`);
    if (col && !names.has(col)) errors.push(`${label}: a coluna "${col}" não existe na fonte.`);
  }
  for (const f of fields) if (f.required && !sel.mapping[f.key]) errors.push(`${label}: o campo obrigatório "${f.label}" não foi mapeado.`);
  if (sel.incrementalColumn && !names.has(sel.incrementalColumn)) errors.push(`${label}: a coluna incremental "${sel.incrementalColumn}" não existe.`);
  return errors;
}

function cleanMapping(sel: TableSelection): ColumnMapping {
  return Object.fromEntries(Object.entries(sel.mapping).filter(([, v]) => Boolean(v)));
}

/** Informações NÃO sensíveis exibidas na tela (nunca senha, token ou connection string). */
export function displayConfig(source: SourceInput): Record<string, unknown> {
  if (source.kind === "rest-api") {
    const c = source.connection;
    return { kind: source.kind, baseUrl: c.baseUrl, authType: c.authType, apiKeyHeader: c.authType === "API_KEY" ? c.apiKeyHeader : undefined, username: c.authType === "BASIC_AUTH" ? c.username : undefined, headerNames: c.headers.map((h) => h.name) };
  }
  const cfg = sqlConfig(source);
  return { kind: source.kind, host: cfg.host, port: cfg.port, database: cfg.database, username: cfg.username, ssl: cfg.ssl, encrypt: cfg.encrypt, trustServerCertificate: cfg.trustServerCertificate };
}

/** Configuração a cifrar: bancos guardam os campos já normalizados (a connection string original é descartada). */
function sealedConnection(source: SourceInput): string {
  if (source.kind === "rest-api") return JSON.stringify(source.connection);
  const cfg = sqlConfig(source);
  return JSON.stringify({ host: cfg.host, port: cfg.port, database: cfg.database, username: cfg.username, password: cfg.password, ssl: cfg.ssl, sslRejectUnauthorized: cfg.sslRejectUnauthorized, encrypt: cfg.encrypt, trustServerCertificate: cfg.trustServerCertificate });
}

const PROVIDER_LABEL: Record<ExternalKind, string> = { postgresql: "PostgreSQL", mysql: "MySQL", sqlserver: "SQL Server", "rest-api": "API REST" };

/**
 * Cria integração externa: testa de novo no servidor (nunca confia no teste do navegador), valida
 * tabelas/colunas contra os metadados reais, cifra a conexão e registra auditoria.
 */
export async function createExternalIntegration(actor: AuditActor & { tenantId: string }, input: z.infer<typeof createIntegrationSchema>) {
  const { source } = input;
  const test = await testSource(source);
  await audit(actor, { action: "integration.tested", resource: "integration", result: test.ok ? "SUCCESS" : "FAILURE", metadata: { provider: source.kind, stage: "create", code: test.code ?? null } });
  if (!test.ok) throw new AppError(`${test.message}${test.reason ? ` ${test.reason}` : ""} A integração não foi salva.`, 422);

  const discovered = await discoverColumns(source, input.tables.map((t) => ({ schema: t.schema, name: t.name })));
  const errors: string[] = [];
  for (const sel of input.tables) {
    const d = discovered.find((x) => x.schema === sel.schema && x.name === sel.name);
    if (!d) errors.push(`${sel.name}: não encontrada na fonte.`);
    else errors.push(...validateSelection(sel, d.columns));
  }
  if (errors.length) throw new AppError(errors.slice(0, 8).join(" "), 422);

  const interval = input.syncIntervalMinutes;
  const integration = await prisma.integration.create({
    data: {
      tenantId: actor.tenantId,
      name: sanitizeText(input.name, 80),
      type: source.kind === "rest-api" ? "API" : "DATABASE",
      provider: source.kind,
      status: "CONNECTED",
      isMock: false,
      config: displayConfig(source) as Prisma.InputJsonValue,
      syncIntervalMinutes: interval,
      nextSyncAt: interval ? new Date(Date.now() + interval * 60_000) : null,
      tables: {
        create: input.tables.map((sel) => {
          const d = discovered.find((x) => x.schema === sel.schema && x.name === sel.name)!;
          return {
            tenantId: actor.tenantId,
            schemaName: sel.schema,
            tableName: sel.name,
            enabled: sel.enabled,
            entity: sel.entity,
            mapping: cleanMapping(sel) as Prisma.InputJsonValue,
            columns: d.columns as unknown as Prisma.InputJsonValue,
            incrementalColumn: sel.incrementalColumn,
          };
        }),
      },
    },
  });
  await storeCredentials(actor.tenantId, integration.id, { connection: sealedConnection(source) });
  await ensureDataSource(actor.tenantId, integration.name, "INTEGRATION", integration.id, `Integração ${PROVIDER_LABEL[source.kind]}`).catch(() => undefined);
  await audit(actor, { action: "integration.created", resource: "integration", resourceId: integration.id, metadata: { provider: source.kind, tables: input.tables.length, syncIntervalMinutes: interval } });
  return integration;
}

/** Monta a fonte a partir da conexão cifrada (uso interno do servidor). */
export async function storedSource(tenantId: string, integrationId: string): Promise<SourceInput> {
  const integration = await prisma.integration.findFirst({ where: { id: integrationId, tenantId }, include: { tables: true } });
  if (!integration) throw new NotFoundError("Integração não encontrada.");
  const creds = await loadCredentials(tenantId, integrationId);
  if (!creds.connection) throw new AppError("Esta integração não possui conexão configurada.", 422);
  const raw = JSON.parse(creds.connection) as Record<string, unknown>;
  if (integration.provider === "rest-api") {
    return { kind: "rest-api", connection: restConnectionSchema.parse(raw), endpoints: integration.tables.map((t) => ({ path: t.tableName, dataPath: t.schemaName })) };
  }
  if (!isSqlKind(integration.provider)) throw new AppError("Tipo de integração não suportado.", 422);
  return { kind: integration.provider, connection: dbConnectionSchema.parse(raw) } as SourceInput;
}

/**
 * Atualiza a conexão ("Configurar"). Campos secretos vazios mantêm o valor atual — assim o
 * frontend nunca precisa (nem consegue) ler a senha/token salvos.
 */
export async function updateExternalConnection(actor: AuditActor & { tenantId: string }, integrationId: string, patch: Record<string, unknown>) {
  const current = await storedSource(actor.tenantId, integrationId);
  const merged: Record<string, unknown> = { ...(current.connection as Record<string, unknown>) };
  for (const [k, v] of Object.entries(patch)) {
    if (["password", "apiKey", "token"].includes(k) && (v === "" || v === undefined || v === null)) continue;
    if (k === "headers" && Array.isArray(v)) {
      const old = (current.kind === "rest-api" ? current.connection.headers : []) as { name: string; value: string }[];
      merged.headers = (v as { name: string; value?: string }[]).map((h) => ({ name: h.name, value: h.value || old.find((o) => o.name === h.name)?.value || "" }));
      continue;
    }
    if (k === "connectionString") continue; // após salvo, a conexão é editada por campos
    merged[k] = v;
  }
  const source = sourceSchema.parse(current.kind === "rest-api" ? { kind: current.kind, connection: merged, endpoints: current.endpoints } : { kind: current.kind, connection: merged });
  const test = await testSource(source);
  await audit(actor, { action: "integration.tested", resource: "integration", resourceId: integrationId, result: test.ok ? "SUCCESS" : "FAILURE", metadata: { stage: "update", code: test.code ?? null } });
  if (!test.ok) throw new AppError(`${test.message}${test.reason ? ` ${test.reason}` : ""} A conexão não foi alterada.`, 422);
  await storeCredentials(actor.tenantId, integrationId, { connection: sealedConnection(source) });
  await prisma.integration.update({ where: { id: integrationId }, data: { config: displayConfig(source) as Prisma.InputJsonValue, status: "CONNECTED", lastError: null } });
  await audit(actor, { action: "integration.updated", resource: "integration", resourceId: integrationId, metadata: { connectionChanged: true } });
  return test;
}

/** Adiciona tabelas/endpoints a uma integração existente, validando contra a fonte. */
export async function addTables(actor: AuditActor & { tenantId: string }, integrationId: string, selections: TableSelection[], newEndpoints: { path: string; dataPath: string }[] = []) {
  let source = await storedSource(actor.tenantId, integrationId);
  if (source.kind === "rest-api" && newEndpoints.length) source = { ...source, endpoints: [...source.endpoints, ...newEndpoints] };
  const discovered = await discoverColumns(source, selections.map((s) => ({ schema: s.schema, name: s.name })));
  const errors: string[] = [];
  for (const sel of selections) {
    const d = discovered.find((x) => x.schema === sel.schema && x.name === sel.name);
    if (!d) errors.push(`${sel.name}: não encontrada na fonte.`);
    else errors.push(...validateSelection(sel, d.columns));
  }
  if (errors.length) throw new AppError(errors.slice(0, 8).join(" "), 422);
  for (const sel of selections) {
    const d = discovered.find((x) => x.schema === sel.schema && x.name === sel.name)!;
    const data = { enabled: sel.enabled, entity: sel.entity, mapping: cleanMapping(sel) as Prisma.InputJsonValue, columns: d.columns as unknown as Prisma.InputJsonValue, incrementalColumn: sel.incrementalColumn };
    await prisma.integrationTable.upsert({
      where: { integrationId_schemaName_tableName: { integrationId, schemaName: sel.schema, tableName: sel.name } },
      create: { tenantId: actor.tenantId, integrationId, schemaName: sel.schema, tableName: sel.name, ...data },
      update: data,
    });
  }
  await audit(actor, { action: "integration.updated", resource: "integration", resourceId: integrationId, metadata: { tablesAdded: selections.length } });
}
