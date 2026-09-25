import { NextResponse } from "next/server";
import { apiRoute, enforceRateLimit, requireApi } from "@/server/auth/guard";
import { storedSource, testSource } from "@/server/connectors/external";

/** Lista tabelas/views disponíveis na fonte salva (para adicionar novas tabelas). */
export const GET = apiRoute<{ id: string }>(async (_req, { id }) => {
  const ctx = await requireApi("integrations:manage");
  enforceRateLimit(`int-test:${ctx.tenantId}`, { limit: 20, windowMs: 60_000 });
  const r = await testSource(await storedSource(ctx.tenantId, id));
  return NextResponse.json({ ok: r.ok, message: r.message, reason: r.reason, tables: r.tables });
});
