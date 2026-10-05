"use server";

import { z } from "zod";
import { defineAction } from "@/server/action";
import { ALL_SEARCH_TYPES, searchRecords, type SearchType } from "@/server/modules/search";

/** Opções usadas pelos formulários (responsáveis, etapas, projetos, configurações do workspace). */
export const getFormOptionsAction = defineAction({ schema: z.object({}), mode: "read" }, async (_input, ctx) => {
  const [members, pipelines, projects, tags, playbooks] = await Promise.all([
    ctx.db.organizationMember.findMany({
      where: { status: "ACTIVE" },
      select: { userId: true, user: { select: { name: true } } },
      orderBy: { user: { name: "asc" } },
    }),
    ctx.db.pipeline.findMany({
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
      select: { id: true, name: true, isDefault: true, stages: { orderBy: { order: "asc" }, select: { id: true, name: true, kind: true, probability: true } } },
    }),
    ctx.db.project.findMany({
      where: { status: { notIn: ["COMPLETED", "CANCELED"] } },
      select: { id: true, name: true, clientId: true },
      orderBy: { updatedAt: "desc" },
      take: 300,
    }),
    ctx.db.tag.findMany({ select: { name: true }, orderBy: { name: "asc" }, take: 300 }),
    ctx.db.playbook.findMany({ where: { enabled: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  return {
    me: ctx.user.id,
    members: members.map((m) => ({ id: m.userId, name: m.user.name })),
    pipelines,
    projects,
    tags: tags.map((t) => t.name),
    playbooks,
    settings: {
      departments: ctx.org.settings.departments,
      industries: ctx.org.settings.industries,
      proposalTaxes: ctx.org.settings.proposalTaxes,
      proposalValidityDays: ctx.org.settings.proposalValidityDays,
      currency: ctx.org.currency,
      timezone: ctx.org.timezone,
    },
  };
});

export type FormOptions = Extract<Awaited<ReturnType<typeof getFormOptionsAction>>, { ok: true }>["data"];

export const searchRecordsAction = defineAction(
  { schema: z.object({ q: z.string().max(80), types: z.array(z.string()).max(10).optional(), limit: z.number().int().min(1).max(20).default(8) }), mode: "read" },
  async ({ q, types, limit }, ctx) => {
    const t = (types?.filter((x) => (ALL_SEARCH_TYPES as string[]).includes(x)) ?? ALL_SEARCH_TYPES) as SearchType[];
    return searchRecords(ctx, q, t, limit);
  },
);

/** Contatos de um cliente (para selects dependentes). */
export const clientContactsAction = defineAction(
  { schema: z.object({ clientId: z.string().min(1) }), mode: "read", permission: "clients.read" },
  async ({ clientId }, ctx) =>
    ctx.db.contact.findMany({ where: { clientId }, select: { id: true, name: true, jobTitle: true, decisionRole: true }, orderBy: { name: "asc" } }),
);
