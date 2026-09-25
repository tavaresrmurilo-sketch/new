import { NextResponse, type NextRequest } from "next/server";
import { safeEqual } from "@/server/security/crypto";
import { runScheduledJobs } from "@/server/jobs/scheduler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Endpoint para cron externo. Vercel Cron chama via GET com "Authorization: Bearer $CRON_SECRET";
 * GitHub Actions/crontab podem usar POST. Sem CRON_SECRET configurado, nada é executado.
 */
async function handle(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  if (!secret || !safeEqual(auth, `Bearer ${secret}`)) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  return NextResponse.json(await runScheduledJobs());
}

export const GET = handle;
export const POST = handle;
