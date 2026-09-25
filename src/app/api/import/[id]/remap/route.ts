import { NextResponse } from "next/server";
import { z } from "zod";
import { apiRoute, requireApi } from "@/server/auth/guard";
import { remapImportJob } from "@/server/cortex/import";
import { TARGET_FIELDS } from "@/server/cortex/mapping";

const schema = z.object({ target: z.enum(["SALES", "EXPENSES", "REVENUES", "CUSTOMERS", "PRODUCTS", "ACCOUNTS_PAYABLE", "ACCOUNTS_RECEIVABLE", "INVOICES", "ORDERS"]) });

export const POST = apiRoute<{ id: string }>(async (req, { id }) => {
  const ctx = await requireApi("import:run");
  const { target } = schema.parse(await req.json());
  const job = await remapImportJob(ctx.tenantId, id, target);
  return NextResponse.json({ job, fields: TARGET_FIELDS[job.target] });
});
