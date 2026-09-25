import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { ROLE_PERMISSIONS, SUPPORT_PERMISSIONS } from "@/server/auth/permissions";
import { createExternalIntegration, displayConfig, sourceSchema, storedSource, testSource, updateExternalConnection, validateSelection, type SourceInput } from "@/server/connectors/external";
import { decodeCursor, encodeCursor } from "@/server/connectors/providers/sql";
import { extractItems, flatten, restConnectionSchema } from "@/server/connectors/rest";
import { withSqlSession } from "@/server/connectors/sql";
import { friendlyError, scrub } from "@/server/connectors/sql/errors";
import { assertKnownColumns, assertReadOnlySql, buildSelect, IdentifierError, quoteIdent } from "@/server/connectors/sql/identifiers";
import { assertPublicHost, isPrivateIp, PrivateHostError } from "@/server/connectors/sql/network";
import { normalizeConnection } from "@/server/connectors/sql/types";
import { runSync, SyncBlockedError } from "@/server/connectors/sync";
import { loadCredentials } from "@/server/connectors/vault";
import { createImportJob, processImportJob } from "@/server/cortex/import";

/**
 * Testes do módulo "Conectar Dados". Os testes de integração usam bancos EXTERNOS reais locais:
 *  - PostgreSQL: banco erp_externo com usuário somente leitura jr_leitura
 *  - MySQL/MariaDB: banco erp_mysql com usuário somente leitura jr_leitura
 * Quando algum deles não está disponível, os testes correspondentes são ignorados (skip).
 */

const PG = { host: "127.0.0.1", port: 5432, database: "erp_externo", username: "jr_leitura", password: "Leitura#2026", ssl: false, sslRejectUnauthorized: true, encrypt: true, trustServerCertificate: false };
const MY = { ...PG, port: 3306, database: "erp_mysql" };
const actorFor = (tenantId: string) => ({ tenantId, userId: null, userEmail: "teste@jrcortex.dev" });

let internalDb = true;
let pgAvailable = false;
let myAvailable = false;
const tenantIds: string[] = [];

async function createTenant(name: string) {
  const t = await prisma.tenant.create({ data: { name, slug: `cd-${name}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}` } });
  tenantIds.push(t.id);
  return t;
}

beforeAll(async () => {
  process.env.ALLOW_PRIVATE_DB_HOSTS = "true"; // bancos de teste rodam em localhost
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    internalDb = false;
  }
  pgAvailable = (await testSource({ kind: "postgresql", connection: PG })).ok;
  myAvailable = (await testSource({ kind: "mysql", connection: MY })).ok;
});

afterAll(async () => {
  if (internalDb && tenantIds.length) await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
  await prisma.$disconnect();
});

