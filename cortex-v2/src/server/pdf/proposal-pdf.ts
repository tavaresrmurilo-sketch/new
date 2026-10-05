import "server-only";
import { formatCurrency, formatDate, formatDocument } from "@/lib/format";
import { calculateProposal } from "@/lib/proposal-math";
import { toNumber } from "@/lib/utils";
import { COLORS, contentWidth, createPdf, footer, hr, paragraph, sectionTitle, table } from "./kit";

export interface ProposalPdfData {
  org: { name: string; legalName: string | null; document: string | null };
  proposal: {
    number: number;
    title: string;
    createdAt: Date;
    validUntil: Date | null;
    scope: string | null;
    notes: string | null;
    currency: string;
    discountType: "PERCENT" | "AMOUNT";
    discountValue: unknown;
    taxes: { name: string; rate: number }[];
    items: { description: string; unit: string | null; quantity: unknown; unitPrice: unknown }[];
  };
  client: { name: string; legalName: string | null; document: string | null; city: string | null; state: string | null };
  contactName: string | null;
  ownerName: string | null;
}

/** PDF profissional da proposta (A4), totais recalculados com a mesma função usada no sistema. */
export async function renderProposalPdf(d: ProposalPdfData): Promise<Buffer> {
  const { doc, done } = createPdf({ title: `Proposta #${d.proposal.number} — ${d.proposal.title}`, author: d.org.name });
  const money = (v: number) => formatCurrency(v, d.proposal.currency);
  const items = d.proposal.items.map((i) => ({ ...i, quantity: toNumber(i.quantity), unitPrice: toNumber(i.unitPrice) }));
  const totals = calculateProposal(items, { type: d.proposal.discountType, value: toNumber(d.proposal.discountValue) }, d.proposal.taxes);
  const w = contentWidth(doc);
  const x0 = doc.page.margins.left;

  // Cabeçalho
  doc.save().rect(0, 0, doc.page.width, 6).fill(COLORS.accent).restore();
  doc.font("Helvetica-Bold").fontSize(16).fillColor(COLORS.ink).text(d.org.name, x0, 56);
  if (d.org.legalName || d.org.document) {
    doc.font("Helvetica").fontSize(8.5).fillColor(COLORS.muted).text([d.org.legalName, d.org.document ? `CNPJ ${formatDocument(d.org.document)}` : null].filter(Boolean).join(" · "));
  }
  doc.font("Helvetica-Bold").fontSize(9).fillColor(COLORS.accent).text(`PROPOSTA COMERCIAL Nº ${d.proposal.number}`, x0, 56, { width: w, align: "right" });
  doc.font("Helvetica").fontSize(8.5).fillColor(COLORS.muted).text(`Emitida em ${formatDate(d.proposal.createdAt)}`, { width: w, align: "right" });
  if (d.proposal.validUntil) doc.text(`Válida até ${formatDate(d.proposal.validUntil)}`, { width: w, align: "right" });
  doc.y = Math.max(doc.y, 110);
  hr(doc, 14);

  doc.font("Helvetica-Bold").fontSize(18).fillColor(COLORS.ink).text(d.proposal.title, { width: w });
  doc.moveDown(0.6);
  doc.font("Helvetica").fontSize(9).fillColor(COLORS.muted).text("PREPARADA PARA", { characterSpacing: 0.6 });
  doc.font("Helvetica-Bold").fontSize(11).fillColor(COLORS.ink).text(d.client.legalName ?? d.client.name);
  const clientMeta = [d.client.document ? formatDocument(d.client.document) : null, [d.client.city, d.client.state].filter(Boolean).join("/") || null, d.contactName ? `A/C ${d.contactName}` : null].filter(Boolean).join(" · ");
  if (clientMeta) doc.font("Helvetica").fontSize(9.5).fillColor(COLORS.muted).text(clientMeta);

  if (d.proposal.scope) {
    sectionTitle(doc, "Escopo");
    paragraph(doc, d.proposal.scope);
  }

  sectionTitle(doc, "Investimento");
  table(
    doc,
    [
      { label: "DESCRIÇÃO", width: 0.46 },
      { label: "UNID.", width: 0.08, align: "center" },
      { label: "QTD.", width: 0.1, align: "right" },
      { label: "VALOR UNIT.", width: 0.17, align: "right" },
      { label: "TOTAL", width: 0.19, align: "right" },
    ],
    items.map((i, idx) => [i.description, i.unit ?? "", String(i.quantity).replace(".", ","), money(i.unitPrice), money(totals.lines[idx] ?? 0)]),
    { zebra: true },
  );

  // Totais
  doc.moveDown(0.5);
  const line = (label: string, value: string, bold = false) => {
    const y = doc.y;
    doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(bold ? 12 : 9.5).fillColor(bold ? COLORS.ink : COLORS.muted);
    doc.text(label, x0 + w * 0.5, y, { width: w * 0.28, align: "right" });
    doc.text(value, x0 + w * 0.78, y, { width: w * 0.22, align: "right" });
    doc.moveDown(bold ? 0.2 : 0.35);
  };
  line("Subtotal", money(totals.subtotal));
  if (totals.discountAmount) line(d.proposal.discountType === "PERCENT" ? `Desconto (${toNumber(d.proposal.discountValue)}%)` : "Desconto", `− ${money(totals.discountAmount)}`);
  for (const t of totals.taxes) line(`${t.name} (${String(t.rate).replace(".", ",")}%)`, money(t.amount));
  doc.moveDown(0.2);
  line("Total", money(totals.total), true);
  doc.x = x0;

  if (d.proposal.notes) {
    sectionTitle(doc, "Condições e observações");
    paragraph(doc, d.proposal.notes);
  }

  // Aceite
  doc.moveDown(2);
  if (doc.y > doc.page.height - 160) doc.addPage();
  const y = doc.y + 30;
  doc.save().moveTo(x0, y).lineTo(x0 + w * 0.42, y).lineWidth(0.6).strokeColor(COLORS.muted).stroke().restore();
  doc.save().moveTo(x0 + w * 0.58, y).lineTo(x0 + w, y).lineWidth(0.6).strokeColor(COLORS.muted).stroke().restore();
  doc.font("Helvetica").fontSize(8.5).fillColor(COLORS.muted);
  doc.text(`${d.org.name}${d.ownerName ? ` — ${d.ownerName}` : ""}`, x0, y + 6, { width: w * 0.42 });
  doc.text(`De acordo — ${d.client.name}`, x0 + w * 0.58, y + 6, { width: w * 0.42 });

  footer(doc, `Proposta nº ${d.proposal.number} · ${d.org.name} · Documento gerado pelo JR Córtex`);
  doc.end();
  return done;
}
