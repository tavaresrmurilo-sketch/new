import { z } from "zod";
import { booleanField, intervalDaysSchema, moneySchema, optionalText } from "@/lib/validation";

export const serviceSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome do serviço.").max(80, "Use no máximo 80 caracteres."),
  description: optionalText(500, "A descrição"),
  defaultPrice: moneySchema,
  /** Vazio = usar a periodicidade padrão da empresa. */
  returnIntervalDays: z
    .union([z.string(), z.number()])
    .optional()
    .nullable()
    .transform((v, ctx) => {
      if (v === "" || v === null || v === undefined) return null;
      const parsed = intervalDaysSchema.safeParse(v);
      if (!parsed.success) {
        ctx.addIssue({ code: "custom", message: parsed.error.issues[0]?.message ?? "Intervalo inválido." });
        return z.NEVER;
      }
      return parsed.data;
    }),
  active: booleanField(true),
});

export type ServiceInput = z.input<typeof serviceSchema>;
