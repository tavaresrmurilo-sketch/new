import { z } from "zod";
import { booleanField, emailSchema, optionalIsoDate, optionalText, phoneSchema } from "@/lib/validation";

export const CONTACT_PREFERENCES = ["WHATSAPP", "PHONE", "EMAIL", "ANY"] as const;

export const customerSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome do cliente.").max(120, "Use no máximo 120 caracteres."),
  phone: phoneSchema,
  email: z
    .string()
    .trim()
    .optional()
    .nullable()
    .transform((v) => (v ? v : null))
    .pipe(z.union([z.null(), emailSchema])),
  notes: optionalText(2000, "As observações"),
  registeredAt: optionalIsoDate,
  contactPreference: z.enum(CONTACT_PREFERENCES, { error: "Escolha a preferência de contato." }).default("WHATSAPP"),
  marketingConsent: booleanField(false),
  doNotContact: booleanField(false),
});

export type CustomerInput = z.input<typeof customerSchema>;

export const CUSTOMER_FILTERS = ["todos", "com-consentimento", "sem-consentimento", "nao-contatar", "retorno-pendente"] as const;
export type CustomerFilter = (typeof CUSTOMER_FILTERS)[number];

export const CUSTOMER_SORTS = ["nome", "recentes", "antigos"] as const;
export type CustomerSort = (typeof CUSTOMER_SORTS)[number];
