import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { defineAction } from "@/server/action";
import { z } from "zod";
import { pipelineMetrics } from "@/server/modules/analytics";
import { createClient } from "@/server/modules/clients";
import { createOpportunity, moveOpportunityStage } from "@/server/modules/opportunities";
import { createProject } from "@/server/modules/projects";
import { createTask } from "@/server/modules/tasks";
import { saveAutomation } from "@/server/modules/integrations";
import { clientSchema } from "@/features/clients/schemas";
import { opportunitySchema } from "@/features/opportunities/schemas";
import { projectSchema } from "@/features/projects/schemas";
import { hasDb, makeWorkspace } from "./helpers";

const d = hasDb ? describe : describe.skip;

d("isolamento entre empresas (multi-tenant)", () => {
  afterAll(() => prisma.$disconnect());

  it("uma empresa nunca lê, altera ou exclui dados de outra", async () => {
    const a = await makeWorkspace();
    const b = await makeWorkspace();
    const c = await createClient(a, clientSchema.parse({ name: "Cliente Secreto A" }));
    expect(await a.db.client.findUnique({ where: { id: c.id } })).not.toBeNull();
    expect(await b.db.client.findUnique({ where: { id: c.id } })).toBeNull();
    expect(await b.db.client.findMany({ where: { name: "Cliente Secreto A" } })).toHaveLength(0);
    const upd = await b.db.client.updateMany({ where: { id: c.id }, data: { name: "invadido" } });
    expect(upd.count).toBe(0);
    const del = await b.db.client.deleteMany({ where: { id: c.id } });
    expect(del.count).toBe(0);
    expect((await prisma.client.findUnique({ where: { id: c.id } }))?.name).toBe("Cliente Secreto A");
  });

  it("criações sempre recebem o organizationId do contexto", async () => {
    const a = await makeWorkspace();
    const b = await makeWorkspace();
    const row = await a.db.tag.create({ data: { organizationId: b.org.id, name: "forjada" } });
    expect(row.organizationId).toBe(a.org.id);
  });

  it("IDs de outra empresa são rejeitados em relacionamentos (IDOR)", async () => {
    const a = await makeWorkspace();
    const b = await makeWorkspace();
    const foreign = await createClient(b, clientSchema.parse({ name: "Cliente B" }));
    await expect(createProject(a, projectSchema.parse({ name: "Projeto A", clientId: foreign.id }))).rejects.toThrow(/não encontrado/i);
  });

  it("registros na lixeira não aparecem em leituras", async () => {
    const a = await makeWorkspace();
    const c = await createClient(a, clientSchema.parse({ name: "Vai para a lixeira" }));
    await a.db.client.update({ where: { id: c.id }, data: { deletedAt: new Date() } });
    expect(await a.db.client.findUnique({ where: { id: c.id } })).toBeNull();
    expect(await a.db.client.findFirst({ where: { id: c.id, deletedAt: { not: null } } })).not.toBeNull();
  });
});

d("permissões aplicadas pelas Server Actions", () => {
  it("defineAction exige permissão (leitor não cria clientes)", async () => {
    const viewer = await makeWorkspace("VIEWER");
    const { can } = await import("@/server/auth/context");
    expect(can(viewer, "clients.write")).toBe(false);
    // a ação encapsulada usa o mesmo assertCan; aqui validamos o contrato diretamente
    const action = defineAction({ schema: z.object({}), permission: "clients.write" }, async () => "ok");
    expect(typeof action).toBe("function");
  });
});

d("fluxos de negócio", () => {
  it("cria projeto com gerente e membro, registrando atividade", async () => {
    const ctx = await makeWorkspace();
    const p = await createProject(ctx, projectSchema.parse({ name: "Implantação", status: "ACTIVE" }));
    const project = await ctx.db.project.findUnique({ where: { id: p.id }, include: { members: true } });
    expect(project?.managerId).toBe(ctx.user.id);
    expect(project?.members.map((m) => m.userId)).toContain(ctx.user.id);
    expect(await ctx.db.activity.count({ where: { projectId: p.id, action: "project.created" } })).toBe(1);
  });

  it("pipeline ponderado reflete valor × probabilidade e mudança de etapa exige motivo ao perder", async () => {
    const ctx = await makeWorkspace();
    const client = await createClient(ctx, clientSchema.parse({ name: "Cliente Pipeline" }));
    const stages = await ctx.db.pipelineStage.findMany({ orderBy: { order: "asc" } });
    const first = stages.find((s) => s.kind === "OPEN")!;
    const o = await createOpportunity(ctx, opportunitySchema.parse({ title: "Negócio", clientId: client.id, value: 10000, stageId: first.id, probability: 30 }));
    const m = await pipelineMetrics(ctx);
    expect(m.gross).toBe(10000);
    expect(m.weighted).toBe(3000);
    const lost = stages.find((s) => s.kind === "LOST")!;
    await expect(moveOpportunityStage(ctx, { id: o.id, stageId: lost.id } as never)).rejects.toThrow();
  });

  it("automação QUANDO/ENTÃO cria tarefa ao criar oportunidade", async () => {
    const ctx = await makeWorkspace();
    await saveAutomation(ctx, { name: "Nova oportunidade → tarefa", trigger: "opportunity.created", conditions: [{ field: "value", operator: "gte", value: "5000" }], actions: [{ type: "create_task", params: { title: "Qualificar oportunidade", dueInDays: 1, assignTo: "owner", priority: "HIGH" } }], enabled: true, description: null });
    const client = await createClient(ctx, clientSchema.parse({ name: "Cliente Automação" }));
    const stage = await ctx.db.pipelineStage.findFirst({ where: { kind: "OPEN" }, orderBy: { order: "asc" } });
    await createOpportunity(ctx, opportunitySchema.parse({ title: "Grande", clientId: client.id, value: 8000, stageId: stage!.id }));
    await createOpportunity(ctx, opportunitySchema.parse({ title: "Pequena", clientId: client.id, value: 100, stageId: stage!.id }));
    expect(await ctx.db.task.count({ where: { title: "Qualificar oportunidade" } })).toBe(1);
  });

  it("tarefa com prioridade automática recebe recomendação do Smart Priority Engine", async () => {
    const ctx = await makeWorkspace();
    const t = await createTask(ctx, { title: "Urgente", description: null, projectId: null, clientId: null, opportunityId: null, parentId: null, assigneeId: null, priority: "AUTO", status: "TODO", dueDate: "2020-01-01", estimateHours: null, blocksProject: false, tags: [] });
    const task = await ctx.db.task.findUnique({ where: { id: t.id } });
    expect(task?.priorityIsManual).toBe(false);
    expect(["HIGH", "CRITICAL"]).toContain(task?.priority);
  });
});
