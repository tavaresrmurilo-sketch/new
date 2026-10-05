import { z } from "zod";
import { isValidDocument } from "@/lib/br-docs";
import { optEmail, optId, optText, reqText, tagList } from "@/lib/zod-helpers";

export const SOURCES = ["REFERRAL", "WEBSITE", "INBOUND", "OUTBOUND", "EVENT", "SOCIAL", "PARTNER", "ADS", "OTHER"] as const;
export const CLIENT_STATUSES = ["PROSPECT", "ACTIVE", "INACTIVE", "CHURNED"] as const;

export const clientSchema = z.object({
  name: reqText(160, "Informe o nome do cliente"),
  kind: z.enum(["COMPANY", "INDIVIDUAL"]).default("COMPANY"),
  legalName: optText(200),
  document: optText(30).refine((v) => isValidDocument(v), "CPF/CNPJ inválido"),
  email: optEmail(),
  phone: optText(30),
  website: optText(200),
  industry: optText(60),
  city: optText(80),
  state: optText(40),
  status: z.enum(CLIENT_STATUSES).default("ACTIVE"),
  isKeyAccount: z.boolean().default(false),
  source: z.enum(SOURCES).default("OTHER"),
  ownerId: optId(),
  notes: optText(5000),
  tags: tagList(),
});
export type ClientInput = z.input<typeof clientSchema>;

export const contactSchema = z.object({
  clientId: optId(),
  name: reqText(160, "Informe o nome"),
  email: optEmail(),
  phone: optText(30),
  whatsapp: optText(30),
  jobTitle: optText(120),
  department: optText(80),
  decisionRole: z.enum(["DECISION_MAKER", "INFLUENCER", "CHAMPION", "BLOCKER", "USER", "UNKNOWN"]).default("UNKNOWN"),
  influence: z.coerce.number().int().min(1).max(5).default(3),
  reportsToId: optId(),
  isPrimary: z.boolean().default(false),
  notes: optText(2000),
});
export type ContactInput = z.input<typeof contactSchema>;

export const INTERACTION_CHANNELS = ["CALL", "EMAIL", "WHATSAPP", "MEETING", "VISIT", "NOTE", "ISSUE"] as const;

export const interactionSchema = z
  .object({
    clientId: optId(),
    leadId: optId(),
    opportunityId: optId(),
    projectId: optId(),
    channel: z.enum(INTERACTION_CHANNELS),
    body: z.string().trim().min(2, "Descreva a interação").max(5000),
    occurredAt: z.preprocess((v) => (v === "" ? null : v), z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/).nullable()).default(null),
  })
  .refine((v) => v.clientId || v.leadId || v.opportunityId || v.projectId, { message: "Vincule a um registro", path: ["clientId"] });
export type InteractionInput = z.input<typeof interactionSchema>;
