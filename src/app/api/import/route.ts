import type { ImportTarget } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { audit } from "@/server/audit";
import { apiRoute, enforceRateLimit, requireApi } from "@/server/auth/guard";
import { createImportJob, MAX_FILE_BYTES } from "@/server/cortex/import";
import { TARGET_FIELDS } from "@/server/cortex/mapping";
import { AppError } from "@/server/errors";
import { LIMITS } from "@/server/security/rate-limit";

export const runtime = "nodejs";
const targetSchema = z.enum(["SALES", "EXPENSES", "REVENUES", "CUSTOMERS", "PRODUCTS", "ACCOUNTS_PAYABLE", "ACCOUNTS_RECEIVABLE"]).optional();

/** Etapa 1 da importação: upload + detecção de colunas + mapeamento sugerido. */
export const POST = apiRoute(async (req) => {
  const ctx = await requireApi("import:run");
  enforceRateLimit(`import:${ctx.userId}`, LIMITS.import);
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw new AppError("Envie um arquivo CSV ou XLSX.");
  if (file.size > MAX_FILE_BYTES) throw new AppError("Arquivo maior que 10 MB.");
  if (!/\.(csv|xlsx|txt)$/i.test(file.name)) throw new AppError("Formato não suportado. Envie CSV ou XLSX.");
  const target = targetSchema.parse(form.get("target") || undefined) as ImportTarget | undefined;
  const buffer = Buffer.from(await file.arrayBuffer());
  const { job, duplicateOf } = await createImportJob({ tenantId: ctx.tenantId, userId: ctx.userId, fileName: file.name, mimeType: file.type || "application/octet-stream", buffer, target });
  await audit(ctx, { action: "import.uploaded", resource: "import", resourceId: job.id, metadata: { fileName: file.name, size: file.size, rows: job.totalRows, target: job.target } });
  return NextResponse.json({ job, fields: TARGET_FIELDS[job.target], duplicateOf });
});
