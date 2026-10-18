import { env } from "@/server/env";
import { isJobName, runJob } from "@/server/jobs";
import { isAuthorizedCron } from "@/server/jobs/cron-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const NO_STORE = { "cache-control": "no-store" };

/**
 * Rotinas agendadas: GET /api/cron/{daily|reminders|maintenance}
 * com o cabeçalho Authorization: Bearer $CRON_SECRET (a Vercel Cron envia automaticamente).
 */
export async function GET(req: Request, ctx: RouteContext<"/api/cron/[job]">) {
  const { job } = await ctx.params;
  const secret = env().CRON_SECRET;
  if (!secret) {
    return Response.json({ ok: false, error: "Rotinas desativadas: defina CRON_SECRET no ambiente." }, { status: 401, headers: NO_STORE });
  }
  if (!isAuthorizedCron(req.headers.get("authorization"), secret)) {
    return Response.json({ ok: false, error: "Não autorizado." }, { status: 401, headers: NO_STORE });
  }
  if (!isJobName(job)) {
    return Response.json({ ok: false, error: "Rotina desconhecida." }, { status: 404, headers: NO_STORE });
  }

  const run = await runJob(job, { trigger: "cron" });
  return Response.json(
    { ok: run.status === "success", job: run.job, runId: run.id, status: run.status, durationMs: run.durationMs, result: run.result, errors: run.errors },
    { status: run.status === "success" ? 200 : 500, headers: NO_STORE },
  );
}
