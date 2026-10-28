import { z } from "zod";
import { findUnknownVariables, TEMPLATE_MAX_LENGTH } from "@/lib/templates";
import { booleanField } from "@/lib/validation";

export const templateSchema = z.object({
  name: z.string().trim().min(2, "Dê um nome ao modelo.").max(60, "Use no máximo 60 caracteres."),
  body: z
    .string()
    .trim()
    .min(10, "Escreva a mensagem (mínimo de 10 caracteres).")
    .max(TEMPLATE_MAX_LENGTH, `Use no máximo ${TEMPLATE_MAX_LENGTH} caracteres.`)
    .superRefine((body, ctx) => {
      const unknown = findUnknownVariables(body);
      if (unknown.length > 0) {
        ctx.addIssue({ code: "custom", message: `Variável desconhecida: ${unknown.map((v) => `{${v}}`).join(", ")}` });
      }
    }),
  serviceId: z
    .string()
    .trim()
    .max(64)
    .optional()
    .nullable()
    .transform((v) => (v && v !== "todos" ? v : null)),
  isDefault: booleanField(false),
});

export type TemplateInput = z.input<typeof templateSchema>;
