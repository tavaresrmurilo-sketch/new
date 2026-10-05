import "server-only";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { WEBHOOK_EVENTS, type WebhookEvent } from "@/lib/automation-catalog";
import { audit } from "@/server/audit";
import type { Ctx } from "@/server/auth/context";
import { assertFeature, assertLimit } from "@/server/billing/feature-gate";
import { automationSchema } from "@/server/automations/engine";
import { AppError, notFound } from "@/server/errors";
import { encryptSecret, hashToken, randomToken } from "@/server/security/crypto";
import { assertPublicUrl } from "@/server/security/url-guard";
import { deliverWebhook } from "@/server/webhooks/dispatch";

// ───────────── API keys ─────────────

export const API_SCOPES = {
  "clients:read": "Ler clientes",
  "clients:write": "Criar clientes",
  "leads:read": "Ler leads",
  "leads:write": "Criar leads",
  "opportunities:read": "Ler oportunidades",
  "projects:read": "Ler projetos",
  "tasks:read": "Ler tarefas",
  "tasks:write": "Criar tarefas",
} as const;
export type ApiScope = keyof typeof API_SCOPES;

export const apiKeySchema = z.object({
  name: z.string().trim().min(2, "Dê um nome à chave").max(80),
  scopes: z.array(z.enum(Object.keys(API_SCOPES) as [ApiScope, ...ApiScope[]])).min(1, "Selecione ao menos um escopo"),
  expiresInDays: z.coerce.number().int().min(0).max(730).default(0),
});

/** Cria uma API key. O valor completo é retornado apenas uma vez; o banco guarda somente o hash. */
export async function createApiKey(ctx: Ctx, input: z.output<typeof apiKeySchema>) {
  assertFeature(ctx, "api_access");
  await assertLimit(ctx, "api_keys", 1);
  const raw = `ctx_live_${randomToken(24)}`;
  const key = await ctx.db.apiKey.create({
    data: {
      organizationId: ctx.org.id,
      name: input.name,
      prefix: raw.slice(0, 16),
      keyHash: hashToken(raw),
      scopes: input.scopes,
      expiresAt: input.expiresInDays ? new Date(Date.now() + input.expiresInDays * 86_400_000) : null,
      createdById: ctx.user.id,
    },
  });
  await audit(ctx, "api_key.created", { entityType: "api_key", entityId: key.id, metadata: { name: input.name, scopes: input.scopes } });
  return { id: key.id, key: raw };
}

export async function revokeApiKey(ctx: Ctx, id: string) {
  const k = await ctx.db.apiKey.findUnique({ where: { id } });
  if (!k) throw notFound("API key");
  await ctx.db.apiKey.update({ where: { id }, data: { revokedAt: new Date() } });
  await audit(ctx, "api_key.revoked", { entityType: "api_key", entityId: id });
  return { id };
}

// ───────────── Webhooks ─────────────

const EVENT_KEYS = Object.keys(WEBHOOK_EVENTS) as [WebhookEvent, ...WebhookEvent[]];
export const webhookSchema = z.object({
  name: z.string().trim().min(2, "Dê um nome").max(80),
  url: z.string().trim().url("URL inválida").startsWith("https://", "Use uma URL https").max(500),
  events: z.array(z.enum(EVENT_KEYS)).min(1, "Selecione ao menos um evento"),
  enabled: z.boolean().default(true),
});

export async function createWebhook(ctx: Ctx, input: z.output<typeof webhookSchema>) {
  assertFeature(ctx, "webhooks");
  await assertLimit(ctx, "webhooks", 1);
  await assertPublicUrl(input.url).catch(() => {
    throw new AppError("VALIDATION", "A URL precisa ser pública (endereços internos ou locais não são permitidos).", { url: ["URL não permitida"] });
  });
  const secret = `whsec_${randomToken(24)}`;
  const hook = await ctx.db.webhook.create({ data: { organizationId: ctx.org.id, name: input.name, url: input.url, events: input.events, enabled: input.enabled, secretEncrypted: encryptSecret(secret), createdById: ctx.user.id } });
  await audit(ctx, "webhook.created", { entityType: "webhook", entityId: hook.id, metadata: { url: input.url, events: input.events } });
  return { id: hook.id, secret };
}

