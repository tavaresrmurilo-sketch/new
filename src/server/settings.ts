import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/server/db";

/** Configurações da plataforma com valores padrão tipados. */
export const SETTING_DEFAULTS = {
  /** "all": todo evento passa por análise; "new_orgs": só organizações sem selo de confiança; "none": publica direto. */
  "moderation.mode": "new_orgs" as "all" | "new_orgs" | "none",
  /** Exigir e-mail verificado para publicar eventos. */
  "publishing.requireVerifiedEmail": true as boolean,
};

export type SettingKey = keyof typeof SETTING_DEFAULTS;

export async function getSetting<K extends SettingKey>(key: K): Promise<(typeof SETTING_DEFAULTS)[K]> {
  const row = await prisma.appSetting.findUnique({ where: { key } });
  return (row?.value as (typeof SETTING_DEFAULTS)[K] | undefined) ?? SETTING_DEFAULTS[key];
}

export async function setSetting<K extends SettingKey>(key: K, value: (typeof SETTING_DEFAULTS)[K]) {
  await prisma.appSetting.upsert({
    where: { key },
    create: { key, value: value as Prisma.InputJsonValue },
    update: { value: value as Prisma.InputJsonValue },
  });
}
