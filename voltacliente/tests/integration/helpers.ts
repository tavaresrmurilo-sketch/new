import { randomUUID } from "node:crypto";
import { addDays, todayIn, type ISODate } from "@/lib/dates";
import { completeOnboarding } from "@/modules/company/service";
import { db } from "@/server/db";
import type { TenantContext } from "@/server/session";

export const TZ = "America/Sao_Paulo";

export async function resetDb() {
  await db.$executeRawUnsafe(`
    TRUNCATE TABLE "reminder_events", "contact_logs", "message_templates", "return_reminders", "appointments",
      "services", "customers", "subscriptions", "memberships", "companies", "sessions", "accounts",
      "verifications", "rate_limits", "users" CASCADE`);
}

export async function createUser(name = "Usuária Teste") {
  return db.user.create({ data: { id: randomUUID(), name, email: `${randomUUID()}@teste.dev` } });
}

/** Cria usuário + empresa pelo mesmo fluxo do onboarding. */
export async function createTenant(companyName: string): Promise<TenantContext & { serviceIds: string[] }> {
  const user = await createUser();
  const company = await completeOnboarding(user.id, {
    companyName,
    segment: "AR_CONDICIONADO",
    phone: "(11) 3333-4444",
    timezone: TZ,
    defaultReturnIntervalDays: 90,
    services: [
      { name: "Limpeza", returnIntervalDays: 180 },
      { name: "Instalação", returnIntervalDays: 365 },
    ],
  });
  const services = await db.service.findMany({ where: { companyId: company.id }, orderBy: { name: "asc" } });
  return { userId: user.id, companyId: company.id, role: "OWNER", timezone: TZ, serviceIds: services.map((s) => s.id) };
}

export const today = (): ISODate => todayIn(TZ);
export const daysAgo = (n: number): ISODate => addDays(today(), -n);

let phoneSeq = 0;
/** Telefones únicos de celular (11) 98xxx-xxxx para os testes. */
export function nextPhone(): string {
  phoneSeq += 1;
  return `(11) 98${String(phoneSeq).padStart(7, "0")}`;
}
