import "server-only";
import { Prisma } from "@prisma/client";
import type { Permission } from "@/lib/permissions";
import { audit } from "@/server/audit";
import { can, type Ctx } from "@/server/auth/context";
import type { TenantDb } from "@/server/db/tenant";
import { AppError, notFound } from "@/server/errors";
import { purgeDocumentFile } from "@/server/modules/documents";

/** Tipos com lixeira: campo exibido, rótulo e permissão de leitura do módulo. */
export const TRASH_TYPES = {
  lead: { label: "Lead", field: "name", perm: "leads.read" },
  client: { label: "Cliente", field: "name", perm: "clients.read" },
  contact: { label: "Contato", field: "name", perm: "clients.read" },
  opportunity: { label: "Oportunidade", field: "title", perm: "opportunities.read" },
  project: { label: "Projeto", field: "name", perm: "projects.read" },
  task: { label: "Tarefa", field: "title", perm: "tasks.read" },
  meeting: { label: "Reunião", field: "title", perm: "meetings.read" },
  proposal: { label: "Proposta", field: "title", perm: "proposals.read" },
  contract: { label: "Contrato", field: "title", perm: "contracts.read" },
  receivable: { label: "Recebimento", field: "description", perm: "finance.read" },
  document: { label: "Documento", field: "name", perm: "documents.read" },
  risk: { label: "Risco", field: "title", perm: "projects.read" },
  memoryFact: { label: "Memória", field: "content", perm: "clients.read" },
  automation: { label: "Automação", field: "name", perm: "automations.manage" },
  playbook: { label: "Playbook", field: "name", perm: "playbooks.manage" },
} as const satisfies Record<string, { label: string; field: string; perm: Permission }>;

export type TrashType = keyof typeof TRASH_TYPES;
export const isTrashType = (v: unknown): v is TrashType => typeof v === "string" && v in TRASH_TYPES;

type Delegate = {
  findMany: (args: unknown) => Promise<Record<string, unknown>[]>;
  findFirst: (args: unknown) => Promise<Record<string, unknown> | null>;
  count: (args: unknown) => Promise<number>;
  update: (args: unknown) => Promise<unknown>;
  delete: (args: unknown) => Promise<unknown>;
  deleteMany: (args: unknown) => Promise<{ count: number }>;
};
const delegate = (db: TenantDb, type: TrashType) => (db as unknown as Record<string, Delegate>)[type]!;

export interface TrashItem {
  type: TrashType;
  id: string;
  title: string;
  deletedAt: Date;
}

export async function listTrash(ctx: Ctx, type?: TrashType) {
  const types = (Object.keys(TRASH_TYPES) as TrashType[]).filter((t) => (!type || t === type) && can(ctx, TRASH_TYPES[t].perm));
  const results = await Promise.all(
    types.map(async (t) => {
      const field = TRASH_TYPES[t].field;
      const rows = await delegate(ctx.db, t).findMany({ where: { deletedAt: { not: null } }, select: { id: true, [field]: true, deletedAt: true }, orderBy: { deletedAt: "desc" }, take: 100 });
      const count = await delegate(ctx.db, t).count({ where: { deletedAt: { not: null } } });
      return { type: t, count, rows: rows.map((r) => ({ type: t, id: String(r.id), title: String(r[field] ?? "").slice(0, 160), deletedAt: r.deletedAt as Date })) };
    }),
  );
  const items = results.flatMap((r) => r.rows).sort((a, b) => b.deletedAt.getTime() - a.deletedAt.getTime());
  return { items, counts: Object.fromEntries(results.map((r) => [r.type, r.count])) as Record<TrashType, number> };
}

export async function restoreFromTrash(ctx: Ctx, type: TrashType, id: string) {
  const d = delegate(ctx.db, type);
  const row = await d.findFirst({ where: { id, deletedAt: { not: null } }, select: { id: true } });
  if (!row) throw notFound("Item da lixeira");
  await d.update({ where: { id }, data: { deletedAt: null } });
  await audit(ctx, "trash.restored", { entityType: type, entityId: id });
  return { id };
}

/** Exclusão definitiva (irreversível). Registros com vínculos ativos não podem ser removidos. */
export async function purgeFromTrash(ctx: Ctx, type: TrashType, id: string) {
  const d = delegate(ctx.db, type);
  const row = await d.findFirst({ where: { id, deletedAt: { not: null } } });
  if (!row) throw notFound("Item da lixeira");
  try {
    await d.delete({ where: { id } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && (error.code === "P2003" || error.code === "P2014")) {
      throw new AppError("CONFLICT", "Este registro ainda possui vínculos (ex.: contatos, propostas ou tarefas). Remova ou restaure os vínculos antes de excluir definitivamente.");
    }
    throw error;
  }
  if (type === "document") await purgeDocumentFile(row as { storageProvider: string; storageKey: string });
  await audit(ctx, "trash.purged", { entityType: type, entityId: id, metadata: { title: String(row[TRASH_TYPES[type].field] ?? "").slice(0, 160) } });
  return { id };
}

/** Job de retenção: remove definitivamente itens na lixeira há mais de N dias (ignora os que têm vínculos). */
export async function purgeExpiredTrash(db: TenantDb, olderThan: Date) {
  let purged = 0;
  for (const type of Object.keys(TRASH_TYPES) as TrashType[]) {
    const d = delegate(db, type);
    const rows = await d.findMany({ where: { deletedAt: { lt: olderThan } }, take: 500 });
    for (const row of rows) {
      try {
        await d.delete({ where: { id: row.id } });
        if (type === "document") await purgeDocumentFile(row as { storageProvider: string; storageKey: string });
        purged++;
      } catch {
        // possui vínculos: permanece na lixeira até que sejam resolvidos
      }
    }
  }
  return purged;
}
