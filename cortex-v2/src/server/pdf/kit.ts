import "server-only";
import PDFDocument from "pdfkit";

export const COLORS = { ink: "#18181b", muted: "#71717a", line: "#e4e4e7", accent: "#4f46e5", soft: "#f4f4f5", danger: "#dc2626", success: "#16a34a", warning: "#d97706" };

export type Doc = InstanceType<typeof PDFDocument>;

/** Cria um documento A4 e devolve um Buffer quando `end()` é chamado. */
export function createPdf(meta: { title: string; author: string }) {
  const doc = new PDFDocument({ size: "A4", margins: { top: 56, bottom: 56, left: 50, right: 50 }, info: { Title: meta.title, Author: meta.author, Creator: "JR Córtex" }, bufferPages: true });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
  return { doc, done };
}

export function contentWidth(doc: Doc) {
  return doc.page.width - doc.page.margins.left - doc.page.margins.right;
}

export function ensureSpace(doc: Doc, height: number) {
  if (doc.y + height > doc.page.height - doc.page.margins.bottom) doc.addPage();
}

export function hr(doc: Doc, gap = 10) {
  doc.moveDown(0.3);
  const y = doc.y;
  doc.save().moveTo(doc.page.margins.left, y).lineTo(doc.page.width - doc.page.margins.right, y).lineWidth(0.6).strokeColor(COLORS.line).stroke().restore();
  doc.y = y + gap;
}

export function sectionTitle(doc: Doc, text: string) {
  ensureSpace(doc, 40);
  doc.moveDown(0.6);
  doc.font("Helvetica-Bold").fontSize(11).fillColor(COLORS.ink).text(text.toUpperCase(), { characterSpacing: 0.6 });
  doc.moveDown(0.3);
}

export function paragraph(doc: Doc, text: string, opts: { color?: string; size?: number } = {}) {
  doc.font("Helvetica").fontSize(opts.size ?? 10).fillColor(opts.color ?? COLORS.ink).text(text, { lineGap: 2.5, align: "left" });
}

export interface Column {
  label: string;
  width: number;
  align?: "left" | "right" | "center";
}

/** Tabela simples com cabeçalho repetido em quebras de página. */
export function table(doc: Doc, columns: Column[], rows: string[][], opts: { zebra?: boolean } = {}) {
  const x0 = doc.page.margins.left;
  const totalW = contentWidth(doc);
  const widths = columns.map((c) => (c.width <= 1 ? c.width * totalW : c.width));
  const drawHeader = () => {
    const y = doc.y;
    doc.save().rect(x0, y, totalW, 20).fill(COLORS.soft).restore();
    let x = x0;
    doc.font("Helvetica-Bold").fontSize(8.5).fillColor(COLORS.muted);
    columns.forEach((c, i) => {
      doc.text(c.label, x + 6, y + 6, { width: widths[i]! - 12, align: c.align ?? "left" });
      x += widths[i]!;
    });
    doc.y = y + 22;
  };
  drawHeader();
  rows.forEach((row, ri) => {
    doc.font("Helvetica").fontSize(9.5);
    const heights = row.map((cell, i) => doc.heightOfString(cell, { width: widths[i]! - 12 }));
    const h = Math.max(...heights) + 10;
    if (doc.y + h > doc.page.height - doc.page.margins.bottom) {
      doc.addPage();
      drawHeader();
    }
    const y = doc.y;
    if (opts.zebra && ri % 2 === 1) doc.save().rect(x0, y, totalW, h).fill("#fafafa").restore();
    let x = x0;
    row.forEach((cell, i) => {
      doc.font("Helvetica").fontSize(9.5).fillColor(COLORS.ink).text(cell, x + 6, y + 5, { width: widths[i]! - 12, align: columns[i]!.align ?? "left" });
      x += widths[i]!;
    });
    doc.save().moveTo(x0, y + h).lineTo(x0 + totalW, y + h).lineWidth(0.4).strokeColor(COLORS.line).stroke().restore();
    doc.y = y + h;
  });
  doc.x = x0;
}

/** Rodapé com numeração em todas as páginas. */
export function footer(doc: Doc, text: string) {
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const y = doc.page.height - 36;
    doc.font("Helvetica").fontSize(7.5).fillColor(COLORS.muted);
    doc.text(text, doc.page.margins.left, y, { width: contentWidth(doc) * 0.75, lineBreak: false });
    doc.text(`Página ${i + 1} de ${range.count}`, doc.page.margins.left, y, { width: contentWidth(doc), align: "right", lineBreak: false });
  }
}

export function kpiRow(doc: Doc, items: { label: string; value: string }[]) {
  ensureSpace(doc, 60);
  const x0 = doc.page.margins.left;
  const w = contentWidth(doc);
  const gap = 8;
  const boxW = (w - gap * (items.length - 1)) / items.length;
  const y = doc.y;
  items.forEach((it, i) => {
    const x = x0 + i * (boxW + gap);
    doc.save().roundedRect(x, y, boxW, 50, 4).lineWidth(0.6).strokeColor(COLORS.line).stroke().restore();
    doc.font("Helvetica").fontSize(7.5).fillColor(COLORS.muted).text(it.label, x + 8, y + 8, { width: boxW - 16 });
    doc.font("Helvetica-Bold").fontSize(13).fillColor(COLORS.ink).text(it.value, x + 8, y + 24, { width: boxW - 16 });
  });
  doc.y = y + 60;
  doc.x = x0;
}
