import { z } from "zod";

/** Configurações operacionais por empresa (Organization.settings). Valores padrão são configuração, não dados. */
export const orgSettingsSchema = z.object({
  followUpDays: z.number().int().min(1).max(90).default(7),
  briefInactiveClientDays: z.number().int().min(1).max(180).default(10),
  inactiveClientDays: z.number().int().min(7).max(365).default(30),
  largeDealThreshold: z.number().min(0).default(50000),
  proposalValidityDays: z.number().int().min(1).max(365).default(15),
  proposalTaxes: z.array(z.object({ name: z.string().min(1).max(40), rate: z.number().min(0).max(100) })).max(8).default([]),
  departments: z.array(z.string().min(1).max(60)).max(30).default(["Comercial", "Operações", "Engenharia", "Financeiro", "Administrativo"]),
  industries: z
    .array(z.string().min(1).max(60))
    .max(50)
    .default(["Engenharia", "Construção", "Manutenção", "Inspeções", "Consultoria", "Indústria", "Varejo", "Saúde", "Educação", "Setor público", "Tecnologia", "Outros"]),
  defaultWeeklyCapacity: z.number().int().min(1).max(80).default(40),
  contractAlertDays: z.array(z.number().int().min(1).max(365)).default([90, 60, 30, 7]),
  aiEnabled: z.boolean().default(true),
});

export type OrgSettings = z.infer<typeof orgSettingsSchema>;

export function parseOrgSettings(value: unknown): OrgSettings {
  const parsed = orgSettingsSchema.safeParse(value ?? {});
  return parsed.success ? parsed.data : orgSettingsSchema.parse({});
}
