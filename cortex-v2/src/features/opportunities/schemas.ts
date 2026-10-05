import { z } from "zod";
import { SOURCES } from "@/features/clients/schemas";
import { optDate, optId, optNumber, optText, reqNumber, reqText, tagList } from "@/lib/zod-helpers";

export const opportunitySchema = z.object({
  title: reqText(200, "Informe o título"),
  clientId: z.string({ required_error: "Selecione o cliente" }).min(1, "Selecione o cliente"),
  contactId: optId(),
  stageId: z.string({ required_error: "Selecione a etapa" }).min(1, "Selecione a etapa"),
  value: reqNumber({ min: 0 }),
  probability: optNumber({ min: 0, max: 100 }),
  expectedCloseDate: optDate(),
  ownerId: optId(),
  source: z.enum(SOURCES).default("OTHER"),
  description: optText(5000),
  nextStep: optText(300),
  nextStepDate: optDate(),
  competitors: z.array(z.string().trim().min(1).max(80)).max(10).default([]),
  tags: tagList(),
});
export type OpportunityInput = z.input<typeof opportunitySchema>;

export const CLOSE_REASONS = ["PRICE", "COMPETITOR", "TIMING", "NO_BUDGET", "POOR_FIT", "NO_RESPONSE", "TRUST", "RELATIONSHIP", "TECHNICAL_QUALITY", "DEADLINE", "REFERRAL", "REPUTATION", "OTHER"] as const;

export const moveStageSchema = z.object({
  id: z.string().min(1),
  stageId: z.string().min(1),
  closeReason: z.enum(CLOSE_REASONS).nullish(),
  closeNotes: optText(1000),
});
export type MoveStageInput = z.input<typeof moveStageSchema>;
