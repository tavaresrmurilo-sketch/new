"use server";

import { z } from "zod";
import { defineAction, toActionError, type ActionResult } from "@/server/action";
import { assertCan, assertWritable, getCtx } from "@/server/auth/context";
import { deleteDocument, uploadDocument } from "@/server/modules/documents";
import { AppError } from "@/server/errors";
import { revalidatePath } from "next/cache";

const meta = z.object({
  name: z.string().trim().max(200).optional().transform((v) => v || null),
  description: z.string().trim().max(2000).optional().transform((v) => v || null),
  category: z.enum(["CONTRACT", "PROPOSAL", "REPORT", "PROJECT", "IMAGE", "TECHNICAL", "OTHER"]).default("OTHER"),
  clientId: z.string().optional().transform((v) => v || null),
  projectId: z.string().optional().transform((v) => v || null),
  opportunityId: z.string().optional().transform((v) => v || null),
  taskId: z.string().optional().transform((v) => v || null),
  proposalId: z.string().optional().transform((v) => v || null),
  contractId: z.string().optional().transform((v) => v || null),
  meetingId: z.string().optional().transform((v) => v || null),
  sharedWithClient: z.enum(["true", "false"]).optional().transform((v) => v === "true"),
  tags: z.string().max(500).optional().transform((v) => (v ? v.split(",").map((t) => t.trim()).filter(Boolean).slice(0, 20) : [])),
});

/** Upload via FormData (multipart) — validação de tipo, tamanho, limite do plano e vínculo com o tenant. */
export async function uploadDocumentAction(formData: FormData): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await getCtx();
    if (!ctx) throw new AppError("UNAUTHORIZED", "Sessão expirada.");
    assertCan(ctx, "documents.write");
    assertWritable(ctx);
    const file = formData.get("file");
    if (!(file instanceof File)) throw new AppError("VALIDATION", "Selecione um arquivo.");
    const parsed = meta.parse(Object.fromEntries([...formData.entries()].filter(([k]) => k !== "file")));
    const result = await uploadDocument(ctx, { file, ...parsed });
    revalidatePath("/app", "layout");
    return { ok: true, data: result };
  } catch (error) {
    return toActionError(error, "documents.upload");
  }
}

export const deleteDocumentAction = defineAction({ schema: z.object({ id: z.string().min(1) }), permission: "documents.delete" }, async ({ id }, ctx) => deleteDocument(ctx, id));

export const updateDocumentAction = defineAction(
  {
    schema: z.object({ id: z.string().min(1), name: z.string().trim().min(1).max(200), description: z.string().trim().max(2000).nullish(), category: meta.shape.category, sharedWithClient: z.boolean() }),
    permission: "documents.write",
  },
  async ({ id, ...data }, ctx) => {
    const doc = await ctx.db.document.findUnique({ where: { id } });
    if (!doc) throw new AppError("NOT_FOUND", "Documento não encontrado.");
    await ctx.db.document.update({ where: { id }, data });
    return { id };
  },
);
