import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { safeEqual } from "@/server/security/crypto";
import { isJobName, JOBS, runJob, type JobName } from "@/server/jobs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

const DAILY: JobName[] = ["metric-snapshots", "contracts-expiring", "follow-ups", "projects-at-risk", "overdue-tasks", "priority-recompute", "morning-brief", "webhook-retries", "retention"];

/** Jobs agendados. Autenticação: `Authorization: Bearer <CRON_SECRET>` (padrão do Vercel Cron). `daily` executa todos em sequência. */
async function handle(req: Request, { params }: { params: Promise<{ job: string }> }) {
  const secret = env().CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET não configurado" }, { status: 503 });
  const auth = req.headers.get("authorization") ?? "";
  if (!safeEqual(auth, `Bearer ${secret}`)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const { job } = await params;
  if (job === "daily") {
    const results = [];
    for (const j of DAILY) results.push(await runJob(j));
    return NextResponse.json({ results });
  }
  if (!isJobName(job)) return NextResponse.json({ error: "Job desconhecido", jobs: [...Object.keys(JOBS), "daily"] }, { status: 404 });
  return NextResponse.json(await runJob(job));
}

export const GET = handle;
export const POST = handle;
