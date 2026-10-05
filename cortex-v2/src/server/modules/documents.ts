import "server-only";
import type { DocumentCategory, Prisma } from "@prisma/client";
import { DOCUMENT_CATEGORY } from "@/lib/labels";
import type { ListParams } from "@/lib/list-params";
import { logActivity } from "@/server/activity";
import { audit } from "@/server/audit";
import type { Ctx } from "@/server/auth/context";
import { assertLimit } from "@/server/billing/feature-gate";
import { assertOwned } from "@/server/db/ownership";
import { AppError, notFound } from "@/server/errors";
import { randomToken, sha256 } from "@/server/security/crypto";
import { setTags, tagsFor } from "@/server/modules/tags";
import { storage, storageFor } from "@/services/storage";

/** Tipos aceitos (a extensão e o MIME precisam corresponder a esta lista). */
export const ALLOWED_TYPES: Record<string, string[]> = {
  "application/pdf": [".pdf"],
  "image/png": [".png"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/webp": [".webp"],
  "text/csv": [".csv"],
  "text/plain": [".txt"],
  "application/msword": [".doc"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
  "application/vnd.ms-excel": [".xls"],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": [".pptx"],
  "application/zip": [".zip"],
  "application/acad": [".dwg"],
  "image/vnd.dwg": [".dwg"],
};

export interface UploadInput {
  file: File;
  name: string | null;
  description: string | null;
  category: DocumentCategory;
  clientId: string | null;
  projectId: string | null;
  opportunityId: string | null;
  taskId: string | null;
  proposalId: string | null;
  contractId: string | null;
  meetingId: string | null;
  sharedWithClient: boolean;
  tags: string[];
}

function safeFileName(name: string) {
  return name.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w.\- ]+/g, "_").slice(0, 150) || "arquivo";
}

export async function uploadDocument(ctx: Ctx, input: UploadInput) {
  const provider = storage();
  const file = input.file;
  if (!file || file.size === 0) throw new AppError("VALIDATION", "Selecione um arquivo.");
  if (file.size > provider.maxFileBytes) throw new AppError("VALIDATION", `Arquivo maior que o limite de ${Math.round(provider.maxFileBytes / 1024 / 1024)} MB.`);
  const ext = `.${file.name.split(".").pop()?.toLowerCase() ?? ""}`;
  const allowed = ALLOWED_TYPES[file.type];
  const extAllowed = Object.values(ALLOWED_TYPES).some((exts) => exts.includes(ext));
  if (!extAllowed || (file.type && allowed && !allowed.includes(ext))) {
    throw new AppError("VALIDATION", "Tipo de arquivo não permitido. Envie PDF, imagens, documentos do Office, CSV, TXT, ZIP ou DWG.");
  }
  await Promise.all([
    assertOwned(ctx, "client", input.clientId),
    assertOwned(ctx, "project", input.projectId),
    assertOwned(ctx, "opportunity", input.opportunityId),
    assertOwned(ctx, "task", input.taskId),
    assertOwned(ctx, "proposal", input.proposalId),
    assertOwned(ctx, "contract", input.contractId),
    assertOwned(ctx, "meeting", input.meetingId),
  ]);
  await assertLimit(ctx, "storage_mb", Math.ceil(file.size / 1024 / 1024));
  const data = Buffer.from(await file.arrayBuffer());
  const fileName = safeFileName(file.name);
  const key = `${ctx.org.id}/${new Date().toISOString().slice(0, 7)}/${randomToken(12)}-${fileName}`;
  await provider.put(key, data, file.type || "application/octet-stream");
  let clientId = input.clientId;
  if (!clientId && input.projectId) clientId = (await ctx.db.project.findUnique({ where: { id: input.projectId }, select: { clientId: true } }))?.clientId ?? null;
  if (!clientId && input.opportunityId) clientId = (await ctx.db.opportunity.findUnique({ where: { id: input.opportunityId }, select: { clientId: true } }))?.clientId ?? null;
  const doc = await ctx.db.document.create({
    data: {
      organizationId: ctx.org.id,
      name: input.name ?? fileName.replace(/\.[^.]+$/, ""),
      description: input.description,
      category: input.category,
      fileName,
      mimeType: file.type || "application/octet-stream",
      sizeBytes: file.size,
      checksum: sha256(data),
      storageProvider: provider.name,
      storageKey: key,
      clientId,
      projectId: input.projectId,
      opportunityId: input.opportunityId,
      taskId: input.taskId,
      proposalId: input.proposalId,
      contractId: input.contractId,
      meetingId: input.meetingId,
      sharedWithClient: input.sharedWithClient,
      uploadedById: ctx.user.id,
    },
  });
  if (input.tags.length) await setTags(ctx.db, ctx.org.id, "document", doc.id, input.tags);
  await logActivity(ctx.db, { organizationId: ctx.org.id, userId: ctx.user.id }, {
    action: "document.uploaded",
    title: `Documento “${doc.name}” enviado (${DOCUMENT_CATEGORY[doc.category]})`,
    entityType: "document",
    entityId: doc.id,
    clientId: doc.clientId,
    projectId: doc.projectId,
    opportunityId: doc.opportunityId,
    taskId: doc.taskId,
  });
  return { id: doc.id };
}

export async function readDocumentFile(doc: { storageProvider: string; storageKey: string }) {
  return storageFor(doc.storageProvider).get(doc.storageKey);
}

export async function deleteDocument(ctx: Ctx, id: string) {
  const doc = await ctx.db.document.findUnique({ where: { id } });
  if (!doc) throw notFound("Documento");
  await ctx.db.document.update({ where: { id }, data: { deletedAt: new Date() } });
  await audit(ctx, "document.deleted", { entityType: "document", entityId: id, metadata: { name: doc.name } });
  return { id };
}

/** Exclusão definitiva (lixeira): remove o arquivo do storage. */
export async function purgeDocumentFile(doc: { storageProvider: string; storageKey: string }) {
  await storageFor(doc.storageProvider).delete(doc.storageKey).catch(() => undefined);
}

export async function listDocuments(ctx: Ctx, params: ListParams) {
  const where: Prisma.DocumentWhereInput = {};
  if (params.q) where.OR = [{ name: { contains: params.q, mode: "insensitive" } }, { fileName: { contains: params.q, mode: "insensitive" } }, { description: { contains: params.q, mode: "insensitive" } }];
  const category = params.get("category");
  if (category) where.category = category as DocumentCategory;
  const client = params.get("client");
  if (client) where.clientId = client;
  const project = params.get("project");
  if (project) where.projectId = project;
  const [rows, total, usage] = await Promise.all([
    ctx.db.document.findMany({
      where,
      orderBy: params.sort === "name" ? { name: params.dir } : params.sort === "sizeBytes" ? { sizeBytes: params.dir } : { createdAt: params.dir },
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
      include: { client: { select: { id: true, name: true } }, project: { select: { id: true, name: true } } },
    }),
    ctx.db.document.count({ where }),
    ctx.db.document.aggregate({ _sum: { sizeBytes: true } }),
  ]);
  const tags = await tagsFor(ctx.db, "document", rows.map((r) => r.id));
  return { rows: rows.map((r) => ({ ...r, tags: tags.get(r.id) ?? [] })), total, usedBytes: usage._sum.sizeBytes ?? 0 };
}
