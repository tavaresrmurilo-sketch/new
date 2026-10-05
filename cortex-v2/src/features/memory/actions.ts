"use server";

import { z } from "zod";
import { defineAction } from "@/server/action";
import { assertOwned } from "@/server/db/ownership";
import { AppError } from "@/server/errors";
import { logActivity } from "@/server/activity";

const factSchema = z.object({
  content: z.string().trim().min(3, "Descreva o fato").max(1000),
  category: z.enum(["PREFERENCE", "REQUIREMENT", "DEPENDENCY", "CONTEXT", "OTHER"]).default("CONTEXT"),
  clientId: z.string().nullish(),
  projectId: z.string().nullish(),
  opportunityId: z.string().nullish(),
  contactId: z.string().nullish(),
  source: z.enum(["MANUAL", "MEETING", "AI_CONFIRMED"]).default("MANUAL"),
  sourceRef: z.string().max(100).nullish(),
});

/** Córtex Memory: fatos confirmados por pessoas (com fonte e autor), nunca memória oculta da IA. */
export const saveMemoryFactAction = defineAction(
  { schema: factSchema.extend({ id: z.string().optional() }), permission: "memory.write" },
  async ({ id, ...data }, ctx) => {
    await Promise.all([
      assertOwned(ctx, "client", data.clientId),
      assertOwned(ctx, "project", data.projectId),
      assertOwned(ctx, "opportunity", data.opportunityId),
      assertOwned(ctx, "contact", data.contactId),
    ]);
    if (!data.clientId && !data.projectId && !data.opportunityId) throw new AppError("VALIDATION", "Vincule o fato a um cliente, projeto ou oportunidade.");
    if (id) {
      const existing = await ctx.db.memoryFact.findUnique({ where: { id } });
      if (!existing) throw new AppError("NOT_FOUND", "Fato não encontrado.");
      await ctx.db.memoryFact.update({ where: { id }, data: { content: data.content, category: data.category } });
      return { id };
    }
    const fact = await ctx.db.memoryFact.create({
      data: {
        organizationId: ctx.org.id,
        content: data.content,
        category: data.category,
        clientId: data.clientId ?? null,
        projectId: data.projectId ?? null,
        opportunityId: data.opportunityId ?? null,
        contactId: data.contactId ?? null,
        source: data.source,
        sourceRef: data.sourceRef ?? null,
        authorId: ctx.user.id,
      },
    });
    await logActivity(ctx.db, { organizationId: ctx.org.id, userId: ctx.user.id }, {
      action: "memory.created",
      title: `Fato registrado na Córtex Memory`,
      body: data.content,
      entityType: "memory",
      entityId: fact.id,
      clientId: data.clientId,
      projectId: data.projectId,
      opportunityId: data.opportunityId,
    });
    return { id: fact.id };
  },
);

export const deleteMemoryFactAction = defineAction({ schema: z.object({ id: z.string().min(1) }), permission: "memory.write" }, async ({ id }, ctx) => {
  const existing = await ctx.db.memoryFact.findUnique({ where: { id } });
  if (!existing) throw new AppError("NOT_FOUND", "Fato não encontrado.");
  await ctx.db.memoryFact.update({ where: { id }, data: { deletedAt: new Date() } });
  return { id };
});
