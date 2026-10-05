import { NextResponse } from "next/server";
import { isPeriodKey, type PeriodKey } from "@/lib/dates";
import { can, getCtx } from "@/server/auth/context";
import { audit } from "@/server/audit";
import { hasFeature } from "@/server/billing/feature-gate";
import { resolvePeriod } from "@/server/modules/analytics";
import { canSeeReport, reportByKey } from "@/server/reports/definitions";
import { toCsv, toPdf, toXlsx } from "@/server/reports/export";
import { enforceRateLimit } from "@/server/security/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request, { params }: { params: Promise<{ key: string }> }) {
  const ctx = await getCtx();
  if (!ctx) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const { key } = await params;
  const def = reportByKey(key);
  if (!def) return NextResponse.json({ error: "Relatório não encontrado" }, { status: 404 });
  if (!canSeeReport(ctx, def) || !can(ctx, "reports.export")) return NextResponse.json({ error: "Sem permissão para exportar" }, { status: 403 });
  const url = new URL(req.url);
  const format = url.searchParams.get("format") ?? "csv";
  if (!["csv", "xlsx", "pdf"].includes(format)) return NextResponse.json({ error: "Formato inválido" }, { status: 400 });
  if (format === "xlsx" && !hasFeature(ctx, "xlsx_export")) return NextResponse.json({ error: "Exportação XLSX não está disponível no seu plano." }, { status: 402 });
  try {
    await enforceRateLimit(`export:${ctx.user.id}`, 30, 60);
  } catch {
    return NextResponse.json({ error: "Muitas exportações em sequência. Aguarde um minuto." }, { status: 429 });
  }
  const p = url.searchParams.get("period");
  const periodKey: PeriodKey = isPeriodKey(p) ? p : "month";
  const range = resolvePeriod(ctx, periodKey, { from: url.searchParams.get("from") ?? undefined, to: url.searchParams.get("to") ?? undefined });
  const data = await def.load(ctx, range);
  const stamp = new Date().toISOString().slice(0, 10);
  const base = `relatorio-${def.key}-${stamp}`;
  await audit(ctx, "report.exported", { entityType: "report", entityId: def.key, metadata: { format, rows: data.rows.length } });
  if (format === "csv") {
    return new NextResponse(new Uint8Array(toCsv(data.columns, data.rows)), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${base}.csv"`, "Cache-Control": "private, no-store" } });
  }
  if (format === "xlsx") {
    return new NextResponse(new Uint8Array(toXlsx(def.title, data.columns, data.rows)), {
      headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="${base}.xlsx"`, "Cache-Control": "private, no-store" },
    });
  }
  const subtitle = def.usesPeriod ? `Período: ${range.startKey.split("-").reverse().join("/")} a ${range.endKey.split("-").reverse().join("/")}` : `Posição em ${new Date().toLocaleDateString("pt-BR", { timeZone: ctx.org.timezone })}`;
  const pdf = await toPdf({ title: `Relatório de ${def.title}`, subtitle, orgName: ctx.org.name, currency: ctx.org.currency }, data);
  return new NextResponse(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${base}.pdf"`, "Cache-Control": "private, no-store" } });
}
