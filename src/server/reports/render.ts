import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import { fmt } from "@/lib/format";
import { formatValue } from "@/lib/format-value";
import { neutralizeFormula } from "@/server/security/sanitize";
import type { ReportDoc, ReportTable } from "./builder";

const NAVY = "#12294a";
const GOLD = "#e2a52e";
const MUTED = "#5b6475";

/** Helvetica (WinAnsi) não possui alguns símbolos — normaliza para caracteres suportados. */
function pdfText(s: string): string {
  return s
    .replace(/→/g, "->")
    .replace(/≥/g, ">=")
    .replace(/≤/g, "<=")
    .replace(/−/g, "-")
    .replace(/Σ/g, "Soma")
    .replace(/[⚠️]/g, "")
    .replace(/[^\x20-\x7E -ÿ–—‘’“”•…€]/g, "");
}

function cell(v: string | number | null | undefined, f?: string): string {
  if (f) return formatValue(v as number, f as never);
  return v === null || v === undefined ? "—" : String(v);
}

export async function renderPdf(doc: ReportDoc): Promise<Buffer> {
  const pdf = new PDFDocument({ size: "A4", margins: { top: 90, bottom: 60, left: 48, right: 48 }, bufferPages: true, info: { Title: `${doc.title} — ${doc.tenantName}`, Author: "JR Cortex AI — JR Consultorias" } });
  const chunks: Buffer[] = [];
  pdf.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => pdf.on("end", () => resolve(Buffer.concat(chunks))));
  const width = pdf.page.width - 96;

  // capa / cabeçalho do documento
  pdf.fillColor(NAVY).font("Helvetica-Bold").fontSize(20).text(pdfText(doc.title), 48, 100, { width });
  pdf.moveDown(0.3).font("Helvetica").fontSize(11).fillColor(MUTED).text(pdfText(`${doc.tenantName} · ${doc.period.label} (${fmt.date(doc.period.start)} a ${fmt.date(doc.period.end)})`), { width });
  pdf.text(pdfText(`Gerado em ${fmt.dateTime(doc.generatedAt)} · Fontes: ${doc.sources.map((s) => s.name).join(", ") || "—"}`), { width });
  if (doc.isDemo) {
    pdf.moveDown(0.5).fillColor("#9a6700").font("Helvetica-Bold").fontSize(10).text("DADOS DEMONSTRATIVOS — valores fictícios, não representam uma empresa real.", { width });
  }
  pdf.moveDown(1);

  const ensureSpace = (h: number) => {
    if (pdf.y + h > pdf.page.height - 70) pdf.addPage();
  };

  const drawTable = (t: ReportTable) => {
    if (t.title) {
      ensureSpace(30);
      pdf.font("Helvetica-Bold").fontSize(9.5).fillColor(NAVY).text(pdfText(t.title), 48, pdf.y, { width });
      pdf.moveDown(0.3);
    }
    const n = t.columns.length;
    const firstW = Math.min(width * 0.42, Math.max(width / n, 150));
    const otherW = n > 1 ? (width - firstW) / (n - 1) : width;
    const colX = (i: number) => 48 + (i === 0 ? 0 : firstW + otherW * (i - 1));
    const colW = (i: number) => (i === 0 ? firstW : otherW);
    const header = () => {
      ensureSpace(24);
      const y = pdf.y;
      pdf.rect(48, y, width, 16).fill("#eef1f6");
      pdf.fillColor(MUTED).font("Helvetica-Bold").fontSize(7.5);
      t.columns.forEach((c, i) => pdf.text(pdfText(c.label.toUpperCase()), colX(i) + 4, y + 4.5, { width: colW(i) - 8, align: i === 0 ? "left" : "right", lineBreak: false }));
      pdf.y = y + 18;
    };
    header();
    t.rows.slice(0, 400).forEach((r, ri) => {
      if (pdf.y + 16 > pdf.page.height - 70) {
        pdf.addPage();
        header();
      }
      const y = pdf.y;
      if (ri % 2 === 1) pdf.rect(48, y - 1, width, 14).fill("#f8f9fb");
      pdf.fillColor("#1b2230").font("Helvetica").fontSize(8);
      t.columns.forEach((c, i) => pdf.text(pdfText(cell(r[c.key], c.format)), colX(i) + 4, y + 2, { width: colW(i) - 8, align: i === 0 ? "left" : "right", lineBreak: false, ellipsis: true }));
      pdf.y = y + 14;
    });
    pdf.moveDown(0.8);
  };

  const drawChart = (c: { title: string; data: { label: string; value: number }[] }) => {
    if (!c.data.length) return;
    ensureSpace(170);
    pdf.font("Helvetica-Bold").fontSize(9.5).fillColor(NAVY).text(pdfText(c.title), 48, pdf.y, { width });
    const top = pdf.y + 8;
    const h = 120;
    const max = Math.max(...c.data.map((d) => Math.abs(d.value)), 1);
    const bw = width / c.data.length;
    pdf.moveTo(48, top + h).lineTo(48 + width, top + h).strokeColor("#c9ced8").lineWidth(0.5).stroke();
    c.data.forEach((d, i) => {
      const bh = (Math.max(0, d.value) / max) * (h - 10);
      pdf.roundedRect(48 + i * bw + bw * 0.2, top + h - bh, bw * 0.6, bh, 2).fill("#2a78d6");
      pdf.fillColor(MUTED).font("Helvetica").fontSize(6.5).text(pdfText(d.label), 48 + i * bw, top + h + 3, { width: bw, align: "center", lineBreak: false });
    });
    pdf.fillColor(MUTED).fontSize(6.5).text(pdfText(`máx. ${fmt.money(max)}`), 48, top - 2, { width, align: "right" });
    pdf.y = top + h + 18;
  };

  for (const s of doc.sections) {
    ensureSpace(60);
    pdf.fillColor(NAVY).font("Helvetica-Bold").fontSize(12.5).text(pdfText(s.heading), 48, pdf.y, { width });
    pdf.moveTo(48, pdf.y + 2).lineTo(90, pdf.y + 2).strokeColor(GOLD).lineWidth(1.5).stroke();
    pdf.moveDown(0.7);
    for (const p of s.paragraphs ?? []) {
      pdf.font("Helvetica").fontSize(9.5).fillColor("#1b2230").text(pdfText(p), 48, pdf.y, { width, align: "justify", lineGap: 2 });
      pdf.moveDown(0.5);
    }
    if (s.kpis?.length) {
      const cols = 2;
      const cw = width / cols;
      s.kpis.forEach((k, i) => {
        if (i % cols === 0) ensureSpace(36);
        const x = 48 + (i % cols) * cw;
        const y = pdf.y;
        pdf.roundedRect(x, y, cw - 8, 30, 3).fillAndStroke("#f7f8fb", "#e3e7ee");
        pdf.fillColor(MUTED).font("Helvetica").fontSize(7.5).text(pdfText(k.label), x + 8, y + 5, { width: cw - 24, lineBreak: false });
        pdf.fillColor("#111827").font("Helvetica-Bold").fontSize(10).text(pdfText(k.value), x + 8, y + 15, { width: cw - 24, lineBreak: false, ellipsis: true });
        if (i % cols === cols - 1 || i === s.kpis!.length - 1) pdf.y = y + 36;
        else pdf.y = y;
      });
      pdf.moveDown(0.4);
    }
    for (const b of s.bullets ?? []) {
      ensureSpace(20);
      pdf.font("Helvetica").fontSize(9.5).fillColor("#1b2230").text(pdfText(`•  ${b}`), 56, pdf.y, { width: width - 8, lineGap: 1.5 });
      pdf.moveDown(0.2);
    }
    if (s.bullets?.length) pdf.moveDown(0.5);
    if (s.table) drawTable(s.table);
    if (s.chart) drawChart(s.chart);
    pdf.moveDown(0.6);
  }

  // cabeçalho/rodapé em todas as páginas
  const range = pdf.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    pdf.switchToPage(i);
    pdf.rect(0, 0, pdf.page.width, 56).fill(NAVY);
    pdf.rect(0, 56, pdf.page.width, 3).fill(GOLD);
    pdf.fillColor("#ffffff").font("Helvetica-Bold").fontSize(12).text("JR Cortex AI", 48, 18, { lineBreak: false });
    pdf.fillColor("#c7d2e3").font("Helvetica").fontSize(8).text("JR Consultorias · Inteligência empresarial conectada aos seus dados", 48, 34, { lineBreak: false });
    if (doc.isDemo) pdf.fillColor(GOLD).font("Helvetica-Bold").fontSize(8).text("DADOS DEMONSTRATIVOS", 0, 24, { width: pdf.page.width - 48, align: "right", lineBreak: false });
    pdf.fillColor(MUTED).font("Helvetica").fontSize(7).text(
      pdfText(`Números calculados pelo Cortex a partir da base da empresa. Projeções são estimativas. · Página ${i - range.start + 1} de ${range.count}`),
      48,
      pdf.page.height - 40,
      { width: pdf.page.width - 96, align: "center", lineBreak: false },
    );
  }
  pdf.end();
  return done;
}

