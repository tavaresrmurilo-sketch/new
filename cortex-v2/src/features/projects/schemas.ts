import { z } from "zod";
import { optDate, optId, optNumber, optText, reqText, tagList } from "@/lib/zod-helpers";

export const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
export const PROJECT_STATUSES = ["PLANNING", "ACTIVE", "PAUSED", "DELAYED", "COMPLETED", "CANCELED"] as const;

export const projectSchema = z
  .object({
    name: reqText(200, "Informe o nome do projeto"),
    code: optText(40),
    clientId: optId(),
    opportunityId: optId(),
    managerId: optId(),
    memberIds: z.array(z.string().min(1)).max(50).default([]),
    description: optText(10000),
    priority: z.enum(PRIORITIES).default("MEDIUM"),
    status: z.enum(PROJECT_STATUSES).default("PLANNING"),
    startDate: optDate(),
    dueDate: optDate(),
    progress: z.coerce.number().int().min(0).max(100).default(0),
    budget: optNumber({ min: 0 }),
    actualCost: optNumber({ min: 0 }),
    sharedWithClient: z.boolean().default(false),
    tags: tagList(),
  })
  .refine((v) => !v.startDate || !v.dueDate || v.startDate <= v.dueDate, { message: "O prazo deve ser posterior ao início", path: ["dueDate"] });
export type ProjectInput = z.input<typeof projectSchema>;

export const riskSchema = z
  .object({
    projectId: optId(),
    opportunityId: optId(),
    title: reqText(200, "Descreva o risco"),
    description: optText(2000),
    impact: z.coerce.number().int().min(1).max(4).default(2),
    probability: z.coerce.number().int().min(1).max(4).default(2),
    ownerId: optId(),
    mitigation: optText(2000),
    status: z.enum(["OPEN", "MITIGATING", "CLOSED", "OCCURRED"]).default("OPEN"),
  })
  .refine((v) => v.projectId || v.opportunityId, { message: "Vincule o risco a um projeto ou oportunidade", path: ["projectId"] });
export type RiskInput = z.input<typeof riskSchema>;
