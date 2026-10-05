"use server";

import { z } from "zod";
import { defineAction } from "@/server/action";
import { isTrashType, purgeFromTrash, restoreFromTrash } from "@/server/modules/trash";

const schema = z.object({ type: z.string().refine(isTrashType, "Tipo inválido"), id: z.string().min(1) });

export const restoreTrashAction = defineAction({ schema, permission: "trash.manage" }, async ({ type, id }, ctx) => restoreFromTrash(ctx, type as Parameters<typeof restoreFromTrash>[1], id));
export const purgeTrashAction = defineAction({ schema, permission: "trash.manage" }, async ({ type, id }, ctx) => purgeFromTrash(ctx, type as Parameters<typeof purgeFromTrash>[1], id));