export async function updateWebhook(ctx: Ctx, id: string, input: z.output<typeof webhookSchema>) {
  const hook = await ctx.db.webhook.findUnique({ where: { id } });
  if (!hook) throw notFound("Webhook");
  await assertPublicUrl(input.url).catch(() => {
    throw new AppError("VALIDATION", "A URL precisa ser pública.", { url: ["URL não permitida"] });
  });
  await ctx.db.webhook.update({ where: { id }, data: { name: input.name, url: input.url, events: input.events, enabled: input.enabled, ...(input.enabled && !hook.enabled ? { consecutiveFailures: 0 } : {}) } });
  await audit(ctx, "webhook.updated", { entityType: "webhook", entityId: id });
  return { id };
}

export async function deleteWebhook(ctx: Ctx, id: string) {
  const hook = await ctx.db.webhook.findUnique({ where: { id } });
  if (!hook) throw notFound("Webhook");
  await ctx.db.webhook.delete({ where: { id } });
  await audit(ctx, "webhook.deleted", { entityType: "webhook", entityId: id, metadata: { url: hook.url } });
  return { id };
}

/** Envia um evento de teste (ping) real para o endpoint e registra a tentativa. */
export async function testWebhook(ctx: Ctx, id: string) {
  const hook = await ctx.db.webhook.findUnique({ where: { id } });
  if (!hook) throw notFound("Webhook");
  const d = await ctx.db.webhookDelivery.create({
    data: { organizationId: ctx.org.id, webhookId: id, event: "ping", payload: { id: `evt_${randomToken(12)}`, event: "ping", createdAt: new Date().toISOString(), organizationId: ctx.org.id, data: { message: "Teste de webhook do JR Córtex" } } as Prisma.InputJsonValue, status: "PENDING", nextAttemptAt: new Date() },
  });
  await deliverWebhook(d.id);
  const after = await ctx.db.webhookDelivery.findUnique({ where: { id: d.id }, select: { status: true, responseStatus: true, error: true } });
  return { status: after?.status ?? "PENDING", responseStatus: after?.responseStatus ?? null, error: after?.error ?? null };
}

// ───────────── Automações ─────────────

export async function saveAutomation(ctx: Ctx, input: z.output<typeof automationSchema>, id?: string) {
  assertFeature(ctx, "automations");
  if (input.actions.some((a) => a.type === "start_playbook")) {
    for (const a of input.actions) if (a.type === "start_playbook" && !(await ctx.db.playbook.count({ where: { id: a.params.playbookId } }))) throw notFound("Playbook");
  }
  const data = { name: input.name, description: input.description ?? null, trigger: input.trigger, conditions: input.conditions as Prisma.InputJsonValue, actions: input.actions as Prisma.InputJsonValue, enabled: input.enabled };
  if (id) {
    const a = await ctx.db.automation.findUnique({ where: { id } });
    if (!a) throw notFound("Automação");
    if (input.enabled && !a.enabled) await assertActiveLimit(ctx);
    await ctx.db.automation.update({ where: { id }, data });
    await audit(ctx, "automation.updated", { entityType: "automation", entityId: id });
    return { id };
  }
  if (input.enabled) await assertActiveLimit(ctx);
  const a = await ctx.db.automation.create({ data: { ...data, organizationId: ctx.org.id, createdById: ctx.user.id } });
  await audit(ctx, "automation.created", { entityType: "automation", entityId: a.id });
  return { id: a.id };
}

async function assertActiveLimit(ctx: Ctx) {
  await assertLimit(ctx, "automations", 1);
}

export async function setAutomationEnabled(ctx: Ctx, id: string, enabled: boolean) {
  const a = await ctx.db.automation.findUnique({ where: { id } });
  if (!a) throw notFound("Automação");
  if (enabled && !a.enabled) await assertActiveLimit(ctx);
  await ctx.db.automation.update({ where: { id }, data: { enabled } });
  return { id };
}

export async function deleteAutomation(ctx: Ctx, id: string) {
  const a = await ctx.db.automation.findUnique({ where: { id } });
  if (!a) throw notFound("Automação");
  await ctx.db.automation.update({ where: { id }, data: { deletedAt: new Date(), enabled: false } });
  await audit(ctx, "automation.deleted", { entityType: "automation", entityId: id });
  return { id };
}

// ───────────── Playbooks ─────────────

