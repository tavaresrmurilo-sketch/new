import { NextResponse } from "next/server";
import { AuthError, assertOrgRole } from "@/server/auth/guards";
import { getSessionUser } from "@/server/auth/session";
import { getPlan } from "@/server/billing/plans";
import { prisma } from "@/server/db";
import { eventDailyHistory, metricsCsv } from "@/server/events/organizer-queries";
import { rateLimit, retryMessage } from "@/server/security/rate-limit";

export const dynamic = "force-dynamic";

/** Exporta as métricas diárias do evento (CSV) — equipe da organização dona, planos com exportação. */
export async function GET(_req: Request, ctx: RouteContext<"/painel/eventos/[id]/estatisticas/csv">) {
  const { id } = await ctx.params;
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Entre na sua conta para exportar." }, { status: 401 });
  const rl = await rateLimit("publicApi", `csv:${user.id}`);
  if (!rl.allowed) return NextResponse.json({ error: retryMessage(rl.retryAfterSeconds) }, { status: 429 });

  const event = await prisma.event.findUnique({ where: { id: id.slice(0, 64) }, select: { organizationId: true, organization: { select: { plan: true } } } });
  if (!event) return NextResponse.json({ error: "Evento não encontrado." }, { status: 404 });
  try {
    await assertOrgRole(user.id, event.organizationId, "EDITOR");
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: "Evento não encontrado." }, { status: 404 });
    throw err;
  }
  const plan = await getPlan(event.organization.plan);
  if (!plan.csvExport) return NextResponse.json({ error: `A exportação em CSV não faz parte do plano ${plan.name}.` }, { status: 403 });

  const history = await eventDailyHistory(event.organizationId, id);
  if (!history) return NextResponse.json({ error: "Evento não encontrado." }, { status: 404 });
  const filename = `mixtour-${history.event.slug}-metricas.csv`.replace(/[^a-z0-9.-]/gi, "-");
  return new NextResponse(metricsCsv(history.rows), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "private, no-store",
    },
  });
}
