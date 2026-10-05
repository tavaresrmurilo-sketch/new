import { z } from "zod";
import { optDate, optId, optText, reqText } from "@/lib/zod-helpers";

function toNum(v: unknown) {
  if (typeof v !== "string") return v;
  const s = v.trim();
  if (s === "") return undefined;
  const n = Number(s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s);
  return Number.isFinite(n) ? n : v;
}

const num = (min = 0) => z.preprocess(toNum, z.number({ invalid_type_error: "Número inválido", required_error: "Obrigatório" }).min(min));

export const proposalItemSchema = z.object({
  description: reqText(500, "Descreva o item"),
  unit: optText(20),
  quantity: num(0.01),
  unitPrice: num(0),
});

export const proposalSchema = z.object({
  title: reqText(200, "Informe o título da proposta"),
  clientId: z.string({ required_error: "Selecione o cliente" }).min(1, "Selecione o cliente"),
  opportunityId: optId(),
  contactId: optId(),
  ownerId: optId(),
  scope: optText(20000),
  notes: optText(10000),
  validUntil: optDate(),
  discountType: z.enum(["PERCENT", "AMOUNT"]).default("PERCENT"),
  discountValue: num(0).default(0),
  taxes: z.array(z.object({ name: z.string().trim().min(1).max(40), rate: num(0).pipe(z.number().max(100)) })).max(8).default([]),
  items: z.array(proposalItemSchema).min(1, "Adicione ao menos um item").max(200),
  aiGenerated: z.boolean().default(false),
});
export type ProposalInput = z.input<typeof proposalSchema>;

export const proposalStatusSchema = z.object({
  id: z.string().min(1),
  status: z.enum(["DRAFT", "SENT", "NEGOTIATION", "ACCEPTED", "REJECTED", "EXPIRED"]),
  reason: z.string().trim().max(500).nullish(),
  markOpportunityWon: z.boolean().optional(),
});

export const aiProposalBriefSchema = z.object({
  clientId: z.string().min(1, "Selecione o cliente"),
  service: z.string().trim().min(3, "Descreva o serviço").max(500),
  objective: z.string().trim().min(3, "Descreva o objetivo").max(1000),
  estimatedValue: num(0).optional(),
  deadline: z.string().trim().max(120).optional(),
});
