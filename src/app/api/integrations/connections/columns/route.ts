import { NextResponse } from "next/server";
import { z } from "zod";
import { apiRoute, enforceRateLimit, requireApi } from "@/server/auth/guard";
import { discoverColumns, sourceSchema } from "@/server/connectors/external";

const schema = z.object({ source: sourceSchema, tables: z.array(z.object({ schema: z.string().max(128).default(""), name: z.string().min(1).max(300) })).min(1).max(200) });

/** Lê metadados das colunas das tabelas escolhidas e sugere mapeamento (fonte ainda não salva). */
export const POST = apiRoute(async (req) => {
  const ctx = await requireApi("integrations:manage");
  enforceRateLimit(`int-cols:${ctx.tenantId}`, { limit: 30, windowMs: 60_000 });
  const { source, tables } = schema.parse(await req.json());
  return NextResponse.json({ tables: await discoverColumns(source, tables) });
});
