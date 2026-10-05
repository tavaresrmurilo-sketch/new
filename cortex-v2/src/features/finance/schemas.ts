import { z } from "zod";
import { optDate, optId, reqDate, reqNumber, reqText } from "@/lib/zod-helpers";

export const receivableSchema = z
  .object({
    description: reqText(200, "Descreva o recebimento"),
    clientId: optId(),
    contractId: optId(),
    projectId: optId(),
    amount: reqNumber({ min: 0.01 }),
    dueDate: reqDate("Informe o vencimento"),
    status: z.enum(["PENDING", "RECEIVED", "CANCELED"]).default("PENDING"),
    receivedAt: optDate(),
  })
  .refine((v) => v.status !== "RECEIVED" || !!v.receivedAt, { message: "Informe a data do recebimento", path: ["receivedAt"] });
export type ReceivableInput = z.input<typeof receivableSchema>;

export const markReceivedSchema = z.object({ id: z.string().min(1), receivedAt: reqDate("Informe a data do recebimento") });

export const contractScheduleSchema = z.object({
  contractId: z.string().min(1),
  firstDueDate: reqDate("Informe o primeiro vencimento"),
  installments: z.coerce.number().int().min(1, "Mínimo de 1 parcela").max(60, "Máximo de 60 parcelas"),
});
