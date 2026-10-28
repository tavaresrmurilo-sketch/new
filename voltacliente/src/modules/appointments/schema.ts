import { z } from "zod";
import { idSchema, isoDateSchema, moneySchema, optionalIsoDate, optionalText } from "@/lib/validation";

export const RETURN_MODES = ["auto", "manual", "none"] as const;
export type ReturnMode = (typeof RETURN_MODES)[number];

export const appointmentSchema = z
  .object({
    customerId: idSchema,
    serviceId: z.string({ error: "Escolha o serviço." }).trim().min(1, "Escolha o serviço.").max(64),
    date: isoDateSchema,
    amount: moneySchema,
    notes: optionalText(2000, "As observações"),
    returnMode: z.enum(RETURN_MODES).default("auto"),
    nextReturnDate: optionalIsoDate,
    /** Lembrete que este atendimento converte ("Registrar retorno"). */
    fromReminderId: z
      .string()
      .trim()
      .max(64)
      .optional()
      .nullable()
      .transform((v) => (v ? v : null)),
  })
  .superRefine((value, ctx) => {
    if (value.returnMode === "manual") {
      if (!value.nextReturnDate) {
        ctx.addIssue({ code: "custom", path: ["nextReturnDate"], message: "Informe a data do próximo retorno." });
      } else if (value.nextReturnDate <= value.date) {
        ctx.addIssue({ code: "custom", path: ["nextReturnDate"], message: "O retorno deve ser posterior à data do atendimento." });
      }
    }
  });

export type AppointmentInput = z.input<typeof appointmentSchema>;
export type AppointmentData = z.output<typeof appointmentSchema>;
