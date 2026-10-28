import { z } from "zod";
import { isValidTimeZone } from "@/lib/dates";
import { SEGMENTS } from "@/lib/segments";
import { intervalDaysSchema, phoneSchema } from "@/lib/validation";

export const companyNameSchema = z.string().trim().min(2, "Informe o nome da empresa.").max(80, "Use no máximo 80 caracteres.");

export const timezoneSchema = z.string().refine(isValidTimeZone, "Fuso horário inválido.");

export const onboardingServiceSchema = z.object({
  name: z.string().trim().min(2, "Nome do serviço muito curto.").max(80, "Nome do serviço muito longo."),
  returnIntervalDays: intervalDaysSchema,
});

export const onboardingSchema = z.object({
  companyName: companyNameSchema,
  segment: z.enum(SEGMENTS, { error: "Escolha o segmento." }),
  phone: phoneSchema,
  timezone: timezoneSchema,
  defaultReturnIntervalDays: intervalDaysSchema,
  services: z
    .array(onboardingServiceSchema)
    .min(1, "Cadastre pelo menos um serviço.")
    .max(20, "Cadastre no máximo 20 serviços agora; você poderá adicionar mais depois.")
    .refine((list) => new Set(list.map((s) => s.name.toLocaleLowerCase("pt-BR"))).size === list.length, "Há serviços com o mesmo nome."),
});

export type OnboardingInput = z.input<typeof onboardingSchema>;

export const companySettingsSchema = z.object({
  name: companyNameSchema,
  segment: z.enum(SEGMENTS, { error: "Escolha o segmento." }),
  phone: phoneSchema,
  timezone: timezoneSchema,
  defaultReturnIntervalDays: intervalDaysSchema,
});

export type CompanySettingsInput = z.input<typeof companySettingsSchema>;
