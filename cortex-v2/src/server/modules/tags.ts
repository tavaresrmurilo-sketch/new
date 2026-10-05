import "server-only";
import type { TenantDb, TxClient } from "@/server/db/tenant";

export type TaggableEntity = "client" | "lead" | "opportunity" | "project" | "task" | "contact" | "document" | "contract";

const COLORS = ["slate", "indigo", "emerald", "amber", "rose", "sky", "violet", "teal"];

/** Define o conjunto de tags de um registro (cria tags inexistentes no workspace). */
export async function setTags(db: TenantDb | TxClient, organizationId: string, entityType: TaggableEntity, entityId: string, names: string[]) {
  const clean = [...new Set(names.map((n) => n.trim()).filter(Boolean).map((n) => n.slice(0, 40)))];
  const tags = [];
  for (const name of clean) {
    const existing = await db.tag.findFirst({ where: { name: { equals: name, mode: "insensitive" } } });
    tags.push(existing ?? (await db.tag.create({ data: { organizationId, name, color: COLORS[name.length % COLORS.length]! } })));
  }
  const tagIds = tags.map((t) => t.id);
  await db.tagAssignment.deleteMany({ where: { entityType, entityId, ...(tagIds.length ? { tagId: { notIn: tagIds } } : {}) } });
  for (const tagId of tagIds) {
    await db.tagAssignment.upsert({
      where: { tagId_entityType_entityId: { tagId, entityType, entityId } },
      create: { organizationId, tagId, entityType, entityId },
      update: {},
    });
  }
}

export async function addTag(db: TenantDb | TxClient, organizationId: string, entityType: TaggableEntity, entityId: string, name: string) {
  const current = await tagsFor(db, entityType, [entityId]);
  await setTags(db, organizationId, entityType, entityId, [...(current.get(entityId) ?? []).map((t) => t.name), name]);
}

/** Tags de vários registros em uma consulta (evita N+1 em listas). */
export async function tagsFor(db: TenantDb | TxClient, entityType: TaggableEntity, entityIds: string[]) {
  const map = new Map<string, { id: string; name: string; color: string }[]>();
  if (!entityIds.length) return map;
  const rows = await db.tagAssignment.findMany({
    where: { entityType, entityId: { in: entityIds } },
    include: { tag: { select: { id: true, name: true, color: true } } },
  });
  for (const r of rows) {
    const list = map.get(r.entityId) ?? [];
    list.push(r.tag);
    map.set(r.entityId, list);
  }
  for (const list of map.values()) list.sort((a, b) => a.name.localeCompare(b.name));
  return map;
}

/** IDs de registros que possuem determinada tag (filtro de listas). */
export async function entityIdsWithTag(db: TenantDb, entityType: TaggableEntity, tagName: string): Promise<string[]> {
  const rows = await db.tagAssignment.findMany({
    where: { entityType, tag: { name: { equals: tagName, mode: "insensitive" } } },
    select: { entityId: true },
    take: 5000,
  });
  return rows.map((r) => r.entityId);
}
