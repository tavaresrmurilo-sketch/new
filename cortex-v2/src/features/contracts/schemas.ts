import { z } from "zod";
import { optDate, optId, optText, reqDate, reqNumber, reqText } from "@/lib/zod-helpers";

export const contractSchema = z
  .object({
    title: reqText(200, "Informe o título do contrato"),
    number: optText(40),
    clientId: z.string({ required_error: "Selecione o cliente" }).min(1, "Selecione o cliente"),
    proposalId: optId(),
    opportunityId: optId(),
    ownerId: optId(),
    value: reqNumber({ min: 0 }),
    recurrence: z.enum(["ONE_TIME", "MONTHLY", "QUARTERLY", "YEARLY"]).default("ONE_TIME"),
    startDate: reqDate("Informe a data de início"),
    endDate: optDate(),
    renewalType: z.enum(["AUTOMATIC", "MANUAL", "NONE"]).default("MANUAL"),
    status: z.enum(["DRAFT", "ACTIVE", "EXPIRED", "RENEWED", "CANCELED"]).default("ACTIVE"),
    signedAt: optDate(),
    notes: optText(5000),
  })
  .refine((v) => !v.endDate || v.endDate >= v.startDate, { message: "O vencimento deve ser posterior ao início", path: ["endDate"] });
export type ContractInput = z.input<typeof contractSchema>;

export const renewContractSchema = z.object({
  id: z.string().min(1),
  startDate: reqDate(),
  endDate: reqDate("Informe o novo vencimento"),
  value: reqNumber({ min: 0 }),
});
