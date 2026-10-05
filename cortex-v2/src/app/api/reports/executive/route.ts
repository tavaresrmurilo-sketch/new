import { NextResponse } from "next/server";
import { formatCurrency, formatPercent } from "@/lib/format";
import { can, getCtx } from "@/server/auth/context";
import { audit } from "@/server/audit";
import { hasFeature } from "@/server/billing/feature-gate";
import { comparableWindows, forecastFor, periodFlow, pipelineMetrics, resolvePeriod, stateCounts } from "@/server/modules/analytics";
import { getInsights, getPulse } from "@/server/modules/intelligence";
import { financeSummary } from "@/server/modules/finance";
import { COLORS, createPdf, footer, kpiRow, paragraph, sectionTitle, table } from "@/server/pdf/kit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Relatório Executivo (PDF) do mês corrente — apenas dados reais; seções sem dados são sinalizadas. */
export async function GET() {
  const ctx = await getCtx();
  if (!ctx) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if (!can(ctx, ["reports.read", "finance.read"])) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  if (!hasFeature(ctx, "executive_report")) return NextResponse.json({ error: "Relatório Executivo não está disponível no seu plano." }, { status: 402 });
  const range = resolvePeriod(ctx, "month");
  const win = comparableWindows(range);
  const [cur, prev, state, pipeline, fc, fin, pulse, ins] = await Promise.all([
    periodFlow(ctx, win.cur.start, win.cur.end),
    periodFlow(ctx, win.prev.start, win.prev.end),
    stateCounts(ctx),
    pipelineMetrics(ctx),
    forecastFor(ctx, range),
    financeSummary(ctx, range),
    getPulse(ctx),
    getInsights(ctx),
  ]);
  const money = (v: number) => formatCurrency(v, ctx.org.currency);
  const delta = (a: number, b: number) => (b ? ` (${a >= b ? "+" : ""}${Math.round(((a - b) / b) * 100)}% vs. mesmo intervalo do mês anterior)` : "");
  const { doc, done } = createPdf({ title: `Relatório Executivo — ${ctx.org.name}`, author: ctx.org.name });
  const x0 = doc.page.margins.left;
  doc.save().rect(0, 0, doc.page.width, 6).fill(COLORS.accent).restore();
  doc.font("Helvetica").fontSize(9).fillColor(COLORS.muted).text(ctx.org.name, x0, 48);
  doc.font("Helvetica-Bold").fontSize(20).fillColor(COLORS.ink).text("Relatório Executivo");
  doc.font("Helvetica").fontSize(10).fillColor(COLORS.muted).text(`${range.label} · ${range.startKey.split("-").reverse().join("/")} a ${range.endKey.split("-").reverse().join("/")} · gerado em ${new Date().toLocaleString("pt-BR", { timeZone: ctx.org.timezone })}`);
  doc.moveDown(1);
  kpiRow(doc, [
    { label: "Receita ganha", value: money(cur.wonValue) },
    { label: "Recebido", value: money(fin.received) },
    { label: "MRR contratado", value: money(fin.mrr) },
    { label: "Córtex Pulse", value: pulse.score === null ? "sem dados" : `${pulse.score} · ${pulse.label}` },
  ]);
  sectionTitle(doc, "Comercial");
  paragraph(doc, `Receita ganha: ${money(cur.wonValue)}${delta(cur.wonValue, prev.wonValue)}. Negócios ganhos: ${cur.wonCount}; perdidos: ${cur.lostCount}. Taxa de conversão: ${cur.conversionRate === null ? "sem negócios fechados" : formatPercent(cur.conversionRate)}. Novos leads: ${cur.newLeads}; novas oportunidades: ${cur.newOpps}.`);
  paragraph(doc, `Pipeline aberto: ${money(pipeline.gross)} bruto, ${money(pipeline.weighted)} ponderado, em ${pipeline.count} oportunidades.`);
  if (pipeline.byStage.length) table(doc, [{ label: "Etapa", width: 0.4 }, { label: "Qtd.", width: 0.15, align: "right" }, { label: "Valor", width: 0.225, align: "right" }, { label: "Ponderado", width: 0.225, align: "right" }], pipeline.byStage.map((s) => [s.name, String(s.count), money(s.value), money(s.weighted)]), { zebra: true });
  sectionTitle(doc, "Forecast do mês (estimativa)");
  paragraph(doc, `Já ganho ${money(fc.won)} · conservador ${money(fc.conservative)} · ponderado ${money(fc.weighted)} · otimista ${money(fc.optimistic)}${fc.historical !== null ? ` · histórico ${money(fc.historical)}` : ""}. Confiança ${fc.confidence}. ${fc.notes.join(" ")}`);
  sectionTitle(doc, "Financeiro gerencial");
  paragraph(doc, `Recebido no mês: ${money(fin.received)}. A receber em 30 dias: ${money(fin.next30)}. Vencido: ${money(fin.overdue)} (${fin.overdueCount} recebimento(s)). ARR contratado: ${money(fin.arr)} em ${fin.activeContracts} contrato(s) ativo(s).`);
  sectionTitle(doc, "Operação");
  paragraph(doc, `${state.activeClients} clientes ativos · ${state.activeProjects} projetos em andamento · ${state.overdueTasks} tarefas atrasadas · ${state.openProposals} propostas em aberto (${money(state.openProposalsValue)}).`);
  sectionTitle(doc, "Córtex Pulse");
  for (const c of pulse.components) paragraph(doc, `${c.label} (peso ${c.weight}%): ${c.score ?? "sem dados"} — ${c.explanation}`, { size: 9 });
  sectionTitle(doc, "Insights e anomalias");
  const all = [...ins.anomalies, ...ins.insights];
  if (all.length) for (const i of all.slice(0, 8)) paragraph(doc, `• ${i.title}. Base: ${i.evidence}`, { size: 9 });
  else paragraph(doc, "Ainda não há dados suficientes para conclusões estatísticas.", { color: COLORS.muted });
  footer(doc, `${ctx.org.name} · Relatório Executivo · JR Córtex — números calculados a partir dos registros do sistema`);
  doc.end();
  const pdf = await done;
  await audit(ctx, "report.executive_generated", {});
  return new NextResponse(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="relatorio-executivo-${range.startKey.slice(0, 7)}.pdf"`, "Cache-Control": "private, no-store" } });
}
