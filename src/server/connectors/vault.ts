import { prisma } from "@/lib/db";
import { maskSecret, openSecret, sealSecret } from "@/server/security/crypto";

const aad = (tenantId: string, integrationId: string, key: string) => `${tenantId}:${integrationId}:${key}`;

/** Grava credenciais cifradas (AES-256-GCM). Valores vazios são ignorados (mantém o existente). */
export async function storeCredentials(tenantId: string, integrationId: string, values: Record<string, string>) {
  for (const [key, value] of Object.entries(values)) {
    if (!value) continue;
    const sealed = sealSecret(value, aad(tenantId, integrationId, key));
    await prisma.integrationCredential.upsert({
      where: { integrationId_key: { integrationId, key } },
      create: { tenantId, integrationId, key, ...sealed },
      update: sealed,
    });
  }
}

/** Uso exclusivo do motor de sincronização — nunca retornar ao frontend. */
export async function loadCredentials(tenantId: string, integrationId: string): Promise<Record<string, string>> {
  const rows = await prisma.integrationCredential.findMany({ where: { tenantId, integrationId } });
  return Object.fromEntries(rows.map((r) => [r.key, openSecret(r, aad(tenantId, integrationId, r.key))]));
}

/** Versão mascarada para exibição. */
export async function describeCredentials(tenantId: string, integrationId: string) {
  const creds = await loadCredentials(tenantId, integrationId);
  return Object.fromEntries(Object.entries(creds).map(([k, v]) => [k, maskSecret(v)]));
}
