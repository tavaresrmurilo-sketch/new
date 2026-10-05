"use server";

import { z } from "zod";
import { defineAction } from "@/server/action";
import { AppError } from "@/server/errors";

const ENTITIES = ["clients", "leads", "opportunities", "projects", "tasks", "proposals", "contracts", "meetings", "documents"] as const;

export const toggleFavoriteAction = defineAction(
  {
    schema: z.object({
      entityType: z.enum(["client", "project", "report", "page", "opportunity"]),
      entityId: z.string().min(1).max(200),
      label: z.string().trim().min(1).max(120),
      href: z.string().startsWith("/app").max(300),
    }),
    mode: "read",
  },
  async (input, ctx) => {
    if (!ctx.member) throw new AppError("FORBIDDEN", "Indisponível no modo suporte.");
    const existing = await ctx.db.favorite.findFirst({ where: { userId: ctx.user.id, entityType: input.entityType, entityId: input.entityId } });
    if (existing) {
      await ctx.db.favorite.delete({ where: { id: existing.id } });
      return { favorite: false };
    }
    await ctx.db.favorite.create({ data: { ...input, organizationId: ctx.org.id, userId: ctx.user.id } });
    return { favorite: true };
  },
);

export const saveViewAction = defineAction(
  {
    schema: z.object({
      entity: z.enum(ENTITIES),
      name: z.string().trim().min(2, "Dê um nome à visão").max(80),
      query: z.string().max(1000),
      isShared: z.boolean().default(false),
    }),
    mode: "read",
  },
  async ({ entity, name, query, isShared }, ctx) => {
    if (!ctx.member) throw new AppError("FORBIDDEN", "Indisponível no modo suporte.");
    const params = new URLSearchParams(query);
    params.delete("page");
    const view = await ctx.db.savedView.create({
      data: { organizationId: ctx.org.id, userId: ctx.user.id, entity, name, filters: Object.fromEntries(params.entries()), isShared },
    });
    return { id: view.id };
  },
);

export const deleteViewAction = defineAction({ schema: z.object({ id: z.string().min(1) }), mode: "read" }, async ({ id }, ctx) => {
  const view = await ctx.db.savedView.findFirst({ where: { id, userId: ctx.user.id } });
  if (!view) throw new AppError("NOT_FOUND", "Visão não encontrada.");
  await ctx.db.savedView.delete({ where: { id } });
  return { id };
});