export async function renderXlsx(doc: ReportDoc): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "JR Cortex AI";
  wb.created = doc.generatedAt;
  const summary = wb.addWorksheet("Resumo");
  summary.columns = [{ width: 42 }, { width: 60 }];
  summary.addRow([doc.title]).font = { bold: true, size: 14, color: { argb: "FF12294A" } };
  summary.addRow(["Empresa", doc.tenantName]);
  summary.addRow(["Período", `${fmt.date(doc.period.start)} a ${fmt.date(doc.period.end)}`]);
  summary.addRow(["Gerado em", fmt.dateTime(doc.generatedAt)]);
  summary.addRow(["Fontes", doc.sources.map((s) => s.name).join(", ")]);
  if (doc.isDemo) summary.addRow(["Aviso", "DADOS DEMONSTRATIVOS — valores fictícios"]).font = { bold: true, color: { argb: "FF9A6700" } };
  summary.addRow([]);
  for (const s of doc.sections) {
    if (!s.paragraphs?.length && !s.kpis?.length && !s.bullets?.length) continue;
    summary.addRow([s.heading]).font = { bold: true };
    s.paragraphs?.forEach((p) => summary.addRow(["", neutralizeFormula(p)]));
    s.kpis?.forEach((k) => summary.addRow([k.label, neutralizeFormula(k.value)]));
    s.bullets?.forEach((b) => summary.addRow(["", neutralizeFormula(`• ${b}`)]));
    summary.addRow([]);
  }
  const used = new Set<string>();
  doc.sections.forEach((s) => {
    if (!s.table) return;
    let name = (s.table.title ?? s.heading).replace(/[\\/?*[\]:]/g, " ").slice(0, 28);
    while (used.has(name)) name = `${name.slice(0, 26)}_${used.size}`;
    used.add(name);
    const ws = wb.addWorksheet(name);
    ws.columns = s.table.columns.map((c, i) => ({ header: c.label, key: c.key, width: i === 0 ? 40 : 18 }));
    ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF12294A" } };
    s.table.rows.forEach((r) => {
      ws.addRow(
        Object.fromEntries(
          s.table!.columns.map((c) => {
            const v = r[c.key];
            if (typeof v === "number") return [c.key, c.format === "pct" ? v / 100 : v];
            return [c.key, typeof v === "string" ? neutralizeFormula(v) : v];
          }),
        ),
      );
    });
    s.table.columns.forEach((c, i) => {
      const col = ws.getColumn(i + 1);
      if (c.format === "money") col.numFmt = '"R$" #,##0.00;[Red]-"R$" #,##0.00';
      if (c.format === "pct") col.numFmt = "0.0%";
      if (c.format === "int") col.numFmt = "#,##0";
    });
    ws.views = [{ state: "frozen", ySplit: 1 }];
  });
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** CSV no padrão brasileiro (separador ";" e vírgula decimal), com proteção contra injeção de fórmulas. */
export function renderCsv(doc: ReportDoc): string {
  const esc = (v: string) => (/[";\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const lines: string[] = [];
  for (const s of doc.sections) {
    if (!s.table) continue;
    lines.push(esc(s.table.title ?? s.heading));
    lines.push(s.table.columns.map((c) => esc(c.label)).join(";"));
    for (const r of s.table.rows) {
      lines.push(
        s.table.columns
          .map((c) => {
            const v = r[c.key];
            if (typeof v === "number") return String(Math.round(v * 100) / 100).replace(".", ",");
            return esc(neutralizeFormula(String(v ?? "")));
          })
          .join(";"),
      );
    }
    lines.push("");
  }
  return "﻿" + lines.join("\r\n");
}
