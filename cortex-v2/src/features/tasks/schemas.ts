import { z } from "zod";
import { PRIORITIES } from "@/features/projects/schemas";
import { optDate, optId, optNumber, optText, reqText, tagList } from "@/lib/zod-helpers";

export const TASK_STATUSES = ["TODO", "IN_PROGRESS", "BLOCKED", "DONE", "CANCELED"] as const;

export const taskSchema = z.object({
  title: reqText(200, "Informe o título da tarefa"),
  description: optText(10000),
  projectId: optId(),
  clientId: optId(),
  opportunityId: optId(),
  parentId: optId(),
  assigneeId: optId(),
  /** AUTO = Smart Priority Engine decide; demais valores = escolha manual do usuário */
  priority: z.enum(["AUTO", ...PRIORITIES]).default("AUTO"),
  status: z.enum(TASK_STATUSES).default("TODO"),
  dueDate: optDate(),
  estimateHours: optNumber({ min: 0, max: 1000 }),
  blocksProject: z.boolean().default(false),
  tags: tagList(),
});
export type TaskInput = z.input<typeof taskSchema>;

export const taskStatusSchema = z.object({ id: z.string().min(1), status: z.enum(TASK_STATUSES) });
export const commentSchema = z.object({ taskId: z.string().min(1), body: z.string().trim().min(1, "Escreva um comentário").max(5000) });
