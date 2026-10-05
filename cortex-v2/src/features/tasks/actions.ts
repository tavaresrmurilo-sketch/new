"use server";

import { z } from "zod";
import { defineAction } from "@/server/action";
import { idParam } from "@/lib/zod-helpers";
import { addComment, createTask, deleteComment, deleteTask, setTaskStatus, updateTask } from "@/server/modules/tasks";
import { commentSchema, taskSchema, taskStatusSchema } from "./schemas";

export const createTaskAction = defineAction({ schema: taskSchema, permission: "tasks.write" }, async (d, ctx) => createTask(ctx, d));
export const updateTaskAction = defineAction({ schema: taskSchema.extend({ id: z.string().min(1) }), permission: "tasks.write" }, async ({ id, ...d }, ctx) => updateTask(ctx, id, d));
export const setTaskStatusAction = defineAction({ schema: taskStatusSchema, permission: "tasks.write" }, async ({ id, status }, ctx) => setTaskStatus(ctx, id, status));
export const deleteTaskAction = defineAction({ schema: idParam, permission: "tasks.delete" }, async ({ id }, ctx) => deleteTask(ctx, id));
export const addCommentAction = defineAction({ schema: commentSchema, permission: "tasks.read" }, async (d, ctx) => addComment(ctx, d));
export const deleteCommentAction = defineAction({ schema: idParam, permission: "tasks.read" }, async ({ id }, ctx) => deleteComment(ctx, id));

export const bulkTaskStatusAction = defineAction(
  { schema: z.object({ ids: z.array(z.string().min(1)).min(1).max(200), status: taskStatusSchema.shape.status }), permission: "tasks.write" },
  async ({ ids, status }, ctx) => {
    for (const id of ids) await setTaskStatus(ctx, id, status);
    return { count: ids.length };
  },
);

export const quickTaskAction = defineAction(
  {
    schema: z.object({
      title: z.string().trim().min(2).max(200),
      projectId: z.string().nullish(),
      parentId: z.string().nullish(),
      opportunityId: z.string().nullish(),
      clientId: z.string().nullish(),
      dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
    }),
    permission: "tasks.write",
  },
  async (d, ctx) =>
    createTask(ctx, {
      title: d.title,
      description: null,
      projectId: d.projectId ?? null,
      clientId: d.clientId ?? null,
      opportunityId: d.opportunityId ?? null,
      parentId: d.parentId ?? null,
      assigneeId: null,
      priority: "AUTO",
      status: "TODO",
      dueDate: d.dueDate ?? null,
      estimateHours: null,
      blocksProject: false,
      tags: [],
    }),
);
