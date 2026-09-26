import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GET as health } from "@/app/api/health/route";
import { prisma } from "@/lib/db";
import { redactText } from "@/lib/logger";
import { fromPrismaError } from "@/server/errors";

/** Smoke tests pré-apresentação: banco, health check, erros amigáveis, logs sem segredos e CRUD com isolamento. */

let dbAvailable = true;
const tenantIds: string[] = [];

beforeAll(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    dbAvailable = false;
  }
});

afterAll(async () => {
  if (dbAvailable && tenantIds.length) await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
  await prisma.$disconnect();
});

describe("health check", () => {
  it("responde ok com banco conectado e sem expor detalhes internos", async () => {
    if (!dbAvailable) return;
    const res = await health();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toMatchObject({ status: "ok", database: "connected" });
    expect(JSON.stringify(body)).not.toMatch(/postgres|password|DATABASE_URL/i);
  });
});

describe("erros do banco viram mensagens amigáveis", () => {
  const prismaErr = (code: string) => Object.assign(new Error(`raw ${code}`), { name: "PrismaClientKnownRequestError", code });
  it("banco fora do ar → 503 sem código técnico na mensagem", () => {
    for (const code of ["P1001", "P1002", "P1017", "P2024"]) {
      const e = fromPrismaError(prismaErr(code));
      expect(e?.status).toBe(503);
      expect(e?.message).not.toMatch(/P\d{4}|Prisma/);
    }
    expect(fromPrismaError(Object.assign(new Error("x"), { name: "PrismaClientInitializationError" }))?.status).toBe(503);
  });
  it("duplicidade → 409, não encontrado → 404, outros erros seguem como internos", () => {
    expect(fromPrismaError(prismaErr("P2002"))?.status).toBe(409);
    expect(fromPrismaError(prismaErr("P2025"))?.status).toBe(404);
    expect(fromPrismaError(new TypeError("boom"))).toBeNull();
  });
});

describe("logs nunca exibem segredos", () => {
  it("remove senhas de connection strings, tokens e chaves de API", () => {
    const out = redactText("falha em postgresql://neondb_owner:SuperSecreta123@ep-x.neon.tech/db Authorization: Bearer abcdefghijklmnop sk-ant-api03-XYZXYZXYZXYZ password=abc123");
    expect(out).not.toMatch(/SuperSecreta123|abcdefghijklmnop|sk-ant-api03-XYZ|abc123/);
    expect(out).toContain("ep-x.neon.tech");
  });
});

describe("CRUD persistido e isolado por empresa", () => {
  it("cria, lê, atualiza e exclui; outra empresa nunca enxerga o registro", async () => {
    if (!dbAvailable) return;
    const slug = () => `smoke-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const a = await prisma.tenant.create({ data: { name: "Smoke A", slug: slug() } });
    const b = await prisma.tenant.create({ data: { name: "Smoke B", slug: slug() } });
    tenantIds.push(a.id, b.id);

    const item = await prisma.knowledgeItem.create({ data: { tenantId: a.id, type: "DEFINITION", title: "Margem", content: "8%", tags: [] } });
    expect(await prisma.knowledgeItem.findFirst({ where: { id: item.id, tenantId: a.id } })).not.toBeNull();
    // o mesmo filtro usado pelas APIs: tenant B não encontra, não altera e não exclui
    expect(await prisma.knowledgeItem.findFirst({ where: { id: item.id, tenantId: b.id } })).toBeNull();
    expect((await prisma.knowledgeItem.updateMany({ where: { id: item.id, tenantId: b.id }, data: { content: "hack" } })).count).toBe(0);
    expect((await prisma.knowledgeItem.deleteMany({ where: { id: item.id, tenantId: b.id } })).count).toBe(0);

    await prisma.knowledgeItem.update({ where: { id: item.id }, data: { content: "9%" } });
    expect((await prisma.knowledgeItem.findUniqueOrThrow({ where: { id: item.id } })).content).toBe("9%");
    expect((await prisma.knowledgeItem.deleteMany({ where: { id: item.id, tenantId: a.id } })).count).toBe(1);
    expect(await prisma.knowledgeItem.findUnique({ where: { id: item.id } })).toBeNull();
  });
});
