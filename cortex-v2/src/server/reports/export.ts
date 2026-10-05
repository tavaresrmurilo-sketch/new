import "server-only";
import { strToU8, zipSync } from "fflate";
import { formatCurrency, formatDate, formatNumber } from "@/lib/format";
import { createPdf, footer, kpiRow, paragraph, table, COLORS } from "@/server/pdf/kit";
import type { CellType, ReportColumn, ReportData, ReportRow } from "./definitions";

/** Valor exibido de uma célula (tela e PDF). */
export function formatCell(value: string | number | null | undefined, type: CellType, currency: string): string {
  if (value === null || value === undefined || value === "") return "—";
  switch (type) {
    case "money":
      return formatCurrency(value, currency);
    case "number":
      return typeof value === "number" ? formatNumber(value, Number.isInteger(value) ? 0 : 1) : String(value);
    case "percent":
      return typeof value === "number" ? `${formatNumber(value, 1)}%` : String(value);
    case "date":
      return formatDate(String(value));
    default:
      return String(value);
  }
}

/** Neutraliza injeção de fórmulas em planilhas (CSV/XLSX abertos no Excel). */
function safeText(v: string) {
  return /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
}

/** CSV no padrão brasileiro: separador “;”, decimal com vírgula, UTF-8 com BOM (abre corretamente no Excel). */
export function toCsv(columns: ReportColumn[], rows: ReportRow[]): Uint8Array {
  const esc = (s: string) => (/[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const cell = (v: string | number | null | undefined, type: CellType) => {
    if (v === null || v === undefined) return "";
    if (typeof v === "number") return String(type === "money" ? v.toFixed(2) : v).replace(".", ",");
    return esc(safeText(String(v)));
  };
  const lines = [columns.map((c) => esc(c.label)).join(";"), ...rows.map((r) => columns.map((c) => cell(r[c.key], c.type)).join(";"))];
  return strToU8(`﻿${lines.join("\r\n")}\r\n`);
}

const xmlEsc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");

function colName(i: number) {
  let s = "";
  let n = i + 1;
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/** XLSX mínimo (OOXML) gerado no servidor: cabeçalho em negrito, números como números, datas ISO. */
export function toXlsx(sheetName: string, columns: ReportColumn[], rows: ReportRow[]): Uint8Array {
  const styleFor = (t: CellType) => (t === "money" ? 2 : t === "percent" ? 3 : 0);
  const cellXml = (ref: string, v: string | number | null | undefined, type: CellType, header = false) => {
    if (v === null || v === undefined || v === "") return "";
    if (!header && typeof v === "number") return `<c r="${ref}" s="${styleFor(type)}"><v>${v}</v></c>`;
    return `<c r="${ref}" t="inlineStr"${header ? ' s="1"' : ""}><is><t xml:space="preserve">${xmlEsc(safeText(String(v)))}</t></is></c>`;
  };
  const header = `<row r="1">${columns.map((c, i) => cellXml(`${colName(i)}1`, c.label, "text", true)).join("")}</row>`;
  const body = rows.map((r, ri) => `<row r="${ri + 2}">${columns.map((c, ci) => cellXml(`${colName(ci)}${ri + 2}`, r[c.key], c.type)).join("")}</row>`).join("");
  const cols = `<cols>${columns.map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${Math.min(60, Math.max(12, c.label.length + 4))}" customWidth="1"/>`).join("")}</cols>`;
  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>${cols}<sheetData>${header}${body}</sheetData></worksheet>`;
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="2"><numFmt numFmtId="164" formatCode="#,##0.00"/><numFmt numFmtId="165" formatCode="0.0&quot;%&quot;"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs></styleSheet>`;
  const name = xmlEsc(sheetName.slice(0, 31).replace(/[\\/?*[\]:]/g, " "));
  return zipSync({
    "[Content_Types].xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`),
    "_rels/.rels": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`),
    "xl/workbook.xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${name}" sheetId="1" r:id="rId1"/></sheets></workbook>`),
    "xl/_rels/workbook.xml.rels": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`),
    "xl/worksheets/sheet1.xml": strToU8(sheet),
    "xl/styles.xml": strToU8(styles),
  });
}

/** PDF tabular do relatório (A4 paisagem quando há muitas colunas). */
export async function toPdf(meta: { title: string; subtitle: string; orgName: string; currency: string }, data: ReportData): Promise<Buffer> {
  const { doc, done } = createPdf({ title: meta.title, author: meta.orgName });
  const x0 = doc.page.margins.left;
  doc.save().rect(0, 0, doc.page.width, 6).fill(COLORS.accent).restore();
  doc.font("Helvetica").fontSize(9).fillColor(COLORS.muted).text(meta.orgName, x0, 48);
  doc.font("Helvetica-Bold").fontSize(18).fillColor(COLORS.ink).text(meta.title);
  doc.font("Helvetica").fontSize(9.5).fillColor(COLORS.muted).text(meta.subtitle);
  doc.moveDown(1);
  if (data.kpis.length) {
    kpiRow(doc, data.kpis.slice(0, 4).map((k) => ({ label: k.label, value: formatCell(k.value === null ? null : Math.round(k.value * 100) / 100, k.type, meta.currency) })));
    doc.moveDown(0.5);
  }
  const cols = data.columns.slice(0, 8);
  if (data.rows.length) {
    table(
      doc,
      cols.map((c) => ({ label: c.label, width: 1 / cols.length, align: c.type === "text" || c.type === "date" ? "left" : "right" })),
      data.rows.slice(0, 1000).map((r) => cols.map((c) => formatCell(r[c.key], c.type, meta.currency))),
      { zebra: true },
    );
    if (data.rows.length > 1000) paragraph(doc, `Exibindo 1.000 de ${data.rows.length} linhas. Exporte em CSV ou XLSX para a lista completa.`, { color: COLORS.muted, size: 8 });
  } else {
    paragraph(doc, "Nenhum registro no período selecionado.", { color: COLORS.muted });
  }
  if (data.columns.length > cols.length) paragraph(doc, `Colunas omitidas no PDF: ${data.columns.slice(8).map((c) => c.label).join(", ")}.`, { color: COLORS.muted, size: 8 });
  if (data.note) {
    doc.moveDown(0.5);
    paragraph(doc, data.note, { color: COLORS.muted, size: 8.5 });
  }
  footer(doc, `${meta.orgName} · ${meta.title} · gerado pelo JR Córtex`);
  doc.end();
  return done;
}