export const playbookSchema = z.object({
  name: z.string().trim().min(2, "Dê um nome ao playbook").max(120),
  description: z.string().trim().max(1000).nullish(),
  category: z.string().trim().max(60).nullish(),
  enabled: z.boolean().default(true),
  steps: z
    .array(
      z.object({
        title: z.string().trim().min(2, "Informe o título da etapa").max(200),
        description: z.string().trim().max(1000).nullish(),
        offsetDays: z.coerce.number().int().min(0).max(365).default(0),
        assigneeMode: z.enum(["RUNNER", "ENTITY_OWNER"]).default("RUNNER"),
        priority: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).default("MEDIUM"),
        estimateHours: z.coerce.number().min(0).max(1000).nullish(),
      }),
    )
    .min(1, "Adicione ao menos uma etapa")
    .max(50),
});

export async function savePlaybook(ctx: Ctx, input: z.output<typeof playbookSchema>, id?: string) {
  assertFeature(ctx, "playbooks");
  const base = { name: input.name, description: input.description ?? null, category: input.category ?? null, enabled: input.enabled };
  const steps = input.steps.map((s, i) => ({ organizationId: ctx.org.id, order: i, title: s.title, description: s.description ?? null, offsetDays: s.offsetDays, assigneeMode: s.assigneeMode, priority: s.priority, estimateHours: s.estimateHours ?? null }));
  if (id) {
    const p = await ctx.db.playbook.findUnique({ where: { id } });
    if (!p) throw notFound("Playbook");
    await ctx.db.$transaction(async (tx) => {
      await tx.playbook.update({ where: { id }, data: base });
      await tx.playbookStep.deleteMany({ where: { playbookId: id } });
      await tx.playbookStep.createMany({ data: steps.map((s) => ({ ...s, playbookId: id })) });
    });
    return { id };
  }
  const p = await ctx.db.playbook.create({ data: { ...base, organizationId: ctx.org.id, createdById: ctx.user.id } });
  await ctx.db.playbookStep.createMany({ data: steps.map((s) => ({ ...s, playbookId: p.id })) });
  await audit(ctx, "playbook.created", { entityType: "playbook", entityId: p.id });
  return { id: p.id };
}

export async function deletePlaybook(ctx: Ctx, id: string) {
  const p = await ctx.db.playbook.findUnique({ where: { id } });
  if (!p) throw notFound("Playbook");
  await ctx.db.playbook.update({ where: { id }, data: { deletedAt: new Date() } });
  return { id };
}

/** Modelos prontos (o usuário escolhe e pode editar antes de salvar). */
export const PLAYBOOK_TEMPLATES: { key: string; name: string; category: string; description: string; steps: z.input<typeof playbookSchema>["steps"] }[] = [
  {
    key: "onboarding-client",
    name: "Onboarding de novo cliente",
    category: "Clientes",
    description: "Primeiros 30 dias após o fechamento.",
    steps: [
      { title: "Reunião de kickoff com o cliente", offsetDays: 2, priority: "HIGH", assigneeMode: "ENTITY_OWNER" },
      { title: "Coletar documentos e acessos necessários", offsetDays: 5, priority: "MEDIUM" },
      { title: "Apresentar cronograma e responsáveis", offsetDays: 7, priority: "MEDIUM" },
      { title: "Check-in de satisfação (15 dias)", offsetDays: 15, priority: "MEDIUM", assigneeMode: "ENTITY_OWNER" },
      { title: "Revisão de 30 dias", offsetDays: 30, priority: "MEDIUM", assigneeMode: "ENTITY_OWNER" },
    ],
  },
  {
    key: "proposal-follow-up",
    name: "Follow-up de proposta",
    category: "Comercial",
    description: "Cadência após o envio de uma proposta. Nenhuma mensagem é enviada automaticamente.",
    steps: [
      { title: "Confirmar recebimento da proposta", offsetDays: 1, priority: "HIGH" },
      { title: "Esclarecer dúvidas e objeções", offsetDays: 4, priority: "MEDIUM" },
      { title: "Follow-up de decisão", offsetDays: 8, priority: "HIGH" },
    ],
  },
  {
    key: "contract-renewal",
    name: "Renovação de contrato",
    category: "Contratos",
    description: "Preparação para a renovação 60 dias antes do vencimento.",
    steps: [
      { title: "Levantar entregas e resultados do contrato", offsetDays: 0, priority: "MEDIUM" },
      { title: "Reunião de revisão com o cliente", offsetDays: 10, priority: "HIGH", assigneeMode: "ENTITY_OWNER" },
      { title: "Enviar proposta de renovação", offsetDays: 20, priority: "HIGH" },
    ],
  },
];
