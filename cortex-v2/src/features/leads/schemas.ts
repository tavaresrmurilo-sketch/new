import { z } from "zod";
import { SOURCES } from "@/features/clients/schemas";
import { optDate, optEmail, optId, optNumber, optText, reqText, tagList } from "@/lib/zod-helpers";

export const LEAD_STATUSES = ["NEW", "CONTACTED", "QUALIFIED", "UNQUALIFIED", "CONVERTED"] as const;

export const leadSchema = z.object({
  name: reqText(160, "Informe o nome do lead"),
  companyName: optText(160),
  email: optEmail(),
  phone: optText(30),
  whatsapp: optText(30),
  jobTitle: optText(120),
  source: z.enum(SOURCES).default("OTHER"),
  status: z.enum(["NEW", "CONTACTED", "QUALIFIED", "UNQUALIFIED"]).default("NEW"),
  ownerId: optId(),
  notes: optText(5000),
  potentialValue: optNumber({ min: 0 }),
  tags: tagList(),
});
export type LeadInput = z.input<typeof leadSchema>;

export const convertLeadSchema = z
  .object({
    leadId: z.string().min(1),
    clientMode: z.enum(["new", "existing"]).default("new"),
    existingClientId: optId(),
    clientName: optText(160),
    createOpportunity: z.boolean().default(true),
    opportunityTitle: optText(200),
    value: optNumber({ min: 0 }),
    stageId: optId(),
    expectedCloseDate: optDate(),
  })
  .refine((v) => v.clientMode === "new" || v.existingClientId, { message: "Selecione o cliente", path: ["existingClientId"] });
export type ConvertLeadInput = z.input<typeof convertLeadSchema>;
