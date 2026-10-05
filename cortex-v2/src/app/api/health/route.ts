import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Health check para monitoramento (não expõe configuração). */
export async function GET() {
  const started = Date.now();
  const db = await prisma.$queryRaw`SELECT 1`.then(() => true).catch(() => false);
  return NextResponse.json({ status: db ? "ok" : "degraded", database: db ? "up" : "down", latencyMs: Date.now() - started, time: new Date().toISOString() }, { status: db ? 200 : 503 });
}
