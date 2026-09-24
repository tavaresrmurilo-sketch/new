import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { slugify } from "@/lib/utils";
import { analyticsCtx } from "@/server/analytics/base";
import { audit } from "@/server/audit";
import { apiRoute, enforceRateLimit, requireApi } from "@/server/auth/guard";
import { ForbiddenError, NotFoundError } from "@/server/errors";
import { resolvePagePeriod } from "@/server/page-period";
import { buildReport, recordReport, REPORT_TYPES, type ReportType } from "@/server/reports/builder";
import { renderCsv, renderPdf, renderXlsx } from "@/server/reports/render";
import { LIMITS } from "@/server/security/rate-limit";

export const runtime = "nodejs";
const formatSchema = z.enum(["pdf", "xlsx", "csv", "json"]).default("pdf");

export const GET = apiRoute<{ type: string }>(async (req, { type }) => {
  if (!(type in REPORT_TYPES)) throw new NotFoundError("Relatório não encontrado.");
  const reportType = type as ReportType;
  const ctx = await requireApi("reports:view");
  const format = formatSchema.parse(req.nextUrl.searchParams.get("format") ?? undefined);
  if (format !== "json" && !ctx.permissions.has("reports:export")) throw new ForbiddenError("Você não tem permissão para exportar relatórios.");
  if (!ctx.permissions.has(REPORT_TYPES[reportType].permission)) throw new ForbiddenError();
  enforceRateLimit(`export:${ctx.userId}`, LIMITS.export);

  const actx = await analyticsCtx(ctx);
  const params = Object.fromEntries(req.nextUrl.searchParams.entries());
  const period = resolvePagePeriod(params, actx.today, "last_month");
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: ctx.tenantId }, select: { name: true, isDemo: true, aiProviderConsent: true } });
  const doc = await buildReport(reportType, actx, period, { tenantName: tenant.name, isDemo: tenant.isDemo, allowExternalAI: tenant.aiProviderConsent });
  await recordReport(ctx.tenantId, ctx.userId, doc, format.toUpperCase() as "PDF" | "XLSX" | "CSV" | "JSON");
  await audit(ctx, { action: "report.exported", resource: "report", metadata: { type: reportType, format, start: params.start ?? null, end: params.end ?? null, preset: params.period ?? null } });

  const base = `${slugify(doc.title)}-${period.start.toISOString().slice(0, 10)}_${period.end.toISOString().slice(0, 10)}`;
  if (format === "json") return NextResponse.json(doc);
  if (format === "csv") {
    return new NextResponse(renderCsv(doc), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${base}.csv"`, "Cache-Control": "no-store" } });
  }
  if (format === "xlsx") {
    const buf = await renderXlsx(doc);
    return new NextResponse(new Uint8Array(buf), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="${base}.xlsx"`, "Cache-Control": "no-store" } });
  }
  const pdf = await renderPdf(doc);
  return new NextResponse(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${base}.pdf"`, "Cache-Control": "no-store" } });
});
