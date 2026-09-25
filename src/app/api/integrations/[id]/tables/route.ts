import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { apiRoute, requireApi } from "@/server/auth/guard";
import { addTables, discoverColumns, endpointInputSchema, storedSource, tableSelectionSchema } from "@/server/connectors/external";
import { NotFoundError } from "@/server/errors";

const columnsSchema = z.object({ action: z.literal("columns"), tables: z.array(z.object({ schema: z.string().max(128).default(""), name: z.string().min(1).max(300) })).min(1).max(200), endpoints: z.array(endpointInputSchema).max(30).default([]) });
const addSchema = z.object({ action: z.literal("add"), tables: z.array(tableSelectionSchema).min(1).max(200), endpoints: z.array(endpointInputSchema).max(30).default([]) });

export const POST = apiRoute<{ id: string }>(async (req, { id }) => {
  const ctx = await requireApi("integrations:manage");
  const integration = await prisma.integration.findFirst({ where: { id, tenantId: ctx.tenantId } });
  if (!integration) throw new NotFoundError("Integração não encontrada.");
  const body = z.discriminatedUnion("action", [columnsSchema, addSchema]).parse(await req.json());
  if (body.action === "columns") {
    let source = await storedSource(ctx.tenantId, id);
    if (source.kind === "rest-api" && body.endpoints.length) source = { ...source, endpoints: [...source.endpoints, ...body.endpoints] };
    return NextResponse.json({ tables: await discoverColumns(source, body.tables) });
  }
  await addTables(ctx, id, body.tables, body.endpoints);
  return NextResponse.json({ ok: true });
});
