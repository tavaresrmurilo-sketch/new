import "server-only";
import type { Prisma } from "@prisma/client";
import type { Ctx } from "@/server/auth/context";
import { emailDomain, onlyDigits } from "@/server/security/sanitize";

const LEGAL_SUFFIXES = /\b(ltda|ltd|s\/?a|sa|me|epp|eireli|mei|inc|cia|companhia|grupo)\b\.?/g;

export function normalizeName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(LEGAL_SUFFIXES, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function bigrams(s: string): string[] {
  const t = ` ${s} `;
  const out: string[] = [];
  for (let i = 0; i < t.length - 1; i++) out.push(t.slice(i, i + 2));
  return out;
}

/** Coeficiente de Dice sobre bigramas (0–1) para nomes normalizados. */
export function nameSimilarity(a: string, b: string): number {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const A = bigrams(na);
  const B = bigrams(nb);
  const counts = new Map<string, number>();
  for (const x of A) counts.set(x, (counts.get(x) ?? 0) + 1);
  let inter = 0;
  for (const x of B) {
    const c = counts.get(x) ?? 0;
    if (c > 0) {
      inter++;
      counts.set(x, c - 1);
    }
  }
  return (2 * inter) / (A.length + B.length);
}

export interface DuplicateCandidate {
  entity: "client" | "lead";
  id: string;
  name: string;
  reasons: string[];
}

interface Probe {
  name: string;
  email?: string | null;
  phone?: string | null;
  document?: string | null;
  domain?: string | null;
}

const phoneKey = (p: string | null | undefined) => {
  const d = onlyDigits(p);
  return d && d.length >= 8 ? d.slice(-8) : null;
};

function compare(probe: Probe, row: { name: string; email?: string | null; phone?: string | null; document?: string | null; domain?: string | null }): string[] {
  const reasons: string[] = [];
  if (probe.email && row.email && probe.email.toLowerCase() === row.email.toLowerCase()) reasons.push("mesmo e-mail");
  const pk = phoneKey(probe.phone);
  if (pk && pk === phoneKey(row.phone)) reasons.push("mesmo telefone");
  const doc = onlyDigits(probe.document);
  if (doc && doc === onlyDigits(row.document)) reasons.push(doc.length === 14 ? "mesmo CNPJ" : "mesmo documento");
  const domain = probe.domain ?? emailDomain(probe.email);
  const rowDomain = row.domain ?? emailDomain(row.email);
  if (domain && rowDomain && domain === rowDomain) reasons.push("mesmo domínio");
  const sim = nameSimilarity(probe.name, row.name);
  if (sim >= 0.85) reasons.push(sim === 1 ? "mesmo nome" : `nome semelhante (${Math.round(sim * 100)}%)`);
  return reasons;
}

function firstWord(name: string) {
  return normalizeName(name).split(" ").find((w) => w.length >= 3) ?? normalizeName(name).slice(0, 3);
}

/** Busca possíveis duplicatas (nunca mescla — apenas sugere). */
export async function findDuplicates(ctx: Ctx, probe: Probe, opts: { excludeClientId?: string; excludeLeadId?: string; includeLeads?: boolean } = {}): Promise<DuplicateCandidate[]> {
  const word = firstWord(probe.name);
  const doc = onlyDigits(probe.document);
  const domain = probe.domain ?? emailDomain(probe.email);
  const phone = phoneKey(probe.phone);
  const clientOr: Prisma.ClientWhereInput[] = [];
  if (word) clientOr.push({ name: { contains: word, mode: "insensitive" } });
  if (probe.email) clientOr.push({ email: { equals: probe.email, mode: "insensitive" } });
  if (doc) clientOr.push({ document: doc });
  if (domain) clientOr.push({ domain });
  if (phone) clientOr.push({ phone: { contains: phone } });
  const out: DuplicateCandidate[] = [];
  if (clientOr.length) {
    const clients = await ctx.db.client.findMany({
      where: { OR: clientOr, ...(opts.excludeClientId ? { id: { not: opts.excludeClientId } } : {}) },
      select: { id: true, name: true, email: true, phone: true, document: true, domain: true },
      take: 60,
    });
    for (const c of clients) {
      const reasons = compare(probe, c);
      if (reasons.length) out.push({ entity: "client", id: c.id, name: c.name, reasons });
    }
  }
  if (opts.includeLeads) {
    const leadOr: Prisma.LeadWhereInput[] = [];
    if (word) leadOr.push({ name: { contains: word, mode: "insensitive" } }, { companyName: { contains: word, mode: "insensitive" } });
    if (probe.email) leadOr.push({ email: { equals: probe.email, mode: "insensitive" } });
    if (phone) leadOr.push({ phone: { contains: phone } });
    if (leadOr.length) {
      const leads = await ctx.db.lead.findMany({
        where: { OR: leadOr, status: { not: "CONVERTED" }, ...(opts.excludeLeadId ? { id: { not: opts.excludeLeadId } } : {}) },
        select: { id: true, name: true, companyName: true, email: true, phone: true },
        take: 60,
      });
      for (const l of leads) {
        const reasons = [...new Set([...compare(probe, l), ...(l.companyName ? compare(probe, { name: l.companyName }) : [])])];
        if (reasons.length) out.push({ entity: "lead", id: l.id, name: l.companyName ? `${l.name} (${l.companyName})` : l.name, reasons });
      }
    }
  }
  return out.slice(0, 10);
}

/** Registra cada possível duplicata como decisão pendente na Central de Decisões. */
export async function recordDuplicateDecisions(
  ctx: Ctx,
  subject: { entity: "client" | "lead"; id: string; name: string },
  candidates: DuplicateCandidate[],
) {
  for (const c of candidates) {
    if (c.entity !== subject.entity) continue;
    const [a, b] = [subject.id, c.id].sort();
    await ctx.db.decision.upsert({
      where: { organizationId_dedupeKey: { organizationId: ctx.org.id, dedupeKey: `dup:${subject.entity}:${a}:${b}` } },
      create: {
        organizationId: ctx.org.id,
        type: "RESOLVE_DUPLICATE",
        title: `Possível ${subject.entity === "client" ? "cliente" : "lead"} duplicado: ${subject.name} × ${c.name}`,
        description: `Critérios: ${c.reasons.join(", ")}. Nada será mesclado sem sua confirmação.`,
        payload: { entity: subject.entity, keepId: c.id, mergeId: subject.id, keepName: c.name, mergeName: subject.name, reasons: c.reasons },
        entityType: subject.entity,
        entityId: subject.id,
        source: "SYSTEM",
        dedupeKey: `dup:${subject.entity}:${a}:${b}`,
        createdById: ctx.user.id,
      },
      update: {},
    });
  }
}
