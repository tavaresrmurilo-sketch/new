import { NextResponse, type NextRequest } from "next/server";
import { safeEqual } from "@/server/security/crypto";
import { runScheduledJobs } from "@/server/jobs/scheduler";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Endpoint para cron externo (Vercel Cron, GitHub Actions, crontab). Protegido por CRON_SECRET. */
export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  if (!secret || !safeEqual(auth, `Bearer ${secret}`)) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  return NextResponse.json(await runScheduledJobs());
}