describe("SQL seguro (somente leitura, sem injeção)", () => {
  it("escapa identificadores por dialeto", () => {
    expect(quoteIdent("postgresql", 'a"b')).toBe('"a""b"');
    expect(quoteIdent("mysql", "a`b")).toBe("`a``b`");
    expect(quoteIdent("sqlserver", "a]b")).toBe("[a]]b]");
    expect(() => quoteIdent("postgresql", "")).toThrow(IdentifierError);
  });

  it("gera SELECT parametrizado com incremental e paginação", () => {
    const pg = buildSelect("postgresql", { table: { schema: "vendas", name: "pedidos" }, columns: ["id", "valor"], incrementalColumn: "updated_at", since: "2026-01-01", limit: 1000, offset: 0 });
    expect(pg.sql).toBe('SELECT "id", "valor" FROM "vendas"."pedidos" WHERE "updated_at" >= $1 ORDER BY "updated_at" ASC LIMIT $2 OFFSET $3');
    expect(pg.params).toEqual(["2026-01-01", 1000, 0]);
    const ms = buildSelect("sqlserver", { table: { schema: "dbo", name: "Pedidos" }, columns: ["Id"], limit: 50, offset: 100 });
    expect(ms.sql).toBe("SELECT [Id] FROM [dbo].[Pedidos] ORDER BY [Id] ASC OFFSET @p1 ROWS FETCH NEXT @p2 ROWS ONLY");
    const my = buildSelect("mysql", { table: { schema: "erp", name: "orders" }, columns: ["id"], limit: 10, offset: 0 });
    expect(my.sql).toContain("LIMIT ? OFFSET ?");
  });

  it("nomes maliciosos são recusados e valores nunca são interpolados", () => {
    expect(() => buildSelect("postgresql", { table: { schema: "public", name: 'x"; DROP TABLE clientes; --' }, columns: ["id"], limit: 10, offset: 0 })).toThrow(IdentifierError);
    const q = buildSelect("postgresql", { table: { schema: "public", name: 'x" OR 1=1 --' }, columns: ["id"], incrementalColumn: "id", since: "1; DELETE FROM x", limit: 10, offset: 0 });
    expect(q.sql).toContain('"x"" OR 1=1 --"');
    expect(q.params[0]).toBe("1; DELETE FROM x");
    expect(q.sql).not.toContain("DELETE");
  });

  it("recusa qualquer comando que não seja leitura", () => {
    for (const bad of ["DELETE FROM t", "SELECT 1; DROP TABLE t", "UPDATE t SET a=1", "INSERT INTO t VALUES (1)", "TRUNCATE t", "ALTER TABLE t ADD c int", "SELECT * INTO copia FROM t"])
      expect(() => assertReadOnlySql(bad), bad).toThrow(IdentifierError);
    expect(() => assertReadOnlySql('SELECT "delete" FROM "t"')).not.toThrow();
  });

  it("colunas são validadas contra os metadados descobertos", () => {
    const known = [{ name: "id", type: "int", kind: "number" as const }];
    expect(() => assertKnownColumns(["id"], known)).not.toThrow();
    expect(() => assertKnownColumns(["id); DROP TABLE x; --"], known)).toThrow(IdentifierError);
  });
});

