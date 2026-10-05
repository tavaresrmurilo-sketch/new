"use server";

import { z } from "zod";
import { defineAction } from "@/server/action";
import { idParam } from "@/lib/zod-helpers";
import { createProject, deleteProject, deleteRisk, saveRisk, updateProject } from "@/server/modules/projects";
import { runPlaybook } from "@/server/modules/playbooks";
import { scopeOf } from "@/server/scope";
import { projectSchema, riskSchema } from "./schemas";

export const createProjectAction = defineAction({ schema: projectSchema, permission: "projects.write" }, async (d, ctx) => createProject(ctx, d));
export const updateProjectAction = defineAction({ schema: projectSchema.and(z.object({ id: z.string().min(1) })), permission: "projects.write" }, async ({ id, ...d }, ctx) => updateProject(ctx, id, d));
export const deleteProjectAction = defineAction({ schema: idParam, permission: "projects.delete" }, async ({ id }, ctx) => deleteProject(ctx, id));

export const saveRiskAction = defineAction({ schema: riskSchema.and(z.object({ id: z.string().optional() })), permission: "projects.write" }, async ({ id, ...d }, ctx) => saveRisk(ctx, d, id));
export const deleteRiskAction = defineAction({ schema: idParam, permission: "projects.write" }, async ({ id }, ctx) => deleteRisk(ctx, id));

export const startPlaybookAction = defineAction(
  {
    schema: z.object({ playbookId: z.string().min(1), clientId: z.string().nullish(), projectId: z.string().nullish(), opportunityId: z.string().nullish() }),
    permission: "playbooks.run",
  },
  async (input, ctx) => {
    const { assertOwned } = await import("@/server/db/ownership");
    await Promise.all([assertOwned(ctx, "client", input.clientId), assertOwned(ctx, "project", input.projectId), assertOwned(ctx, "opportunity", input.opportunityId)]);
    let ownerId: string | null = null;
    if (input.projectId) ownerId = (await ctx.db.project.findUnique({ where: { id: input.projectId }, select: { managerId: true } }))?.managerId ?? null;
    else if (input.opportunityId) ownerId = (await ctx.db.opportunity.findUnique({ where: { id: input.opportunityId }, select: { ownerId: true } }))?.ownerId ?? null;
    else if (input.clientId) ownerId = (await ctx.db.client.findUnique({ where: { id: input.clientId }, select: { ownerId: true } }))?.ownerId ?? null;
    return runPlaybook(scopeOf(ctx), input.playbookId, { clientId: input.clientId, projectId: input.projectId, opportunityId: input.opportunityId, ownerId });
  },
);