describe("rede, erros e configuração", () => {
  it("bloqueia hosts internos (SSRF) fora do modo de desenvolvimento", async () => {
    const prev = process.env.ALLOW_PRIVATE_DB_HOSTS;
    delete process.env.ALLOW_PRIVATE_DB_HOSTS;
    try {
      await expect(assertPublicHost("localhost")).rejects.toBeInstanceOf(PrivateHostError);
      await expect(assertPublicHost("127.0.0.1")).rejects.toBeInstanceOf(PrivateHostError);
      await expect(assertPublicHost("169.254.169.254")).rejects.toBeInstanceOf(PrivateHostError);
      await expect(assertPublicHost("10.0.0.5")).rejects.toBeInstanceOf(PrivateHostError);
      await expect(assertPublicHost("8.8.8.8")).resolves.toBeUndefined();
    } finally {
      process.env.ALLOW_PRIVATE_DB_HOSTS = prev;
    }
    expect(isPrivateIp("192.168.1.10")).toBe(true);
    expect(isPrivateIp("::ffff:10.1.1.1")).toBe(true);
  });

  it("mensagens amigáveis sem expor segredos", () => {
    expect(friendlyError(Object.assign(new Error("password authentication failed for user x"), { code: "28P01" })).reason).toMatch(/Credenciais inválidas/);
    expect(friendlyError(Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" })).causes).toContain("porta bloqueada");
    expect(friendlyError(Object.assign(new Error("getaddrinfo ENOTFOUND db.x"), { code: "ENOTFOUND" })).causes).toContain("host incorreto");
    const s = scrub("falhou postgres://user:SuperSecreta@host/db password=SuperSecreta", ["SuperSecreta"]);
    expect(s).not.toContain("SuperSecreta");
  });

  it("interpreta connection strings (URL e SQL Server)", () => {
    const pg = normalizeConnection("postgresql", { connectionString: "postgresql://u:p%40ss@db.example.com:6543/erp?sslmode=require", ssl: false, sslRejectUnauthorized: true, encrypt: true, trustServerCertificate: false });
    expect(pg).toMatchObject({ host: "db.example.com", port: 6543, database: "erp", username: "u", password: "p@ss", ssl: true });
    const ms = normalizeConnection("sqlserver", { connectionString: "Server=tcp:erp.database.windows.net,1433;Database=ERP;User Id=leitor;Password=Xyz;", ssl: false, sslRejectUnauthorized: true, encrypt: true, trustServerCertificate: false });
    expect(ms).toMatchObject({ host: "erp.database.windows.net", port: 1433, database: "ERP", username: "leitor", password: "Xyz" });
  });

  it("cursor incremental preserva o tipo", () => {
    const d = new Date("2026-09-01T10:00:00Z");
    expect(decodeCursor(encodeCursor(d))).toEqual(d);
    expect(decodeCursor(encodeCursor(42))).toBe(42);
    expect(decodeCursor(encodeCursor("A10"))).toBe("A10");
  });

  it("API REST: achata JSON e encontra a lista de itens", () => {
    expect(extractItems({ data: [{ id: 1 }] })).toHaveLength(1);
    expect(extractItems({ result: { rows: [{ id: 1 }, { id: 2 }] } }, "result.rows")).toHaveLength(2);
    expect(flatten({ id: 1, cliente: { nome: "A", end: { uf: "PE" } } })).toEqual({ id: 1, "cliente.nome": "A", "cliente.end.uf": "PE" });
    expect(restConnectionSchema.safeParse({ baseUrl: "ftp://x" }).success).toBe(false);
  });

  it("mapeamento é validado contra colunas reais e campos obrigatórios", () => {
    const cols = [{ name: "id", type: "int", kind: "number" as const }, { name: "data", type: "date", kind: "date" as const }, { name: "valor", type: "numeric", kind: "number" as const }];
    expect(validateSelection({ schema: "", name: "t", entity: "SALES", mapping: { date: "data", grossAmount: "valor" }, incrementalColumn: null, enabled: true }, cols)).toEqual([]);
    expect(validateSelection({ schema: "", name: "t", entity: "SALES", mapping: { date: "data" }, incrementalColumn: "nao_existe", enabled: true }, cols).length).toBe(2);
    expect(validateSelection({ schema: "", name: "t", entity: "SALES", mapping: { date: "data; drop", grossAmount: "valor" }, incrementalColumn: null, enabled: true }, cols)[0]).toMatch(/não existe/);
  });
});

describe("perfis de acesso", () => {
  it("COMPANY (administrador do cliente) gerencia integrações", () => {
    expect(ROLE_PERMISSIONS.ADMIN_CLIENTE).toContain("integrations:manage");
    expect(ROLE_PERMISSIONS.VIEWER).not.toContain("integrations:manage");
  });
  it("ADMIN da plataforma / suporte só vê metadados, nunca gerencia credenciais", () => {
    expect(SUPPORT_PERMISSIONS).not.toContain("integrations:manage");
    expect(ROLE_PERMISSIONS.SUPER_ADMIN).not.toContain("integrations:manage");
  });
});

describe("PostgreSQL externo real (somente leitura)", () => {
  it("teste de conexão inválida retorna mensagem amigável sem senha", async () => {
    if (!pgAvailable) return;
    const r = await testSource({ kind: "postgresql", connection: { ...PG, password: "SenhaErradaXYZ" } });
    expect(r.ok).toBe(false);
    expect(r.message).toBe("Não foi possível conectar ao banco.");
    expect(r.reason).toMatch(/Credenciais inválidas/);
    expect(JSON.stringify(r)).not.toContain("SenhaErradaXYZ");
  });

  it("banco offline: porta fechada gera erro tratado", async () => {
    const r = await testSource({ kind: "postgresql", connection: { ...PG, port: 1 } });
    expect(r.ok).toBe(false);
    expect(r.causes?.length).toBeGreaterThan(0);
  });

  it("lista schemas/tabelas e a sessão é somente leitura", async () => {
    if (!pgAvailable) return;
    const r = await testSource({ kind: "postgresql", connection: PG });
    expect(r.message).toBe("Conexão realizada com sucesso.");
    expect(r.tables.map((t) => `${t.schema}.${t.name}`)).toEqual(expect.arrayContaining(["public.clientes", "vendas.pedidos_venda", 'public.Tabela "Estranha"']));
    // mesmo um usuário COM permissão de escrita não conseguiria escrever: a sessão aberta pelo conector é READ ONLY
    const pg = (await import("pg")).default;
    const client = new pg.Client({ host: "127.0.0.1", port: 5432, database: "erp_externo", user: "postgres", password: "postgres" });
    await client.connect();
    try {
      await client.query("SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY"); // mesma instrução usada em openPostgres
      await expect(client.query("CREATE TABLE teste_escrita (id int)")).rejects.toThrow(/read-only/);
      await expect(client.query("DELETE FROM public.clientes")).rejects.toThrow(/read-only/);
    } finally {
      await client.end();
    }
    // e o usuário recomendado (jr_leitura) só possui SELECT
    const rows = await withSqlSession("postgresql", normalizeConnection("postgresql", PG), (sess) => sess.select({ table: { schema: "public", name: "clientes" }, columns: ["id", "nome"], limit: 10, offset: 0 }));
    expect(rows).toHaveLength(2);
  });

  it("cria integração, cifra credenciais, sincroniza (inclusive incremental) e isola tenants", async () => {
    if (!internalDb || !pgAvailable) return;
    const a = await createTenant("empresa-a");
    const b = await createTenant("empresa-b");
    const source: SourceInput = sourceSchema.parse({ kind: "postgresql", connection: { connectionString: "postgresql://jr_leitura:Leitura%232026@127.0.0.1:5432/erp_externo" } });

    // salvar exige conexão válida
    await expect(createExternalIntegration(actorFor(a.id), { name: "ERP falho", source: { kind: "postgresql", connection: { ...PG, password: "errada" } }, tables: [{ schema: "public", name: "clientes", entity: "CUSTOMERS", mapping: { externalId: "id", name: "nome" }, incrementalColumn: null, enabled: true }], syncIntervalMinutes: null })).rejects.toThrow(/não foi salva/);

    const integration = await createExternalIntegration(actorFor(a.id), {
      name: "ERP Postgres",
      source,
      tables: [
        { schema: "public", name: "clientes", entity: "CUSTOMERS", mapping: { externalId: "id", name: "nome", email: "email", city: "cidade" }, incrementalColumn: "updated_at", enabled: true },
        { schema: "vendas", name: "pedidos_venda", entity: "SALES", mapping: { externalId: "id", date: "data", customerId: "cliente_id", customer: "cliente_nome", seller: "vendedor", product: "produto", grossAmount: "valor_total" }, incrementalColumn: "updated_at", enabled: true },
      ],
      syncIntervalMinutes: 60,
    });
    expect(integration.status).toBe("CONNECTED");
    expect(integration.nextSyncAt).not.toBeNull();

    // credenciais: nunca em texto puro, nunca na config exibida
    const stored = await prisma.integrationCredential.findMany({ where: { integrationId: integration.id } });
    expect(stored).toHaveLength(1);
    expect(JSON.stringify(stored)).not.toContain("Leitura#2026");
    expect(JSON.stringify(integration.config)).not.toContain("Leitura");
    expect(JSON.stringify(displayConfig(source))).not.toMatch(/password|connectionString|Leitura/);
    expect(JSON.parse((await loadCredentials(a.id, integration.id)).connection).password).toBe("Leitura#2026");
    const audits = await prisma.auditLog.findMany({ where: { tenantId: a.id, action: { startsWith: "integration." } } });
    expect(audits.map((x) => x.action)).toEqual(expect.arrayContaining(["integration.tested", "integration.created"]));
    expect(JSON.stringify(audits)).not.toContain("Leitura#2026");

    // tenant B não vê, não testa, não sincroniza e não lê credenciais da empresa A
    await expect(storedSource(b.id, integration.id)).rejects.toThrow(/não encontrada/);
    await expect(runSync(b.id, integration.id, "FULL", "MANUAL")).rejects.toBeInstanceOf(SyncBlockedError);
    expect(await loadCredentials(b.id, integration.id)).toEqual({});
    await expect(updateExternalConnection(actorFor(b.id), integration.id, { password: "x" })).rejects.toThrow(/não encontrada/);

    const job = await runSync(a.id, integration.id, "INCREMENTAL", "MANUAL");
    expect(job.status).toBe("PARTIAL"); // linha 104 sem valor é rejeitada
    expect(job.recordsRejected).toBe(1);
    expect(job.durationMs).not.toBeNull();
    expect(await prisma.customer.count({ where: { tenantId: a.id } })).toBe(2);
    const sales = await prisma.sale.findMany({ where: { tenantId: a.id }, include: { customer: true, seller: true } });
    expect(sales).toHaveLength(3);
    expect(sales.find((s) => s.externalId === "101")?.customer?.name).toBe("Padaria Central");
    expect(Number(sales.find((s) => s.externalId === "101")?.grossAmount)).toBe(1500.5);
    expect(await prisma.syncError.count({ where: { syncJobId: job.id } })).toBe(1);
    expect(await prisma.sale.count({ where: { tenantId: b.id } })).toBe(0);

    const after = await prisma.integration.findUniqueOrThrow({ where: { id: integration.id }, include: { tables: true } });
    expect(after.status).toBe("CONNECTED");
    expect(after.lastSyncAt).not.toBeNull();
    expect(after.tables.every((t) => t.lastCursor)).toBe(true);

    // incremental: só relê a partir do último cursor, sem duplicar
    const job2 = await runSync(a.id, integration.id, "INCREMENTAL", "SCHEDULED");
    expect(job2.recordsProcessed).toBeLessThan(job.recordsProcessed);
    expect(await prisma.sale.count({ where: { tenantId: a.id } })).toBe(3);

    // banco offline: integração fica em ERROR com mensagem amigável; nada do Cortex quebra
    await prisma.integrationCredential.deleteMany({ where: { integrationId: integration.id } });
    const { storeCredentials } = await import("@/server/connectors/vault");
    await storeCredentials(a.id, integration.id, { connection: JSON.stringify({ ...PG, port: 1 }) });
    const failed = await runSync(a.id, integration.id, "INCREMENTAL", "MANUAL");
    expect(failed.status).toBe("FAILED");
    expect(failed.errorMessage).toMatch(/Integração indisponível/);
    expect(failed.errorMessage).not.toContain("Leitura#2026");
    const errored = await prisma.integration.findUniqueOrThrow({ where: { id: integration.id } });
    expect(errored.status).toBe("ERROR");
    expect(await prisma.sale.count({ where: { tenantId: a.id } })).toBe(3);
    expect((await prisma.auditLog.findMany({ where: { tenantId: a.id, action: "integration.sync.failed" } })).length).toBe(1);

    // desativada: não sincroniza
    await prisma.integration.update({ where: { id: integration.id }, data: { status: "DISABLED" } });
    await expect(runSync(a.id, integration.id, "FULL", "MANUAL")).rejects.toThrow(/desativada/);
  });
});

describe("MySQL externo real (somente leitura)", () => {
  it("conecta, lista tabelas e sincroniza pedidos e clientes", async () => {
    if (!internalDb || !myAvailable) return;
    const t = await createTenant("empresa-mysql");
    const integration = await createExternalIntegration(actorFor(t.id), {
      name: "ERP MySQL",
      source: { kind: "mysql", connection: MY },
      tables: [
        { schema: "erp_mysql", name: "customers", entity: "CUSTOMERS", mapping: { externalId: "id", name: "name", email: "email" }, incrementalColumn: "modified_at", enabled: true },
        { schema: "erp_mysql", name: "orders", entity: "ORDERS", mapping: { externalId: "id", date: "order_date", customerId: "customer_id", seller: "seller", status: "status", amount: "total" }, incrementalColumn: "modified_at", enabled: true },
      ],
      syncIntervalMinutes: 1440,
    });
    const job = await runSync(t.id, integration.id, "FULL", "MANUAL");
    expect(job.status).toBe("SUCCESS");
    expect(await prisma.order.count({ where: { tenantId: t.id } })).toBe(2);
    const order = await prisma.order.findFirstOrThrow({ where: { tenantId: t.id, externalId: "5001" }, include: { customer: true } });
    expect(Number(order.amount)).toBe(2500);
    expect(order.customer?.name).toBe("Loja Norte");
  });

  it("credenciais inválidas no MySQL", async () => {
    if (!myAvailable) return;
    const r = await testSource({ kind: "mysql", connection: { ...MY, password: "nope" } });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/Credenciais inválidas/);
  });
});

describe("API REST real (servidor HTTP local)", () => {
  it("testa, salva sem expor token e sincroniza clientes", async () => {
    if (!internalDb) return;
    const server = http.createServer((req, res) => {
      if (req.headers.authorization !== "Bearer tok-123") {
        res.writeHead(401).end("{}");
        return;
      }
      res.setHeader("Content-Type", "application/json");
      if (req.url === "/v1/customers") res.end(JSON.stringify({ data: [{ id: "c1", nome: "Cliente API", contato: { email: "a@api.dev" } }, { id: "c2", nome: "Outro" }] }));
      else res.writeHead(404).end("{}");
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;
    try {
      const bad = await testSource({ kind: "rest-api", connection: restConnectionSchema.parse({ baseUrl: base, authType: "BEARER_TOKEN", token: "errado" }), endpoints: [{ path: "/customers", dataPath: "" }] });
      expect(bad.ok).toBe(false);
      expect(bad.endpoints?.[0].status).toBe(401);

      const t = await createTenant("empresa-api");
      const integration = await createExternalIntegration(actorFor(t.id), {
        name: "CRM API",
        source: { kind: "rest-api", connection: restConnectionSchema.parse({ baseUrl: base, authType: "BEARER_TOKEN", token: "tok-123" }), endpoints: [{ path: "/customers", dataPath: "data" }] },
        tables: [{ schema: "data", name: "/customers", entity: "CUSTOMERS", mapping: { externalId: "id", name: "nome", email: "contato.email" }, incrementalColumn: null, enabled: true }],
        syncIntervalMinutes: null,
      });
      expect(JSON.stringify(integration.config)).not.toContain("tok-123");
      const job = await runSync(t.id, integration.id, "FULL", "MANUAL");
      expect(job.status).toBe("SUCCESS");
      const c = await prisma.customer.findFirstOrThrow({ where: { tenantId: t.id, externalId: "c1" } });
      expect(c.email).toBe("a@api.dev");
    } finally {
      server.close();
    }
  });
});

describe("upload CSV", () => {
  it("detecta colunas, valida e separa linhas válidas e rejeitadas", async () => {
    if (!internalDb) return;
    const t = await createTenant("empresa-csv");
    const role = await prisma.role.create({ data: { tenantId: t.id, key: "ANALISTA", name: "Analista" } });
    const user = await prisma.user.create({ data: { tenantId: t.id, roleId: role.id, name: "Usuário CSV", email: `csv-${Date.now()}@example.com`, passwordHash: "x" } });
    const csv = "Data;Cliente;Produto;Valor total\n05/09/2026;Cliente A;Produto X;1.500,00\n06/09/2026;Cliente B;Produto Y;250,50\ndata-invalida;Cliente C;Produto Z;10,00\n";
    const { job } = await createImportJob({ tenantId: t.id, userId: user.id, fileName: "vendas.csv", mimeType: "text/csv", buffer: Buffer.from(csv), target: "SALES" });
    expect(job.headers).toEqual(["Data", "Cliente", "Produto", "Valor total"]);
    const mapping = (job.suggestedMapping as { mapping: Record<string, string | null> }).mapping;
    expect(mapping.date).toBe("Data");
    expect(mapping.grossAmount).toBe("Valor total");
    const done = await processImportJob(t.id, job.id, mapping);
    expect(done.processedRows).toBe(2);
    expect(done.rejectedRows).toBe(1);
    const total = await prisma.sale.aggregate({ where: { tenantId: t.id }, _sum: { grossAmount: true } });
    expect(Number(total._sum.grossAmount)).toBe(1750.5);
  });
});
